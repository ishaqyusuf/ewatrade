/** Display only. Canonical review facts, commands, URLs and saved outbox bodies stay authoritative. */
export const WHATSAPP_PRESENTATION_VERSION = "whatsapp-presentation-v1"

export type WhatsAppMessageFamily =
  | "reply"
  | "review"
  | "result"
  | "menu"
  | "notice"
  | "account"
  | "form"
  | "customer"
  | "edit"
  | "transcript"
  | "handoff"

function visibleText(value: string) {
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
    .replace(/\r\n?/g, "\n")
}

function spacedParagraphs(value: string) {
  return value
    .split("\n\n")
    .map((paragraph) => {
      if (paragraph.length <= 240 || paragraph.includes("\n")) return paragraph
      const groups: string[] = []
      let group = ""
      for (const sentence of paragraph.split(/(?<=[.!?]) (?=[A-Z])/)) {
        if (group && group.length + sentence.length > 220) {
          groups.push(group)
          group = ""
        }
        group += `${group ? " " : ""}${sentence}`
      }
      if (group) groups.push(group)
      return groups.join("\n\n")
    })
    .join("\n\n")
}

/** Literal facts are never reinterpreted as formatting or rewritten to fit. */
export function whatsAppLiteralText(value: string) {
  if (!/[*_~`]/.test(value) || /^https?:\/\/\S+$/.test(value)) return value
  if (!value.includes("`")) return `\`${value}\``
  if (!value.includes("```")) return `\`\`\`${value}\`\`\``
  return value
}

export function whatsAppBold(value: string) {
  return /[*_~`\n]/.test(value) ? whatsAppLiteralText(value) : `*${value}*`
}

export function whatsAppHeading(title: string, emoji = "📋") {
  return `${emoji} ${whatsAppBold(title)}`
}

export function whatsAppField(label: string, value: string) {
  if (/^https?:\/\/\S+$/.test(value))
    return `${whatsAppBold(`${label}:`)}\n${value}`
  return `${whatsAppBold(`${label}:`)} ${whatsAppLiteralText(value)}`
}

/** Untrusted display facts keep their punctuation; only navigation/control material is removed. */
export function whatsAppDataText(value: string) {
  return visibleText(value)
    .replace(/\[([^\]\n]+)\]\([^\)\n]+\)/g, "$1")
    .replace(/https?:\/\/[^\s<>]+/gi, "[link omitted]")
    .replace(/\bwww\.[^\s<>]+/gi, "[link omitted]")
    .trim()
}

/** Convert model Markdown to the channel's syntax, keeping the existing untrusted-link boundary. */
export function whatsAppModelText(value: string) {
  const text = whatsAppDataText(value)
    .replace(/^```(?:[a-zA-Z0-9_-]+)?[ \t]*$/gm, "")
    .replace(/\*\*([^*\n]+)\*\*/g, "*$1*")
    .replace(/(^|\s)__([^_\n]+)__(?=\s|[.,!?:;]|$)/g, "$1_$2_")
    .replace(/^#{1,6}\s+(.+)$/gm, (_, title: string) => whatsAppBold(title))
    .split("\n")
    .flatMap((line) => {
      const text = line.trim()
      if (!text.startsWith("|") || !text.endsWith("|")) return [line]
      const cells = text
        .slice(1, -1)
        .split("|")
        .map((cell) => cell.trim())
      return cells.every((cell) => /^:?-+:?$/.test(cell))
        ? []
        : [`- ${cells.join(" · ")}`]
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
  return spacedParagraphs(text)
}

const familyHeadings: Partial<Record<WhatsAppMessageFamily, string>> = {
  review: "📝 *Review draft*",
  result: "📋 *Action result*",
  menu: "🧭 *EwaTrade menu*",
  notice: "ℹ️ *EwaTrade update*",
  account: "🔐 *Your EwaTrade account*",
  form: "📝 *Prepare a draft*",
  customer: "💬 *EwaTrade*",
  edit: "✏️ *Edit draft*",
  transcript: "🎙️ *Review transcript*",
  handoff: "↗️ *Continue in EwaTrade*",
}

/**
 * Apply to system-owned text AFTER canonical validation. Never apply to a merchant's
 * own message, OTP/template parameters, button labels, action IDs or proof codes.
 * If decoration would exceed a transport bound, retain the complete original facts.
 */
export function presentWhatsAppMessage(
  body: string,
  options: { family?: WhatsAppMessageFamily; maxUnits?: number } = {},
) {
  const original = visibleText(body).trim()
  let text = spacedParagraphs(original)
    .split("\n")
    .map((line) => {
      // Only static-looking field labels; URLs, email addresses and typed codes stay literal.
      const match = /^([A-Z][A-Za-z /()−-]{1,39}): (.+)$/.exec(line)
      return match?.[1] && match[2] !== undefined
        ? whatsAppField(match[1], match[2])
        : line
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
  const alreadyHeaded = /^(?:[^\p{L}\p{N}\n]+ )?\*[^*\n]+\*(?:\n|$)/u.test(text)
  if (!alreadyHeaded) {
    let heading = familyHeadings[options.family ?? "reply"]
    if (
      options.family === "result" &&
      /^(?:Saved in EwaTrade[.:]|Selected records saved in EwaTrade\.)/.test(
        text,
      )
    ) {
      heading = "✅ *Saved in EwaTrade*"
      text = text.replace(/^Saved in EwaTrade\.\n\n/, "")
    } else if (
      options.family === "result" &&
      /^(?:Draft cancelled\.|Workflow review cancelled\.)/.test(text)
    )
      heading = "↩️ *Draft cancelled*"
    // An existing short standalone title is the heading, rather than extra framing.
    const [first, ...rest] = text.split("\n")
    if (heading) text = `${heading}\n\n${text}`
    else if (
      first &&
      rest.length &&
      first.length <= 90 &&
      !/[.!?:]$/.test(first) &&
      !/https?:\/\/|[*_~`]/.test(first) &&
      !/^\d+[.)] /.test(first)
    ) {
      text = `${whatsAppHeading(first)}\n\n${rest.join("\n").trimStart()}`
    }
  }
  return text.length <= (options.maxUnits ?? 4096) ? text : original
}

/** Balanced inline styles cannot bleed into the next chunk; prefer whole paragraphs/lines. */
export function chunkWhatsAppFormattedReply(text: string, maxUnits: number) {
  if (
    !Number.isInteger(maxUnits) ||
    maxUnits < 64 ||
    maxUnits > 3000 ||
    text.length > 48_000
  )
    throw Error("Invalid WhatsApp reply bound.")
  const chunks: string[] = []
  let current = ""
  const append = (piece: string) => {
    if (current.length + piece.length > maxUnits) {
      if (current) chunks.push(current.trimEnd())
      current = ""
    }
    current += piece
  }
  // A numbered record or an emoji heading starts a logical section. Keep its
  // quantities and qualifiers together whenever that whole section fits.
  const sections = text.split(
    /(?=^(?:(?:\p{Extended_Pictographic}|\uFE0F|\u200D)+ \*[^*\n]+\*|\*\d+[.)] [^*\n]+\*)(?:\n|$))/mu,
  )
  for (const section of sections) {
    if (section.length <= maxUnits) {
      append(section)
      continue
    }
    for (const paragraph of section.split(/(?<=\n\n)/)) {
      if (paragraph.length <= maxUnits) {
        append(paragraph)
        continue
      }
      for (const line of paragraph.split(/(?<=\n)/)) {
        if (line.length <= maxUnits) {
          append(line)
          continue
        }
        // A styled span, URL, amount, command token or grapheme is indivisible.
        const tokens =
          line.match(
            /\*[^*\n]+\*|_[^_\n]+_|~[^~\n]+~|`[^`\n]+`|[^ \t\r\n]+|[ \t\r\n]+/gu,
          ) ?? []
        for (const token of tokens) {
          if (token.length > maxUnits)
            throw Error("Unrenderable WhatsApp token.")
          append(token)
        }
      }
    }
  }
  if (current.trim()) chunks.push(current.trim())
  if (chunks.length > 16) throw Error("Too many WhatsApp reply chunks.")
  return chunks
}
