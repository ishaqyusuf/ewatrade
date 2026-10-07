/**
 * Client-safe Setup Assistant attachment contracts shared by the API, jobs and
 * dashboard: what owners may upload, the bounded extraction shapes, and how an
 * attachment is shown to the model (always as delimited, untrusted data).
 */
import { z } from "zod"

export const SETUP_ATTACHMENT_PART = "data-setup-attachment" as const

export type SetupAttachmentKind =
  | "IMAGE"
  | "AUDIO"
  | "PDF"
  | "SPREADSHEET"
  | "TEXT"

export const SETUP_ATTACHMENT_TYPES = {
  IMAGE: ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"],
  AUDIO: ["audio/webm", "audio/ogg", "audio/mp4", "audio/mpeg", "audio/wav"],
  PDF: ["application/pdf"],
  SPREADSHEET: [
    "text/csv",
    "text/tab-separated-values",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ],
  TEXT: ["text/plain"],
} as const satisfies Record<SetupAttachmentKind, readonly string[]>

export type SetupAttachmentContentType =
  (typeof SETUP_ATTACHMENT_TYPES)[SetupAttachmentKind][number]

/** Owner-approved limits (S00-03). Larger files belong to the Import modal. */
export const SETUP_ATTACHMENT_LIMITS = {
  IMAGE: { maxBytes: 8 * 1024 * 1024 },
  AUDIO: { maxBytes: 10 * 1024 * 1024, maxDurationMs: 2 * 60 * 1000 },
  PDF: { maxBytes: 2 * 1024 * 1024, maxPages: 20 },
  SPREADSHEET: { maxBytes: 2 * 1024 * 1024, maxRows: 500 },
  TEXT: { maxBytes: 256 * 1024 },
} as const

export const SETUP_ATTACHMENTS_PER_MESSAGE = 4
export const SETUP_ATTACHMENTS_PER_CONVERSATION = 60
export const SETUP_ATTACHMENT_RETENTION_MS = 30 * 24 * 60 * 60 * 1000
export const SETUP_ATTACHMENT_UPLOAD_WINDOW_MS = 15 * 60 * 1000

const EXTENSIONS: Record<SetupAttachmentContentType, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/mp4": "m4a",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
  "application/pdf": "pdf",
  "text/csv": "csv",
  "text/tab-separated-values": "tsv",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "text/plain": "txt",
}

export function setupAttachmentExtension(contentType: string) {
  return EXTENSIONS[contentType as SetupAttachmentContentType] ?? null
}

export function setupAttachmentKind(
  contentType: string,
): SetupAttachmentKind | null {
  for (const [kind, types] of Object.entries(SETUP_ATTACHMENT_TYPES))
    if ((types as readonly string[]).includes(contentType))
      return kind as SetupAttachmentKind
  return null
}

/** Browsers often send "" or a generic type for csv/tsv/xlsx; trust the name. */
export function setupAttachmentContentTypeFor(file: {
  name: string
  type: string
}): SetupAttachmentContentType | null {
  if (setupAttachmentKind(file.type))
    return file.type as SetupAttachmentContentType
  const extension = file.name.toLowerCase().split(".").at(-1)
  const byExtension = Object.entries(EXTENSIONS).find(
    ([, value]) =>
      value === extension || (extension === "jpeg" && value === "jpg"),
  )?.[0]
  return (byExtension as SetupAttachmentContentType | undefined) ?? null
}

/** Display-safe file name: no paths or control characters, bounded length. */
export function sanitizeSetupAttachmentName(name: string) {
  const base = name.split(/[\\/]/).at(-1) ?? ""
  const cleaned = Array.from(base.normalize("NFC"))
    .filter((char) => {
      const code = char.codePointAt(0) ?? 0
      return code > 0x1f && code !== 0x7f && !'<>"`'.includes(char)
    })
    .join("")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120)
  return cleaned || "attachment"
}

export function validateSetupAttachmentIntent(input: {
  contentType: string
  sizeBytes: number
  durationMs?: number | null
}):
  | { ok: true; kind: SetupAttachmentKind }
  | { ok: false; reason: "UNSUPPORTED_TYPE" | "TOO_LARGE" | "TOO_LONG" } {
  const kind = setupAttachmentKind(input.contentType)
  if (!kind) return { ok: false, reason: "UNSUPPORTED_TYPE" }
  const limits = SETUP_ATTACHMENT_LIMITS[kind]
  if (
    !Number.isSafeInteger(input.sizeBytes) ||
    input.sizeBytes < 1 ||
    input.sizeBytes > limits.maxBytes
  )
    return { ok: false, reason: "TOO_LARGE" }
  if (
    kind === "AUDIO" &&
    input.durationMs != null &&
    input.durationMs > SETUP_ATTACHMENT_LIMITS.AUDIO.maxDurationMs + 2_000
  )
    return { ok: false, reason: "TOO_LONG" }
  return { ok: true, kind }
}

const cell = z.string().max(500)

export const setupTableExtractionSchema = z.object({
  type: z.literal("table"),
  sheetName: z.string().max(120).nullable(),
  /** 1-based source row number of each kept row (header excluded). */
  rowNumbers: z.array(z.number().int().positive()).max(500),
  columns: z.array(cell).max(40),
  rows: z.array(z.array(cell).max(40)).max(500),
  totalRows: z.number().int().nonnegative(),
  truncated: z.boolean(),
})

export const setupPagesExtractionSchema = z.object({
  type: z.literal("pages"),
  pages: z
    .array(z.object({ page: z.number().int().positive(), text: z.string() }))
    .max(20),
  totalPages: z.number().int().nonnegative(),
  truncated: z.boolean(),
})

