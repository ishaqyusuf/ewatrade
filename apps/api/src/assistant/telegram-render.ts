import { renderWhatsAppActionResultChunks } from "@ewatrade/assistant/channels/action-result"
import {
  type GeneralConversationTarget,
  assistantResponseAppLink,
  conversationAppLink,
  trustedAssistantAppOrigin,
} from "@ewatrade/assistant/channels/conversation-links"
import { whatsAppDataText } from "@ewatrade/assistant/channels/presentation"
import { readRecordAppLink } from "@ewatrade/assistant/channels/read-record-links"
import { whatsAppSavedReplyChoices } from "@ewatrade/assistant/channels/reply-choices"
import {
  type GeneralAnswer,
  generalReceiptSchema,
  generalStoredPartSchema,
} from "@ewatrade/assistant/general/contracts"
import type { ReadRecordOrigin } from "@ewatrade/assistant/general/read-record-target"
import { escapeTelegramHtml } from "@ewatrade/communications"
import { formatFinanceMoney } from "@ewatrade/utils/finance-money"
import { ORDER_PAYMENT_METHOD_LABELS } from "@ewatrade/utils/finance-payment-methods"

/**
 * Telegram HTML for final assistant replies (Workshop ewatrade/assistant/telegram-system,
 * 02 · Telegram-native, families 7, 8 and 17). Display only: facts come from the saved
 * message, links only from trusted builders, and every button carries no authority.
 * The WhatsApp renderer stays the source for WhatsApp; nothing here changes it.
 */

export const TELEGRAM_RENDER_VERSION = "telegram-html-v1"
/** Telegram's limit is 4096 characters after entity parsing; raw HTML under it is always safe. */
export const TELEGRAM_MESSAGE_MAX = 4096
/** A run of list lines longer than this goes in an expandable blockquote. */
export const TELEGRAM_EXPAND_AFTER = 5
export const TELEGRAM_CHOICE_PREFIX = "ch:"

export type TelegramOutboxButton =
  | { text: string; data: string }
  | { text: string; url: string }
export type TelegramRenderedMessage = {
  text: string
  html: true
  buttons?: TelegramOutboxButton[][]
}
export type TelegramReplyOptions = {
  trustedAppOrigin?: string
  currentScope?: ReadRecordOrigin
  conversation?: GeneralConversationTarget
  /** The saved assistant message, for View full response. */
  messageId?: string
  /** IANA zone for "as of" times; UTC is written out when absent. */
  timeZone?: string
  maxUnits?: number
}

const esc = escapeTelegramHtml
const buttonText = (value: string) => {
  const text = whatsAppDataText(value).replace(/\s+/g, " ")
  return text.length <= 64 ? text : `${text.slice(0, 63)}…`
}
const httpsOnly = (href: string) => {
  try {
    return new URL(href).protocol === "https:"
  } catch {
    return false
  }
}

// ---------- inline formatting ----------

const money = String.raw`[-−]?(?:[₦$£€]|(?:NGN|USD|GBP|EUR|GHS|KES|ZAR) ?)\d[\d,]*(?:\.\d+)?`
const inlinePattern = new RegExp(
  [
    "`([^`\\n]+)`",
    String.raw`\*\*(?!\s)([^*\n]+?)(?<!\s)\*\*`,
    String.raw`__(?!\s)([^_\n]+?)(?<!\s)__`,
    String.raw`(?<![\p{L}\p{N}*])\*(?![\s*])([^*\n]+?)(?<![\s*])\*(?![\p{L}\p{N}*])`,
    String.raw`(?<![\p{L}\p{N}_])_(?![\s_])([^_\n]+?)(?<![\s_])_(?![\p{L}\p{N}_])`,
    `(${money})`,
  ].join("|"),
  "gu",
)

/**
 * One line of model Markdown to Telegram HTML. Spans never nest, so every tag is
 * balanced within its line and code never sits inside bold (Telegram refuses that).
 */
export function telegramInlineHtml(line: string) {
  let html = ""
  let last = 0
  for (const match of line.matchAll(inlinePattern)) {
    const [whole, code, bold, bold2, italic, italic2, amount] = match
    html += esc(line.slice(last, match.index))
    if (code !== undefined || amount !== undefined)
      html += `<code>${esc(code ?? amount ?? "")}</code>`
    else if (bold !== undefined || bold2 !== undefined)
      html += `<b>${esc(bold ?? bold2 ?? "")}</b>`
    else html += `<i>${esc(italic ?? italic2 ?? "")}</i>`
    last = (match.index ?? 0) + whole.length
  }
  return html + esc(line.slice(last))
}

