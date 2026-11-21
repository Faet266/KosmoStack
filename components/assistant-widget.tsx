"use client"

import { ExportMenu } from "@/components/export-menu"

import { useEffect, useRef, useState, type FormEvent, type PointerEvent as ReactPointerEvent } from "react"
import useSWR from "swr"
import { usePathname } from "next/navigation"
import { ArrowDown, ArrowUp, ArrowUpRight, Bot, Check, Copy, FileText, MessageSquarePlus, Rocket, RotateCw, Square, X } from "lucide-react"
import { isArea } from "@/lib/research"
import { useWorkspaceTheme } from "@/components/workspace-theme"

type Source = { title: string; url: string }
type Message = { role: "user" | "assistant"; content: string; sources?: Source[]; scope?: string }
type Prompt = {
  question: string; documentId: string; area: string; view: string | null; workspaceId: string
  history: Pick<Message, "role" | "content">[]
}
type Event = { type: "sources"; sources: Source[]; model: string } | { type: "text"; text: string } |
  { type: "done" } | { type: "error"; error: string }
type Offset = { right: number; bottom: number }
const normal: Offset = { right: 24, bottom: 24 }
const clamp = (value: number, max: number) => Math.max(10, Math.min(value, Math.max(10, max - 66)))
function bound(value: Offset) {
  return { right: clamp(value.right, window.innerWidth), bottom: clamp(value.bottom, window.innerHeight) }
}

async function getDocuments(url: string): Promise<{ documents: Array<{ id: string; name: string }> }> {
  const response = await fetch(url)
  if (!response.ok) throw Error("Не удалось загрузить список PDF.")
  return response.json()
}

