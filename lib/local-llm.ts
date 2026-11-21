type Message = { role: "system" | "user" | "assistant"; content: string }
type Packet = { message?: { content?: string }; done?: boolean; error?: string }
const model = process.env.OLLAMA_MODEL ?? "qwen2.5:3b"

function endpoint() {
  const url = new URL(process.env.OLLAMA_URL ?? "http://127.0.0.1:11434")
  if (url.protocol !== "http:" || !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ||
      url.username || url.password || !/^[a-z0-9_.:-]+$/iu.test(model) || /cloud/iu.test(model)) {
    throw new Error("Для ассистента нужен локальный адрес Ollama и локальная модель.")
  }
  return new URL("/api/chat", url)
}

export async function* generateLocal(messages: Message[], signal: AbortSignal, numPredict: number, format?: object) {
  let response: Response
  try {
    response = await fetch(endpoint(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, messages, stream: true, format, keep_alive: "10m",
        options: { temperature: 0.15, num_ctx: 4096, num_predict: numPredict },
      }),
      cache: "no-store",
      signal: AbortSignal.any([signal, AbortSignal.timeout(150_000)]),
    })
  } catch {
    if (signal.aborted) return
    throw new Error("Локальная модель недоступна. Проверьте, что Ollama запущена.")
  }
  if (!response.ok || !response.body) {
    throw new Error(response.status === 404 ? `Модель ${model} пока не загружена в Ollama.` :
      "Ollama не смогла запустить модель.")
  }
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let pending = ""
  let received = false
  const packet = (line: string) => {
    const part = JSON.parse(line) as Packet
    if (part.error) throw new Error("Локальная модель остановилась с ошибкой.")
    return part.message?.content ?? ""
  }
  try {
    while (!signal.aborted) {
      const chunk = await reader.read()
      if (chunk.done) break
      pending += decoder.decode(chunk.value, { stream: true })
      const rows = pending.split("\n")
      pending = rows.pop() ?? ""
      for (const line of rows) {
        if (!line.trim()) continue
        const token = packet(line)
        if (token) { received = true; yield token }
      }
    }
    pending += decoder.decode()
    if (pending.trim() && !signal.aborted) {
      const token = packet(pending)
      if (token) { received = true; yield token }
    }
    if (!received && !signal.aborted) throw new Error("Модель не вернула ответ.")
  } finally {
    await reader.cancel().catch(() => undefined)
    reader.releaseLock()
  }
}

export { model as localModel }