export const setupTextExtractionSchema = z.object({
  type: z.literal("text"),
  text: z.string(),
  truncated: z.boolean(),
})

export const setupTranscriptExtractionSchema = z.object({
  type: z.literal("transcript"),
  language: z.string().max(40).nullable(),
  durationSeconds: z.number().nonnegative().nullable(),
})

export const setupImageExtractionSchema = z.object({
  type: z.literal("image"),
  imageKind: z.enum(["document", "product_photo", "other"]),
  description: z.string().max(400),
  productName: z.string().max(160).nullable(),
  lines: z
    .array(
      z.object({
        line: z.number().int().positive(),
        text: z.string().max(400),
        uncertain: z.boolean(),
      }),
    )
    .max(120),
})

export const setupAttachmentExtractionSchema = z.discriminatedUnion("type", [
  setupTableExtractionSchema,
  setupPagesExtractionSchema,
  setupTextExtractionSchema,
  setupTranscriptExtractionSchema,
  setupImageExtractionSchema,
])
export type SetupAttachmentExtraction = z.infer<
  typeof setupAttachmentExtractionSchema
>

/** What the dashboard and stored message part show for an attachment. */
export type SetupAttachmentPartData = {
  attachmentId: string
  kind: SetupAttachmentKind
  fileName: string
  summary: string
}

function duration(ms: number | null | undefined) {
  if (!ms) return null
  const seconds = Math.round(ms / 1000)
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`
}

export function summarizeSetupAttachment(input: {
  kind: SetupAttachmentKind
  durationMs?: number | null
  extraction?: SetupAttachmentExtraction | null
}) {
  const extraction = input.extraction
  switch (input.kind) {
    case "AUDIO":
      return ["Voice note", duration(input.durationMs)]
        .filter(Boolean)
        .join(" · ")
    case "IMAGE":
      if (extraction?.type !== "image") return "Photo"
      return extraction.imageKind === "product_photo"
        ? `Product photo${extraction.productName ? ` · ${extraction.productName}` : ""}`
        : `Photo · ${extraction.lines.length} line${extraction.lines.length === 1 ? "" : "s"} read`
    case "SPREADSHEET":
      return extraction?.type === "table"
        ? `${extraction.totalRows} row${extraction.totalRows === 1 ? "" : "s"}${extraction.truncated ? ` · first ${extraction.rows.length} used` : ""}`
        : "Spreadsheet"
    case "PDF":
      return extraction?.type === "pages"
        ? `${extraction.totalPages} page${extraction.totalPages === 1 ? "" : "s"}${extraction.truncated ? " · shortened" : ""}`
        : "PDF"
    default:
      return "Text"
  }
}

function escapeAttribute(value: string) {
  return value.replace(/["<>\n\r]/g, " ").slice(0, 120)
}

/** Neutralizes text that could close the delimiter it is wrapped in. */
function fence(text: string) {
  return text.replace(/<\/?UNTRUSTED_CONTEXT/gi, "[removed tag]")
}

/**
 * Renders one attachment as untrusted, bounded text for the model. Rows, pages
 * and lines carry their source location so staged records can cite them.
 */
export function setupAttachmentModelText(
  input: {
    id: string
    kind: SetupAttachmentKind
    fileName: string
    transcript?: string | null
    extraction?: SetupAttachmentExtraction | null
  },
  maxChars = 12_000,
) {
  const extraction = input.extraction
  let body: string
  if (input.kind === "AUDIO")
    // The reviewed transcript normally arrives as the owner's own message text;
    // callers pass the provider transcript only when no text was sent.
    body = input.transcript
      ? `Voice note transcript:\n${input.transcript}`
      : "Voice note. The owner reviewed its transcript and sent it as their message text; use that text."
  else if (extraction?.type === "table") {
    const header = extraction.columns.length
      ? `columns: ${extraction.columns.join(" | ")}`
      : "no header row"
    const rows = extraction.rows.map(
      (row, index) =>
        `[row ${extraction.rowNumbers[index] ?? index + 2}] ${row.join(" | ")}`,
    )
    body = [
      `${header}${extraction.sheetName ? ` (sheet ${extraction.sheetName})` : ""}`,
      ...rows,
      extraction.truncated
        ? `(only the first ${extraction.rows.length} of ${extraction.totalRows} rows are included)`
        : "",
    ]
      .filter(Boolean)
      .join("\n")
  } else if (extraction?.type === "pages")
    body = extraction.pages
      .map((page) => `[page ${page.page}]\n${page.text}`)
      .join("\n")
  else if (extraction?.type === "text") body = extraction.text
  else if (extraction?.type === "image")
    body = [
      `photo type: ${extraction.imageKind}; ${extraction.description}`,
      extraction.productName ? `product: ${extraction.productName}` : "",
      ...extraction.lines.map(
        (line) =>
          `[line ${line.line}]${line.uncertain ? " (hard to read)" : ""} ${line.text}`,
      ),
    ]
      .filter(Boolean)
      .join("\n")
  else body = "(this attachment could not be read)"
  const bounded =
    body.length > maxChars
      ? `${body.slice(0, maxChars)}\n(attachment text shortened)`
      : body
  return `<UNTRUSTED_CONTEXT source="attachment" attachmentId="${escapeAttribute(input.id)}" kind="${input.kind}" name="${escapeAttribute(input.fileName)}">\n${fence(bounded)}\n</UNTRUSTED_CONTEXT>`
}
