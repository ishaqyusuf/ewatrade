/**
 * The Markdown an assistant reply may use, parsed to plain data for native
 * rendering: paragraphs, headings, bullet and numbered lists, tables, and
 * **bold**, *italic* and `code` inside them. Nothing is executed: HTML stays
 * text and a link keeps only its label (record names are untrusted data).
 */
export type MarkdownInline = {
  kind: "text" | "bold" | "italic" | "code"
  text: string
}
export type MarkdownLine = MarkdownInline[]
export type MarkdownBlock =
  | { type: "paragraph"; lines: MarkdownLine[] }
  | { type: "heading"; line: MarkdownLine }
  | { type: "list"; ordered: boolean; start: number; items: MarkdownLine[] }
  | {
      type: "table"
      head: MarkdownLine[]
      /** Right-aligned (`---:`) columns, usually numbers and money. */
      right: boolean[]
      rows: MarkdownLine[][]
    }

const INLINE =
  /(\*\*[^*\n]+\*\*|`[^`\n]+`|\*[^\s*](?:[^*\n]*[^\s*])?\*|\[[^\]\n]+\]\([^)\s]*\))/g
const BULLET = /^\s*[-*+]\s+/
const NUMBER = /^\s*(\d{1,3})[.)]\s+/
const HEADING = /^\s{0,3}#{1,6}\s+/
const TABLE_ROW = /^\s*\|/
const TABLE_RULE = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/

export function parseInline(text: string): MarkdownLine {
  const out: MarkdownLine = []
  for (const part of text.split(INLINE)) {
    if (!part) continue
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4)
      out.push({ kind: "bold", text: part.slice(2, -2) })
    else if (part.startsWith("`") && part.endsWith("`") && part.length > 2)
      out.push({ kind: "code", text: part.slice(1, -1) })
    else if (part.startsWith("[") && part.includes("]("))
      out.push({ kind: "text", text: part.slice(1, part.indexOf("](")) })
    else if (part.startsWith("*") && part.endsWith("*") && part.length > 2)
      out.push({ kind: "italic", text: part.slice(1, -1) })
    else out.push({ kind: "text", text: part })
  }
  return out
}

function cells(line: string) {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim())
}

/**
 * While a reply streams in, its last line can end half-way through a marker.
 * Hiding the loose end keeps the text from flashing `**` or a raw table row
 * before the rest arrives.
 */
function settleStreamingTail(lines: string[]) {
  const last = lines.length - 1
  const tail = lines[last] ?? ""
  // A table header waits for its rule line before it shows.
  if (TABLE_ROW.test(tail) && !TABLE_RULE.test(tail)) {
    const before = lines[last - 1] ?? ""
    if (!TABLE_ROW.test(before)) return lines.slice(0, last)
  }
  if (TABLE_RULE.test(tail) && !TABLE_ROW.test(lines[last - 1] ?? ""))
    return lines.slice(0, last)
  let settled = tail
  if ((settled.match(/\*\*/g)?.length ?? 0) % 2 === 1)
    settled = settled.slice(0, settled.lastIndexOf("**"))
  if ((settled.match(/`/g)?.length ?? 0) % 2 === 1)
    settled = settled.slice(0, settled.lastIndexOf("`"))
  settled = settled.replace(/\[[^\]\n]*$/, "").replace(/(^|\s)[-*+]\s*$/, "$1")
  return [...lines.slice(0, last), settled]
}

export function parseMarkdown(
  text: string,
  options: { streaming?: boolean } = {},
): MarkdownBlock[] {
  let lines = text.replace(/\r\n?/g, "\n").split("\n")
  if (options.streaming) lines = settleStreamingTail(lines)
  const blocks: MarkdownBlock[] = []
  let index = 0
  while (index < lines.length) {
    const line = lines[index] ?? ""
    if (!line.trim()) {
      index++
      continue
    }
    if (HEADING.test(line)) {
      blocks.push({
        type: "heading",
        line: parseInline(line.replace(HEADING, "").replace(/\s+#+\s*$/, "")),
      })
      index++
      continue
    }
    const ordered = NUMBER.test(line)
    if (ordered || BULLET.test(line)) {
      const marker = ordered ? NUMBER : BULLET
      const items: MarkdownLine[] = []
      const start = ordered ? Number(NUMBER.exec(line)?.[1] ?? 1) : 1
      while (index < lines.length && marker.test(lines[index] ?? "")) {
        items.push(parseInline((lines[index] ?? "").replace(marker, "")))
        index++
      }
      blocks.push({ type: "list", ordered, start, items })
      continue
    }
    if (TABLE_ROW.test(line) && TABLE_RULE.test(lines[index + 1] ?? "")) {
      const head = cells(line)
      const right = cells(lines[index + 1] ?? "").map((cell) =>
        cell.endsWith(":"),
      )
      index += 2
      const rows: MarkdownLine[][] = []
      while (index < lines.length && TABLE_ROW.test(lines[index] ?? "")) {
        const row = cells(lines[index] ?? "")
        rows.push(head.map((_, column) => parseInline(row[column] ?? "")))
        index++
      }
      blocks.push({ type: "table", head: head.map(parseInline), right, rows })
      continue
    }
    const paragraph: MarkdownLine[] = []
    while (index < lines.length) {
      const next = lines[index] ?? ""
      if (
        !next.trim() ||
        HEADING.test(next) ||
        BULLET.test(next) ||
        NUMBER.test(next) ||
        (TABLE_ROW.test(next) && TABLE_RULE.test(lines[index + 1] ?? ""))
      )
        break
      paragraph.push(parseInline(next.trim()))
      index++
    }
    blocks.push({ type: "paragraph", lines: paragraph })
  }
  return blocks
}