export function AssistantWidget() {
  const { light } = useWorkspaceTheme()
  const pathname=usePathname()
  const currentWorkspace=pathname.match(/^\/cabinet\/([a-f0-9-]{36})(?:\/|$)/iu)?.[1] ?? ""
  const [context,setContext] = useState<{path:string;id:string}>()
  const workspaceId=context?.path===pathname?context.id:currentWorkspace
  const [open, setOpen] = useState(false)
  const [offset, setOffset] = useState(normal)
  const [messages, setMessages] = useState<Message[]>([])
  const [question, setQuestion] = useState("")
  const [selection,setDocument]=useState({scope:"",id:""})
  const documentId=selection.scope===workspaceId?selection.id:""
  function setDocumentId(id:string,scope=workspaceId) {setDocument({scope,id})}
  const [model, setModel] = useState("")
  const [pending, setPending] = useState(false)
  const [error, setError] = useState("")
  const {data:owned}=useSWR<{areas:{id:string;name:string}[]}>(open?"/api/workspaces":null,async(url:string)=>{
    const response=await fetch(url)
    if (!response.ok) throw Error("Не удалось загрузить личные области.")
    return response.json()
  })
  const workspaceName=owned?.areas?.find((item)=>item.id===workspaceId)?.name
  const docsUrl=workspaceId?"/api/workspaces/"+workspaceId:"/api/documents"
  const { data, error: documentsError } = useSWR(open ? [docsUrl,"assistant-documents"] as const : null,
    ([url])=>getDocuments(url), { revalidateOnFocus:false,refreshInterval:workspaceId?4000:0 })
  const launcher = useRef<HTMLButtonElement>(null)
  const editor = useRef<HTMLTextAreaElement>(null)
  const log = useRef<HTMLDivElement>(null)
  const request = useRef<AbortController | null>(null)
  const lastPrompt = useRef<{ prompt: Prompt; index: number } | null>(null)
  const follow = useRef(true)
  const [atBottom, setAtBottom] = useState(true)
  const drag = useRef<{ x: number; y: number; offset: Offset; moved: boolean } | null>(null)
  const skipClick = useRef(false)

  useEffect(() => {
    try {
      const old = JSON.parse(localStorage.getItem("kosmostack-rocket-position") ?? "null") as Offset | null
      if (old && Number.isFinite(old.right) && Number.isFinite(old.bottom)) setOffset(bound(old))
    } catch {}
    const resize = () => setOffset((current) => bound(current))
    window.addEventListener("resize", resize)
    return () => {
      window.removeEventListener("resize", resize)
      request.current?.abort()
    }
  }, [])
  useEffect(() => {
    const discuss = (event: globalThis.Event) => {
      const detail=(event as CustomEvent<{id?:string;workspace?:string}>).detail
      if (detail?.workspace) {
        if (detail.workspace!==workspaceId) resetChat()
        setContext({path:pathname,id:detail.workspace})
        setDocumentId(detail.id??"",detail.workspace)
      } else if (detail?.id) {
        if (workspaceId) resetChat()
        setContext({path:pathname,id:""})
        setDocumentId(detail.id,"")
      }
      setOpen(true)
    }
    window.addEventListener("kosmostack-assistant",discuss)
    return ()=>window.removeEventListener("kosmostack-assistant",discuss)
  },[pathname,workspaceId])
  useEffect(() => {
    if (!open) return
    follow.current = true
    setAtBottom(true)
    editor.current?.focus()
    function escape(event: KeyboardEvent) {
      if (event.key !== "Escape" || !document.getElementById("kosmos-chat")?.contains(document.activeElement)) return
      setOpen(false)
      window.requestAnimationFrame(() => launcher.current?.focus())
    }
    window.addEventListener("keydown", escape)
    return () => window.removeEventListener("keydown", escape)
  }, [open])
  useEffect(() => {
    const node = log.current
    if (node && follow.current) node.scrollTop = node.scrollHeight
  }, [messages, open])

  function startDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    if (event.button !== 0) return
    skipClick.current = false
    drag.current = { x: event.clientX, y: event.clientY, offset, moved: false }
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  function move(event: ReactPointerEvent<HTMLButtonElement>) {
    const current = drag.current
    if (!current) return
    const x = event.clientX - current.x
    const y = event.clientY - current.y
    if (!current.moved && Math.hypot(x, y) < 6) return
    current.moved = true
    setOffset(bound({ right: current.offset.right - x, bottom: current.offset.bottom - y }))
  }
  function endDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    const current = drag.current
    if (!current) return
    drag.current = null
    skipClick.current = current.moved
    if (current.moved) {
      const next = bound({ right: current.offset.right - (event.clientX - current.x), bottom: current.offset.bottom - (event.clientY - current.y) })
      setOffset(next)
      try { localStorage.setItem("kosmostack-rocket-position", JSON.stringify(next)) } catch {}
    }
  }

  function send(text: string) {
    const value = text.trim()
    if (!value || request.current) return
    const location = new URL(window.location.href)
    const requestedArea = location.searchParams.get("area") ?? (location.pathname.startsWith("/research/") ? location.pathname.split("/")[2] : "") ?? ""
    const prompt: Prompt = {
      question: value, documentId, workspaceId, area: isArea(requestedArea) ? requestedArea : "",
      view: location.searchParams.get("view"),
      history: messages.filter((message) => message.content.trim() && message.scope===workspaceId).slice(-6).map(({ role, content }) => ({ role, content })),
    }
    const index = messages.length + 1
    lastPrompt.current = { prompt, index }
    setMessages((current) => [...current, { role: "user", content: value, scope:workspaceId }, { role: "assistant", content: "", scope:workspaceId }])
    setQuestion("")
    void streamReply(prompt, index)
  }

  function retry() {
    const previous = lastPrompt.current
    if (request.current || !previous || previous.prompt.workspaceId!==workspaceId) return
    setMessages((current) => current.map((message, index) => index === previous.index ?
      { ...message, content: "", sources:undefined } : message))
    void streamReply(previous.prompt, previous.index)
  }

  function resetChat() {
    const running = request.current
    request.current = null
    lastPrompt.current = null
    running?.abort()
    setMessages([])
    setQuestion("")
    setError("")
    setPending(false)
    setDocumentId("")
    scrollToBottom()
    editor.current?.focus()
  }

  function scrollToBottom() {
    follow.current = true
    setAtBottom(true)
    if (log.current) log.current.scrollTop = log.current.scrollHeight
  }

  async function streamReply(prompt: Prompt, index: number) {
    const controller = new AbortController()
    request.current = controller
    scrollToBottom()
    setPending(true)
    setError("")
    try {
      const response = await fetch("/api/assistant", {
        method: "POST", headers: { "Content-Type": "application/json" }, signal: controller.signal,
        body: JSON.stringify(prompt),
      })
      if (!response.ok || !response.body) {
        const failure = await response.json().catch(() => null)
        throw new Error(failure?.error ?? "Ассистент недоступен.")
      }
      const reader = response.body.pipeThrough(new TextDecoderStream()).getReader()
      let buffer = ""
      let complete = false
      function accept(line: string) {
        if (request.current !== controller || controller.signal.aborted) return
        const event = JSON.parse(line) as Event
        if (event.type === "error") throw new Error(event.error)
        if (event.type === "done") complete = true
        if (event.type === "sources") setModel(event.model)
        if (event.type === "text" || event.type === "sources") {
          setMessages((current) => current.map((message, position) => position !== index ? message :
            event.type === "text" ? { ...message, content: message.content + event.text } : { ...message, sources: event.sources }))
        }
      }
      try {
        for (;;) {
          const result = await reader.read()
          if (result.done) break
          buffer += result.value
          const lines = buffer.split("\n")
          buffer = lines.pop() ?? ""
          for (const line of lines) if (line.trim()) accept(line)
        }
        if (buffer.trim()) accept(buffer)
        if (!complete) throw new Error("Ответ прервался. Повторите вопрос.")
      } finally {
        await reader.cancel().catch(() => undefined)
      }
    } catch (error) {
      if (request.current === controller) {
        setError(controller.signal.aborted ? "Ответ остановлен." : error instanceof Error ? error.message : "Не удалось получить ответ.")
      }
    } finally {
      if (request.current === controller) {
        request.current = null
        setPending(false)
      }
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    send(question)
  }
  function close() {
    setOpen(false)
    window.requestAnimationFrame(() => launcher.current?.focus())
  }

  return <div className={`evidence-workspace ws-assistant-root ${light ? "theme-light" : "theme-dark"}`}>
    <button ref={launcher} className="ws-rocket" type="button" style={offset}
      aria-label="Открыть чат-ассистент KosmoStack" title="Чат-ассистент · ракету можно перетащить"
      aria-expanded={open} aria-controls={open ? "kosmos-chat" : undefined} onPointerDown={startDrag} onPointerMove={move}
      onPointerUp={endDrag} onPointerCancel={() => { drag.current = null }}
      onClick={(event) => { if (skipClick.current && event.detail) { skipClick.current = false; return } setOpen(true) }}>
      <Rocket aria-hidden="true" />
      {pending && <span className="ws-rocket-status" aria-label="Ассистент отвечает" />}
    </button>
    {open && <section className="ws-assistant" id="kosmos-chat" role="dialog" aria-labelledby="kosmos-chat-title">
      <header className="ws-chat-head">
        <div className="ws-chat-identity">
          <span className="ws-chat-avatar" aria-hidden="true"><Bot /></span>
          <div><h2 id="kosmos-chat-title">Ассистент KosmoStack</h2>
            <small>{model ? `Локальная модель · ${model}` : "Локальный чат"}</small></div>
        </div>
        <div className="ws-chat-head-actions">
          <button className="ws-chat-action" type="button" onClick={resetChat} title="Очистить диалог и начать новый"
            aria-label="Новый чат" disabled={!messages.length && !question && !documentId}>
            <MessageSquarePlus aria-hidden="true" /> <span>Новый чат</span>
          </button>
          <button className="ws-chat-action ws-chat-icon" type="button" onClick={close} aria-label="Закрыть чат" title="Закрыть чат">
            <X aria-hidden="true" />
          </button>
        </div>
      </header>
      <div className="ws-chat-context">
        {(workspaceId || !!owned?.areas?.length) && <label className="ws-chat-document">
          <span className="sr-only">Область для поиска</span><select aria-label="Область для поиска" value={workspaceId} disabled={pending}
            onChange={(event)=>{resetChat();setContext({path:pathname,id:event.target.value})}}>
            <option value="">Общие материалы проекта</option>
            {workspaceId&&!workspaceName&&<option value={workspaceId}>Текущая личная область</option>}
            {owned?.areas?.map((item)=><option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>}
        <label className="ws-chat-document">
          <FileText aria-hidden="true" /><span className="sr-only">Контекст вопроса</span>
          <select value={documentId} onChange={(event) => setDocumentId(event.target.value)} disabled={pending}>
            <option value="">{workspaceId ? "Все PDF области" : "Автопоиск по проекту"}</option>
            {documentId && !data?.documents?.some((item) => item.id === documentId) && <option value={documentId}>Выбранный PDF</option>}
            {data?.documents?.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
        {documentsError && <small role="status">{documentsError.message}</small>}
      </div>
      <div className="ws-chat-body">
        <div className="ws-chat-log" ref={log} aria-label="Сообщения чата" onScroll={() => {
          const node = log.current
          if (!node) return
          follow.current = node.scrollHeight - node.scrollTop - node.clientHeight < 48
          setAtBottom(follow.current)
        }}>
          {!messages.length && <div className="ws-chat-welcome">
            <span className="ws-chat-avatar" aria-hidden="true"><Bot /></span>
            <h3>Чем помочь?</h3><p>Спросите о публикациях, загруженных PDF или метриках проекта.</p>
            <div className="ws-chat-prompts">
              {(documentId ? ["Объясни анализ выбранного PDF", "Какие метрики найдены в PDF?"] :
                workspaceId ? ["Сделай обзор файлов этой области","Какие основные выводы из загруженных PDF?"] : ["Какой материал из области Космос ты рекомендуешь?", "Как сравнить две метрики?"]).map((hint) =>
                <button key={hint} className="ws-chat-prompt" type="button" onClick={() => send(hint)}>
                  {hint}<ArrowUpRight aria-hidden="true" />
                </button>)}
            </div>
          </div>}
          {messages.map((turn, index) => {
            const latest = index === messages.length - 1 && turn.role === "assistant"
            return <ChatTurn key={index} message={turn} generating={pending && latest}
              prompt={turn.role === "assistant" && !(latest && error) ? messages[index - 1]?.content : undefined}
              onRetry={latest && !pending && !error ? retry : undefined} />
          })}
          {error && <div className="ws-chat-error" role="alert">
            <span>{error}</span><button className="ws-chat-action" type="button" onClick={retry} disabled={pending}>
              <RotateCw aria-hidden="true" /> Повторить
            </button>
          </div>}
        </div>
        {!atBottom && <button className="ws-chat-jump" type="button" onClick={scrollToBottom} aria-label="К последнему сообщению" title="К последнему сообщению">
          <ArrowDown aria-hidden="true" />
        </button>}
      </div>
      {pending && <span className="sr-only" role="status">Ассистент формирует ответ</span>}
      <form className="ws-chat-form" onSubmit={submit}>
        <label className="ws-field"><span className="sr-only">Ваш вопрос</span><textarea ref={editor} rows={2} maxLength={2000}
          placeholder="Напишите сообщение…" value={question} onChange={(event) => setQuestion(event.target.value)}
          onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); send(question) } }} /></label>
        {pending ? <button className="ws-chat-send" type="button" onClick={() => request.current?.abort()} aria-label="Остановить ответ" title="Остановить ответ">
          <Square aria-hidden="true" />
        </button> : <button className="ws-chat-send" type="submit" disabled={!question.trim()} aria-label="Отправить вопрос" title="Отправить вопрос">
          <ArrowUp aria-hidden="true" />
        </button>}
      </form>
    </section>}
  </div>
}