const exactValue = new RegExp(
  [
    money,
    String.raw`\+?\d[\d ]{5,}\d`,
    String.raw`\b[A-Z][A-Z0-9]*[-_][A-Z0-9_-]*\d[A-Z0-9_-]*\b`,
    String.raw`^\d[\d,]*(?:\.\d+)?(?= (?!(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b))`,
  ].join("|"),
  "gu",
)

/** Data text (names, receipts): escaped as written, with exact amounts, phones, references and quantities in code. */
export function telegramExactHtml(value: string) {
  let html = ""
  let last = 0
  for (const match of value.matchAll(exactValue)) {
    html += `${esc(value.slice(last, match.index))}<code>${esc(match[0])}</code>`
    last = (match.index ?? 0) + match[0].length
  }
  return html + esc(value.slice(last))
}

/** A "Label: value" line keeps its label plain and codes only the exact parts of the value. */
function fieldHtml(line: string) {
  const match = /^([A-Z][A-Za-z /()−-]{1,39}): (.+)$/.exec(line)
  return match?.[1] && match[2]
    ? `${esc(match[1])}: ${telegramExactHtml(match[2])}`
    : telegramExactHtml(line)
}

const isListLine = (line: string) => /^(?:\d{1,3}[.)]|•) /.test(line)

