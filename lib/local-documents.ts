import { link, mkdir, readFile, readdir, stat, unlink, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { createHash, randomUUID } from "node:crypto"

export const MAX_PDF_SIZE = 25 * 1024 * 1024
export const localDocumentsDirectory = process.env.LOCAL_UPLOADS_DIR ?? join(process.cwd(), "data", "uploads")
const documentIdPattern = /^[a-z0-9][a-z0-9-]{2,79}$/i

type StoredMetadata = {
  id: string
  name: string
  uploadedAt: string
}

export type LocalDocument = {
  id: string
  name: string
  size: number
  uploadedAt: string
}

export function isLocalDocumentId(id: string) {
  return documentIdPattern.test(id)
}

export function getLocalDocumentPaths(id: string) {
  if (!isLocalDocumentId(id)) return null
  return {
    pdfPath: join(localDocumentsDirectory, `${id}.pdf`),
    metadataPath: join(localDocumentsDirectory, `${id}.json`),
    analysisPath: join(localDocumentsDirectory, `${id}.analysis.json`),
  }
}

function safeDisplayName(name: string, fallback: string) {
  const cleaned = name.replace(/[\\/\u0000-\u001f\u007f]/g, "-").trim().slice(0, 180)
  return cleaned.toLowerCase().endsWith(".pdf") ? cleaned : fallback
}

export async function getLocalDocument(id: string): Promise<LocalDocument | null> {
  const paths = getLocalDocumentPaths(id)
  if (!paths) return null

  try {
    const [fileStats, metadataText] = await Promise.all([
      stat(/* turbopackIgnore: true */ paths.pdfPath),
      readFile(/* turbopackIgnore: true */ paths.metadataPath, "utf8").catch(() => ""),
    ])
    let metadata: Partial<StoredMetadata> = {}
    try {
      metadata = JSON.parse(metadataText) as Partial<StoredMetadata>
    } catch {
      metadata = {}
    }
    const uploadedAt = typeof metadata.uploadedAt === "string" && Number.isFinite(Date.parse(metadata.uploadedAt))
      ? metadata.uploadedAt
      : fileStats.mtime.toISOString()

    return {
      id,
      name: safeDisplayName(typeof metadata.name === "string" ? metadata.name : `${id}.pdf`, `${id}.pdf`),
      size: fileStats.size,
      uploadedAt,
    }
  } catch {
    return null
  }
}

function fingerprint(bytes: Uint8Array, namespace?: string) {
  return createHash("sha256").update(bytes).digest("hex")
}

export async function saveLocalDocument(name: string, bytes: Uint8Array, namespace?: string) {
  const digest = fingerprint(bytes)
  const id = namespace ? "private-" + createHash("sha256").update(namespace + ":" + digest).digest("hex") : "pdf-" + digest
  const cached = await getLocalDocument(id)
  if (cached) return { document: cached, existed: true }

  // Older uploads use random IDs. Preserve their links when a file is uploaded again.
  for (const document of await listLocalDocuments()) {
    if (namespace || document.id.startsWith("pdf-") || document.size !== bytes.length) continue
    const previous = await readFile(getLocalDocumentPaths(document.id)!.pdfPath).catch(() => null)
    if (previous && fingerprint(previous) === digest) return { document, existed: true }
  }

  const paths = getLocalDocumentPaths(id)!
  const temporary = join(localDocumentsDirectory, `${randomUUID()}.tmp`)
  const uploadedAt = new Date().toISOString()
  const document = { id, name: safeDisplayName(name, "document.pdf"), size: bytes.length, uploadedAt }
  await writeFile(temporary, bytes, { flag: "wx" })
  try {
    try {
      await link(temporary, paths.pdfPath)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error
      return { document: (await getLocalDocument(id)) ?? document, existed: true }
    }
    await writeFile(paths.metadataPath, JSON.stringify(document), { flag: "wx" })
    return { document, existed: false }
  } finally {
    await unlink(temporary)
  }
}

export async function listLocalDocuments() {
  await mkdir(localDocumentsDirectory, { recursive: true })
  const entries = await readdir(localDocumentsDirectory, { withFileTypes: true })
  const ids = entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".pdf"))
    .map((entry) => entry.name.slice(0, -4))
    .filter((id) => isLocalDocumentId(id) && !id.startsWith("private-"))
  const documents = await Promise.all(ids.map(getLocalDocument))
  return documents
    .filter((document): document is LocalDocument => document !== null)
    .sort((left, right) => right.uploadedAt.localeCompare(left.uploadedAt))
}
