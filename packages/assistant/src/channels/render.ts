import { formatFinanceMoney } from "@ewatrade/utils/finance-money"
import { ORDER_PAYMENT_METHOD_LABELS } from "@ewatrade/utils/finance-payment-methods"
import {
  type GeneralAnswer,
  generalStoredPartSchema,
} from "../general/contracts"
import type { ReadRecordOrigin } from "../general/read-record-target"
import { capabilityActionHandoffLink } from "./capability-action-handoff"
import {
  type GeneralConversationTarget,
  conversationAppLink,
} from "./conversation-links"
import { readRecordAppLink } from "./read-record-links"

export const WHATSAPP_RENDER_VERSION = "whatsapp-reply-v2"
// Conservative product limit; current provider/version limits remain a release verification gate.
export const WHATSAPP_REPLY_CHUNK_UNITS = 3000
export const WHATSAPP_REPLY_MAX_CHUNKS = 16
export type WhatsAppRenderedReply = {
  version: typeof WHATSAPP_RENDER_VERSION
  kind: "reply" | "app_review"
  chunks: string[]
}

/** Plain text only. Model/record URLs never become an invented or executable handoff. */
export function whatsAppPlainText(value: string) {
  return [...value]
    .filter((point) => {
      const code = point.codePointAt(0) ?? 0
      return (
        code === 9 ||
        code === 10 ||
        code === 13 ||
        (code >= 32 &&
          code !== 127 &&
          !(code >= 0x202a && code <= 0x202e) &&
          !(code >= 0x2066 && code <= 0x2069))
      )
    })
    .join("")
    .replace(/\[([^\]\n]+)\]\([^\)\n]+\)/g, "$1")
    .replace(/https?:\/\/[^\s<>]+/gi, "[link omitted]")
    .replace(/\bwww\.[^\s<>]+/gi, "[link omitted]")
    .replace(/```[^\n]*\n?/g, "")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*|__/g, "")
    .split("\n")
    .flatMap((line) => {
      const trimmed = line.trim()
      if (!trimmed.startsWith("|") || !trimmed.endsWith("|")) return [line]
      const cells = trimmed
        .slice(1, -1)
        .split("|")
        .map((cell) => cell.trim())
      return cells.every((cell) => /^:?-+:?$/.test(cell))
        ? []
        : [cells.join(" · ")]
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}
type ReadLinkOptions = {
  trustedAppOrigin?: string
  currentScope?: ReadRecordOrigin
  conversation?: GeneralConversationTarget
}
function answerText(answer: GeneralAnswer, options: ReadLinkOptions) {
  const lines = [answer.title, answer.value]
  if (answer.records) {
    lines.push(
      ...answer.records.rows.map(
        (row, i) =>
          `${i + 1}. ${row.title} (${row.type})${row.subtitle ? ` — ${row.subtitle}` : ""}`,
      ),
    )
    lines.push(answer.detail)
    if (answer.records.rows.length) lines.push("Limited page, not a total.")
    if (answer.records.labelsShortened)
      lines.push(
        "Some record labels are shortened; open EwaTrade for the full names.",
      )
  } else if (answer.accounts) {
    lines.push(
      ...answer.accounts.rows.map(
        (row, i) =>
          `${i + 1}. ${row.name} — ${row.balanceMinor !== undefined && answer.accounts?.currencyCode ? formatFinanceMoney(row.balanceMinor, answer.accounts.currencyCode) : row.kind}${row.paused ? " · paused" : ""}${row.defaultMethods ? "" : ` · ${row.methods.map((method) => ORDER_PAYMENT_METHOD_LABELS[method]).join(", ")}`}`,
      ),
    )
    lines.push(answer.detail)
    if (answer.accounts.more)
      lines.push(
        "More accounts are not shown; this page is not a complete list.",
      )
  } else lines.push(answer.detail)
  lines.push(`${answer.scope} · as of ${answer.asOf}`)
  if (answer.target)
    lines.push("Open the saved record in EwaTrade for its full review.")
  const text = whatsAppPlainText(lines.join("\n"))
  const { trustedAppOrigin, currentScope } = options
  if (!trustedAppOrigin || !currentScope) return text
  const targets = [
    { target: answer.target, prefix: "" },
    ...(answer.records?.rows.map((row, index) => ({
      target: row.target,
      prefix: `${index + 1}. `,
    })) ?? []),
  ]
  const links = targets.flatMap(({ target, prefix }) => {
    const link = readRecordAppLink(target, {
      trustedAppOrigin,
      currentScope,
    })
    return link ? [`${prefix}${link.label}: ${link.href}`] : []
  })
  if (answer.handoff) {
    const handoff = capabilityActionHandoffLink(answer.handoff, {
      trustedAppOrigin,
      currentScope,
    })
    if (handoff) links.push(`${handoff.label}: ${handoff.href}`)
  }
  return links.length
    ? `${text}\nSelect the original business and Store shown above when opening EwaTrade.\n${[...new Set(links)].join("\n")}`
    : text
}
/** Segment by grapheme and count UTF-16 units conservatively, preserving money, whitespace and emoji. */
export function chunkWhatsAppReply(
  text: string,
  maxUnits = WHATSAPP_REPLY_CHUNK_UNITS,
) {
  if (
    !Number.isInteger(maxUnits) ||
    maxUnits < 64 ||
    maxUnits > WHATSAPP_REPLY_CHUNK_UNITS ||
    text.length > WHATSAPP_REPLY_CHUNK_UNITS * WHATSAPP_REPLY_MAX_CHUNKS
  )
    throw Error("Invalid WhatsApp reply bound.")
  const tokens: string[] = []
  let token = ""
  let whitespace: boolean | undefined
  for (const { segment } of new Intl.Segmenter("en", {
    granularity: "grapheme",
  }).segment(text)) {
    const next = /^[ \t\r\n]+$/u.test(segment)
    if (whitespace !== undefined && next !== whitespace) {
      tokens.push(token)
      token = ""
    }
    whitespace = next
    token += segment
  }
  if (token) tokens.push(token)
  const chunks: string[] = []
  let current = ""
  for (const piece of tokens) {
    if (piece.length > maxUnits) throw Error("Unrenderable WhatsApp token.")
    if (current.length + piece.length > maxUnits) {
      chunks.push(current)
      current = ""
    }
    current += piece
  }
  if (current) chunks.push(current)
  return chunks
}
function savedConversationLink(options: ReadLinkOptions) {
  if (!options.trustedAppOrigin || !options.currentScope) return ""
  const link = conversationAppLink(options.conversation, {
    trustedAppOrigin: options.trustedAppOrigin,
    currentScope: options.currentScope,
  })
  return link
    ? `\nSelect the original business and Store shown above.\n${link.label}: ${link.href}`
    : ""
}
const appReview = (
  scopeLabel?: string,
  options: ReadLinkOptions = {},
): WhatsAppRenderedReply => ({
  version: WHATSAPP_RENDER_VERSION,
  kind: "app_review",
  chunks: [
    `${scopeLabel ? `${scopeLabel}\n\n` : ""}Your full reply is saved in EwaTrade. Open this conversation there to review it.${savedConversationLink(options)}`,
  ],
})
/** Render the committed allowlisted message, never SDK deltas, tool envelopes or approval credentials. */
export function renderWhatsAppFinalReply(
  parts: unknown,
  options: { scopeLabel?: string } & ReadLinkOptions = {},
): WhatsAppRenderedReply {
  const scopeLabel = options.scopeLabel
    ? whatsAppPlainText(options.scopeLabel)
    : undefined
  if (
    options.scopeLabel !== undefined &&
    (!scopeLabel || scopeLabel.length > 500)
  )
    return appReview()
  if (!Array.isArray(parts) || !parts.length || parts.length > 80)
    return appReview(scopeLabel, options)
  const answers: string[] = []
  const texts: string[] = []
  for (const part of parts) {
    const parsed = generalStoredPartSchema.safeParse(part)
    if (!parsed.success || parsed.data.type === "data-setup-attachment")
      return appReview(scopeLabel, options)
    // Exact proposal references are server provenance, never plain text or an
    // executable review. The review settlement adapter handles them separately.
    if (parsed.data.type === "data-general-proposal-reference")
      return {
        version: WHATSAPP_RENDER_VERSION,
        kind: "app_review",
        chunks: [
          `${scopeLabel ? `${scopeLabel}\n\n` : ""}Your saved draft needs the complete review in EwaTrade. Open this same chat to review, edit or confirm it.${savedConversationLink(options)}`,
        ],
      }
    if (parsed.data.type === "data-general-answer")
      answers.push(answerText(parsed.data.data, options))
    else texts.push(whatsAppPlainText(parsed.data.text))
  }
  // Server-built facts supersede model narration; all precise money remains authoritative strings.
  const body =
    (answers.length ? answers : texts).filter(Boolean).join("\n\n") +
    savedConversationLink(options)
  if (
    !body ||
    body.length > WHATSAPP_REPLY_CHUNK_UNITS * WHATSAPP_REPLY_MAX_CHUNKS
  )
    return appReview(scopeLabel, options)
  try {
    const scopePrefix = scopeLabel ? `${scopeLabel}\n\n` : ""
    const pieces = chunkWhatsAppReply(
      body,
      WHATSAPP_REPLY_CHUNK_UNITS - scopePrefix.length - 12,
    )
    const chunks = pieces.map(
      (piece, index) =>
        `${pieces.length > 1 ? `(${index + 1}/${pieces.length})\n` : ""}${scopePrefix}${piece}`,
    )
    return chunks.length <= WHATSAPP_REPLY_MAX_CHUNKS
      ? { version: WHATSAPP_RENDER_VERSION, kind: "reply", chunks }
      : appReview(scopeLabel, options)
  } catch {
    return appReview(scopeLabel, options)
  }
}