/** Model Markdown to Telegram lines. Links and control characters stay removed as on WhatsApp. */
export function telegramModelLines(value: string) {
  const lines: string[] = []
  for (const raw of whatsAppDataText(value).split("\n")) {
    const line = raw.trimEnd()
    if (/^\s*```/.test(line)) continue
    const trimmed = line.trim()
    if (trimmed.startsWith("|") && trimmed.endsWith("|")) {
      const cells = trimmed
        .slice(1, -1)
        .split("|")
        .map((cell) => cell.trim())
      if (!cells.every((cell) => /^:?-+:?$/.test(cell)))
        lines.push(`• ${cells.map(telegramInlineHtml).join(" · ")}`)
      continue
    }
    const heading = /^#{1,6}\s+(.+)$/.exec(trimmed)
    if (heading?.[1]) {
      const title = heading[1].replace(/^\*\*(.+)\*\*$/, "$1")
      lines.push(`<b>${esc(title)}</b>`)
      continue
    }
    const bullet = /^\s*[-*+] (?=\S)(.*)$/.exec(line)
    lines.push(
      bullet
        ? `• ${telegramInlineHtml(bullet[1] ?? "")}`
        : telegramInlineHtml(line),
    )
  }
  return collapseBlank(lines)
}

function collapseBlank(lines: string[]) {
  const out: string[] = []
  for (const line of lines)
    if (line.trim() || (out.length && out[out.length - 1]?.trim()))
      out.push(line)
  while (out.length && !out[out.length - 1]?.trim()) out.pop()
  return out
}

// ---------- layout: expandable lists within the length limit ----------

type Section =
  | { kind: "text"; lines: string[] }
  | { kind: "quote"; lines: string[] }

function layout(lines: string[]): Section[] {
  const sections: Section[] = []
  let run: string[] = []
  const flush = () => {
    if (!run.length) return
    sections.push(
      run.length > TELEGRAM_EXPAND_AFTER
        ? { kind: "quote", lines: run }
        : { kind: "text", lines: run },
    )
    run = []
  }
  for (const line of lines) {
    if (isListLine(line)) {
      run.push(line)
      continue
    }
    flush()
    const previous = sections[sections.length - 1]
    if (previous?.kind === "text") previous.lines.push(line)
    else sections.push({ kind: "text", lines: [line] })
  }
  flush()
  return sections
}

const joinSections = (sections: Section[]) =>
  sections
    .map((section) =>
      section.kind === "quote"
        ? `<blockquote expandable>${section.lines.join("\n")}</blockquote>`
        : section.lines.join("\n"),
    )
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()

/**
 * Fit one message: long list runs become one expandable blockquote. When the whole
 * answer is still too long, the longest quote keeps its first rows and says how many
 * are shown. Returns null when even that cannot fit.
 */
export function fitTelegramMessage(
  lines: string[],
  max = TELEGRAM_MESSAGE_MAX,
) {
  const sections = layout(lines)
  let text = joinSections(sections)
  const expanded = sections.some((section) => section.kind === "quote")
  if (text.length <= max) return { text, expanded, truncated: false }
  const quotes = sections.filter(
    (section): section is Extract<Section, { kind: "quote" }> =>
      section.kind === "quote",
  )
  const longest = quotes.sort((a, b) => b.lines.length - a.lines.length)[0]
  if (!longest) return null
  const all = [...longest.lines]
  for (let shown = all.length - 1; shown >= 1; shown--) {
    longest.lines = [
      ...all.slice(0, shown),
      `<i>Showing ${shown} of ${all.length}.</i>`,
    ]
    text = joinSections(sections)
    if (text.length <= max) return { text, expanded: true, truncated: true }
  }
  return null
}

// ---------- answers ----------

export function formatTelegramAsOf(iso: string, timeZone?: string) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return undefined
  const zone = timeZone ?? "UTC"
  try {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat("en-GB", {
        timeZone: zone,
        day: "numeric",
        month: "short",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      })
        .formatToParts(date)
        .map((part) => [part.type, part.value]),
    )
    const period = String(parts.dayPeriod ?? "").toUpperCase()
    return `as of ${parts.day} ${parts.month} ${parts.hour}:${parts.minute} ${period}${zone === "UTC" ? " UTC" : ""}`
  } catch {
    return undefined
  }
}

const looksExact = (value: string) =>
  new RegExp(`^(?:${money}|\\d[\\d,]*(?:\\.\\d+)?)(?:\\s|$)`, "u").test(value)

function ownerLine(answer: GeneralAnswer) {
  return answer.summary ?? answer.detail
}

function answerLines(
  answer: GeneralAnswer,
  showAsOf: boolean,
  options: TelegramReplyOptions,
) {
  const lines: string[] = []
  const title = whatsAppDataText(answer.title)
  const value = whatsAppDataText(answer.value)
  if (title) lines.push(`<b>${esc(title)}</b>`)
  if (value)
    lines.push(
      looksExact(value) ? telegramExactHtml(value) : `<b>${esc(value)}</b>`,
    )
  const owner = whatsAppDataText(ownerLine(answer) ?? "")
  if (answer.records) {
    lines.push(
      ...answer.records.rows.map(
        (row, i) =>
          `${i + 1}. ${esc(whatsAppDataText(row.title))} (${esc(row.type.replace(/_/g, " "))})${row.subtitle ? ` — ${telegramExactHtml(whatsAppDataText(row.subtitle))}` : ""}`,
      ),
    )
    if (owner) lines.push(esc(owner))
    if (answer.records.rows.length)
      lines.push("<i>Limited page, not a total.</i>")
    if (answer.records.labelsShortened)
      lines.push(
        "<i>Some names are shortened; EwaTrade shows them in full.</i>",
      )
  } else if (answer.accounts) {
    const currency = answer.accounts.currencyCode
    lines.push(
      ...answer.accounts.rows.map(
        (row, i) =>
          `${i + 1}. ${esc(whatsAppDataText(row.name))} — ${row.balanceMinor !== undefined && currency ? `<code>${esc(formatFinanceMoney(row.balanceMinor, currency))}</code>` : row.kind}${row.paused ? " · paused" : ""}${row.defaultMethods ? "" : ` · ${row.methods.map((method) => ORDER_PAYMENT_METHOD_LABELS[method]).join(", ")}`}`,
      ),
    )
    if (owner) lines.push(esc(owner))
    if (answer.accounts.more)
      lines.push(
        "<i>More accounts are not shown; this is not a complete list.</i>",
      )
  } else if (owner) lines.push(...owner.split("\n").map((line) => esc(line)))
  // The pinned message shows the Business and Store, so the scope line is dropped.
  const asOf = showAsOf
    ? formatTelegramAsOf(answer.asOf, options.timeZone)
    : undefined
  if (asOf) lines.push(`<i>${esc(asOf)}</i>`)
  return lines
}

function linkButtons(answers: GeneralAnswer[], options: TelegramReplyOptions) {
  const { trustedAppOrigin, currentScope } = options
  if (!trustedAppOrigin || !currentScope) return []
  const scope = { trustedAppOrigin, currentScope }
  const rows: TelegramOutboxButton[][] = []
  const seen = new Set<string>()
  const add = (label: string, href: string | undefined) => {
    if (!href || seen.has(href) || !httpsOnly(href) || rows.length >= 6) return
    seen.add(href)
    rows.push([{ text: buttonText(label), url: href }])
  }
  for (const answer of answers) {
    const target = readRecordAppLink(answer.target, scope)
    add(target?.label ?? "", target?.href)
    answer.records?.rows.forEach((row, index) => {
      const link = readRecordAppLink(row.target, scope)
      add(`${index + 1}. ${link?.label ?? ""}`, link?.href)
    })
    if (answer.handoff) {
      const handoff = conversationAppLink(answer.handoff.conversation, scope)
      add("Continue in EwaTrade", handoff?.href)
    }
  }
  return rows
}

function responseButton(options: TelegramReplyOptions) {
  const { trustedAppOrigin, currentScope } = options
  if (!trustedAppOrigin || !currentScope) return undefined
  const link = assistantResponseAppLink(options.messageId, {
    trustedAppOrigin,
    currentScope,
    conversation: options.conversation,
  })
  return link && httpsOnly(link.href)
    ? { text: link.label, url: link.href }
    : undefined
}

function savedChatButton(
  options: TelegramReplyOptions,
  label = "Open saved chat",
) {
  const { trustedAppOrigin, currentScope } = options
  if (!trustedAppOrigin || !currentScope) return undefined
  const link = conversationAppLink(options.conversation, {
    trustedAppOrigin,
    currentScope,
  })
  return link && httpsOnly(link.href)
    ? { text: label, url: link.href }
    : undefined
}

/** Paged reads (orders, products, customers): the first three rows and the saved answer. */
function compactLines(answers: GeneralAnswer[], options: TelegramReplyOptions) {
  const head = answers[0]
  if (!head || answers.filter((answer) => answer.continuation).length !== 1)
    return null
  const kinds: Record<string, string> = {
    readCatalogPage: "catalog_item",
    readOrders: "order",
    readCustomers: "customer",
  }
  const kind = kinds[head.continuation?.tool ?? ""]
  if (!kind || head.catalogCreate || head.serviceDraft || head.handoff)
    return null
  const rows = answers.slice(1)
  if (!rows.length || rows.some((row) => row.target?.kind !== kind)) return null
  const shown = rows.slice(0, 3)
  const more =
    rows.length > shown.length || Boolean(head.continuation?.nextCursor)
  const asOf = formatTelegramAsOf(head.asOf, options.timeZone)
  return [
    `<b>${esc(whatsAppDataText(head.title))}</b>`,
    ...shown.map((row, index) => {
      const summary = row.summary
        ? ` · ${telegramExactHtml(whatsAppDataText(row.summary))}`
        : ""
      const detail =
        kind === "order"
          ? `\n${telegramExactHtml(whatsAppDataText(row.detail))}`
          : ""
      return `${index + 1}. ${esc(whatsAppDataText(row.title))} — ${telegramExactHtml(whatsAppDataText(row.value))}${summary}${detail}`
    }),
    "",
    more
      ? `First ${shown.length} shown. More available.`
      : "All matches shown.",
    ...(asOf ? [`<i>${esc(asOf)}</i>`] : []),
  ]
}

const message = (
  text: string,
  buttons: TelegramOutboxButton[][] = [],
): TelegramRenderedMessage => ({
  text,
  html: true,
  ...(buttons.length ? { buttons } : {}),
})

function appReview(options: TelegramReplyOptions, draft = false) {
  const button = savedChatButton(options)
  return [
    message(
      draft
        ? "Your saved draft needs the complete review in EwaTrade. Open this same chat to review, edit or confirm it."
        : "Your full reply is saved in EwaTrade. Open this chat there to read it.",
      button ? [[button]] : [],
    ),
  ]
}

/**
 * Render the committed, allowlisted message parts (never stream deltas or tool
 * envelopes) as one Telegram HTML message. Choices become `ch:N` callbacks that the
 * runtime resolves again from the saved message; links become URL buttons.
 */
export function renderTelegramFinalReply(
  parts: unknown,
  options: TelegramReplyOptions = {},
): TelegramRenderedMessage[] {
  const max = options.maxUnits ?? TELEGRAM_MESSAGE_MAX
  if (!Array.isArray(parts) || !parts.length || parts.length > 80)
    return appReview(options)
  const answers: GeneralAnswer[] = []
  const texts: string[] = []
  for (const part of parts) {
    const parsed = generalStoredPartSchema.safeParse(part)
    if (!parsed.success || parsed.data.type === "data-setup-attachment")
      return appReview(options)
    if (parsed.data.type === "data-general-proposal-reference")
      return appReview(options, true)
    if (parsed.data.type === "data-general-answer")
      answers.push(parsed.data.data)
    else texts.push(parsed.data.text)
  }
  const response = responseButton(options)
  const compact = response ? compactLines(answers, options) : null
  if (compact && response) {
    const fitted = fitTelegramMessage(compact, max)
    if (fitted) return [message(fitted.text, [[response]])]
  }
  const lines = answers.length
    ? answers.flatMap((answer, index) => {
        const next = answers[index + 1]
        const block = answerLines(
          answer,
          answer.asOf !== next?.asOf || answer.scope !== next?.scope,
          options,
        )
        return index ? ["", ...block] : block
      })
    : collapseBlank(
        texts.flatMap((text, index) => [
          ...(index ? [""] : []),
          ...telegramModelLines(text),
        ]),
      )
  if (!lines.some((line) => line.trim())) return appReview(options)
  const fitted = fitTelegramMessage(lines, max)
  if (!fitted) return appReview(options)
  const buttons: TelegramOutboxButton[][] = []
  const choices = whatsAppSavedReplyChoices(parts)
  if (choices)
    choices.forEach((choice, index) =>
      buttons.push([
        {
          text: buttonText(choice.title),
          data: `${TELEGRAM_CHOICE_PREFIX}${index + 1}`,
        },
      ]),
    )
  buttons.push(...linkButtons(answers, options))
  if (response && (fitted.expanded || fitted.truncated))
    buttons.push([response])
  return [message(fitted.text, buttons)]
}

/** The choice question after a pick: the same answer, its choice marked and its callbacks gone. */
export function renderTelegramChosenReply(
  parts: unknown,
  choiceTitle: string,
  options: TelegramReplyOptions = {},
): TelegramRenderedMessage | undefined {
  const [original] = renderTelegramFinalReply(parts, {
    ...options,
    maxUnits: (options.maxUnits ?? TELEGRAM_MESSAGE_MAX) - 80,
  })
  if (!original) return
  const buttons = (original.buttons ?? [])
    .map((row) => row.filter((button) => "url" in button))
    .filter((row) => row.length)
  return message(
    `${original.text}\n\n<b>${esc(buttonText(choiceTitle))}</b> ✓`,
    buttons,
  )
}

// ---------- action results (receipts) ----------

type ActionProposal = Parameters<typeof renderWhatsAppActionResultChunks>[0]

/**
 * Receipts and cancellations as Telegram HTML. The canonical plain text comes from the
 * shared action-result renderer; Telegram adds a heading, codes exact values and turns
 * links into URL buttons. Payment links (gated) stay plain, escaped, as on WhatsApp.
 */
export function renderTelegramActionResult(
  proposal: ActionProposal,
  options: {
    appLink?: string
    appOrigin?: string
    paymentOrigin?: string
  } = {},
): TelegramRenderedMessage[] {
  const receipt = generalReceiptSchema.safeParse(proposal.receipt)
  if (
    proposal.status === "COMPLETED" &&
    receipt.success &&
    receipt.data.kind === "payment_links"
  )
    return renderWhatsAppActionResultChunks(proposal, options.appLink, {
      appOrigin: options.appOrigin,
      paymentOrigin: options.paymentOrigin,
    }).map((chunk) => message(esc(chunk)))
  // Without the app link the shared text never inlines a URL; the button carries it.
  const [plain = ""] = renderWhatsAppActionResultChunks(proposal, undefined, {})
  const chat =
    options.appLink && httpsOnly(options.appLink)
      ? { text: "Open saved chat", url: options.appLink }
      : undefined
  const buttons: TelegramOutboxButton[][] = []
  const origin = options.appOrigin
    ? trustedAssistantAppOrigin(options.appOrigin)
    : undefined
  const orderId =
    proposal.status === "COMPLETED" &&
    receipt.success &&
    receipt.data.kind === "order"
      ? (receipt.data.orderId ?? receipt.data.recordId)
      : undefined
  if (origin && orderId)
    buttons.push([
      {
        text: "Open saved order",
        url: new URL(`/sales/orders/${encodeURIComponent(orderId)}`, origin)
          .href,
      },
    ])
  let heading = "ℹ️ <b>Action result</b>"
  let body = plain
  if (body.startsWith("Saved in EwaTrade.")) {
    heading = "✅ <b>Saved in EwaTrade</b>"
    body = body.replace(/^Saved in EwaTrade\.\s*/, "")
    if (/Open the saved chat/.test(body) && chat) buttons.push([chat])
  } else if (body.startsWith("Draft cancelled.")) {
    heading = "↩️ <b>Draft cancelled</b>"
    body = body.replace(/^Draft cancelled\.\s*/, "")
  } else if (body.startsWith("Payment recorded in EwaTrade.")) {
    heading = "✅ <b>Payment recorded in EwaTrade</b>"
    body = body.replace(/^Payment recorded in EwaTrade\.\s*/, "")
    if (chat) buttons.push([chat])
  }
  const lines = body
    .split("\n")
    .filter((line) => line.trim())
    .map(fieldHtml)
  const fitted = fitTelegramMessage([heading, ...lines])
  return [
    fitted
      ? message(fitted.text, buttons)
      : message(
          `${heading}\nOpen the saved chat for the complete receipt.`,
          chat ? [[chat]] : [],
        ),
  ]
}