function ChatTurn({ message, generating, onRetry, prompt }: { message: Message; generating: boolean; onRetry?: () => void; prompt?: string }) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle")
  useEffect(() => { setCopyState("idle") }, [message.content])
  async function copy() {
    try {
      await navigator.clipboard.writeText(message.content)
      setCopyState("copied")
    } catch {
      setCopyState("failed")
    }
  }
  if (message.role === "user") return <article className="ws-chat-turn ws-user" aria-label="Вы"><p>{message.content}</p></article>

  return <article className="ws-chat-turn ws-reply" aria-label="Ассистент">
    <span className="ws-chat-avatar" aria-hidden="true"><Bot /></span>
    <div className="ws-chat-reply">
      <div className="ws-chat-message">
        {message.content ? <p>{message.content.split(/(\[\d+\]|\*\*[^*\n]+\*\*|`[^`\n]+`)/u).map((part, index) => {
          const marker = /^\[(\d+)\]$/u.exec(part)
          const source = marker ? message.sources?.[Number(marker[1]) - 1] : null
          if (source) return <a className="ws-chat-citation" key={index} href={source.url} title={source.title} target="_blank" rel="noreferrer">{part}</a>
          if (part.startsWith("**") && part.endsWith("**") && part.length > 4) return <strong key={index}>{part.slice(2, -2)}</strong>
          if (part.startsWith("`") && part.endsWith("`") && part.length > 2) return <code key={index}>{part.slice(1, -1)}</code>
          return part
        })}{generating && <span className="ws-chat-cursor" aria-hidden="true" />}</p> :
          generating ? <span className="ws-chat-typing" aria-label="Готовлю ответ"><i /><i /><i /></span> : <p>Ответ не получен.</p>}
      </div>
      {!!message.content && !generating && <div className="ws-chat-tools">
        <button className="ws-chat-action ws-chat-icon" type="button" onClick={() => void copy()} aria-label="Скопировать ответ" title="Скопировать ответ">
          {copyState === "copied" ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
        </button>
        {onRetry && <button className="ws-chat-action ws-chat-icon" type="button" onClick={onRetry}
          aria-label="Обновить ответ" title="Обновить ответ"><RotateCw aria-hidden="true" /></button>}
        {prompt && <ExportMenu kind="assistant" compact label="Скачать ответ" body={{ question: prompt, answer: message.content, sources: message.sources }} />}
        {copyState === "copied" && <small role="status">Скопировано</small>}
        {copyState === "failed" && <small role="status">Не удалось скопировать</small>}
      </div>}
      {!!message.content && !!message.sources?.length && <details className="ws-chat-sources">
        <summary>Источники · {message.sources.length}</summary>
        <ol>{message.sources.map((source, index) => <li key={index}>
          <a href={source.url} target="_blank" rel="noreferrer">{source.title} <ArrowUpRight aria-hidden="true" /></a>
        </li>)}</ol>
      </details>}
    </div>
  </article>
}
