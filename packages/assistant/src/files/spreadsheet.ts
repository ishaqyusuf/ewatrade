/**
 * Deterministic, provider-free spreadsheet reading for owner uploads (csv, tsv,
 * single-sheet xlsx). Cell values are kept exactly as written; nothing is
 * evaluated, converted or guessed. Reused later by the import engine.
 */
import { unzipSync } from "fflate"

export class SetupFileParseError extends Error {
  constructor(
    readonly code: "UNREADABLE" | "EMPTY" | "ENCRYPTED",
    message: string,
  ) {
    super(message)
    this.name = "SetupFileParseError"
  }
}

export type ParsedTable = {
  type: "table"
  sheetName: string | null
  columns: string[]
  rows: string[][]
  rowNumbers: number[]
  totalRows: number
  truncated: boolean
}

type Limits = { maxRows: number; maxColumns: number; maxCellChars: number }
const DEFAULT_LIMITS: Limits = {
  maxRows: 500,
  maxColumns: 40,
  maxCellChars: 500,
}
const MAX_XML_BYTES = 12 * 1024 * 1024

function unreadable(message = "This spreadsheet could not be read.") {
  return new SetupFileParseError("UNREADABLE", message)
}

function decodeUtf8(bytes: Uint8Array) {
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes)
    if (text.includes("\u0000")) throw unreadable()
    return text.replace(/^﻿/, "")
  } catch {
    throw unreadable("Save the file as UTF-8 CSV and try again.")
  }
}

/** RFC 4180 fields with quotes, escaped quotes and embedded line breaks. */
export function parseDelimited(text: string, delimiter: string) {
  const rows: string[][] = []
  let row: string[] = []
  let field = ""
  let quoted = false
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index] as string
    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"'
          index += 1
        } else quoted = false
      } else field += char
      continue
    }
    if (char === '"' && field === "") quoted = true
    else if (char === delimiter) {
      row.push(field)
      field = ""
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[index + 1] === "\n") index += 1
      row.push(field)
      rows.push(row)
      row = []
      field = ""
    } else field += char
  }
  if (field !== "" || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  return rows
}

/** Excel in many locales writes ";" instead of ","; pick by the first lines. */
function detectDelimiter(text: string) {
  const sample = text.split(/\r?\n/).slice(0, 5).join("\n")
  const count = (char: string) => sample.split(char).length - 1
  return count(";") > count(",") ? ";" : ","
}

function shape(
  grid: Array<{ number: number; cells: string[] }>,
  sheetName: string | null,
  limits: Limits,
): ParsedTable {
  const clean = grid
    .map(({ number, cells }) => {
      const trimmed = cells.map((value) =>
        value.trim().slice(0, limits.maxCellChars),
      )
      while (trimmed.length && trimmed.at(-1) === "") trimmed.pop()
      return { number, cells: trimmed.slice(0, limits.maxColumns) }
    })
    .filter((row) => row.cells.some((value) => value !== ""))
  const [header, ...body] = clean
  if (!header)
    throw new SetupFileParseError("EMPTY", "This spreadsheet has no rows.")
  // A header row has no numbers; otherwise every row is data.
  const hasHeader = header.cells.every(
    (value) => value === "" || !/^[\d.,₦$\s-]+$/.test(value),
  )
  const dataRows = hasHeader ? body : clean
  const kept = dataRows.slice(0, limits.maxRows)
  return {
    type: "table",
    sheetName,
    columns: hasHeader ? header.cells : [],
    rows: kept.map((row) => row.cells),
    rowNumbers: kept.map((row) => row.number),
    totalRows: dataRows.length,
    truncated: dataRows.length > kept.length,
  }
}

export function parseCsvTable(
  bytes: Uint8Array,
  options: { delimiter?: "," | ";" | "\t"; limits?: Partial<Limits> } = {},
) {
  const text = decodeUtf8(bytes)
  const delimiter = options.delimiter ?? detectDelimiter(text)
  const rows = parseDelimited(text, delimiter)
  return shape(
    rows.map((cells, index) => ({ number: index + 1, cells })),
    null,
    { ...DEFAULT_LIMITS, ...options.limits },
  )
}

function decodeXml(value: string) {
  return value.replace(
    /&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi,
    (match, entity: string) => {
      const lower = entity.toLowerCase()
      if (lower === "amp") return "&"
      if (lower === "lt") return "<"
      if (lower === "gt") return ">"
      if (lower === "quot") return '"'
      if (lower === "apos") return "'"
      const code =
        lower[1] === "x"
          ? Number.parseInt(lower.slice(2), 16)
          : Number.parseInt(lower.slice(1), 10)
      return Number.isFinite(code) && code > 0 && code < 0x110000
        ? String.fromCodePoint(code)
        : match
    },
  )
}

function textRuns(xml: string) {
  return [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)]
    .map((match) => decodeXml(match[1] ?? ""))
    .join("")
}

function columnIndex(reference: string) {
  const letters = /^[A-Z]+/.exec(reference)?.[0] ?? ""
  let index = 0
  for (const letter of letters) index = index * 26 + (letter.charCodeAt(0) - 64)
  return index - 1
}

function attribute(tag: string, name: string) {
  return new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1]
}

/** First worksheet of an .xlsx workbook; formulas contribute their cached value. */
export function parseXlsxTable(
  bytes: Uint8Array,
  options: { limits?: Partial<Limits> } = {},
) {
  let files: Record<string, Uint8Array>
  try {
    files = unzipSync(bytes, {
      filter: (file) => {
        if (file.originalSize > MAX_XML_BYTES) throw unreadable()
        return (
          file.name === "xl/workbook.xml" ||
          file.name === "xl/_rels/workbook.xml.rels" ||
          file.name === "xl/sharedStrings.xml" ||
          file.name === "EncryptionInfo" ||
          /^xl\/worksheets\/[^/]+\.xml$/.test(file.name)
        )
      },
    })
  } catch (error) {
    if (error instanceof SetupFileParseError) throw error
    throw unreadable()
  }
  if (files.EncryptionInfo)
    throw new SetupFileParseError(
      "ENCRYPTED",
      "This spreadsheet is password protected. Remove the password and try again.",
    )
  const read = (name: string) => {
    const file = files[name]
    return file ? new TextDecoder().decode(file) : null
  }
  const workbook = read("xl/workbook.xml")
  if (!workbook) throw unreadable()
  const sheetTag = /<sheet\s[^>]*>/.exec(workbook)?.[0]
  if (!sheetTag)
    throw new SetupFileParseError("EMPTY", "This file has no sheets.")
  const sheetName = decodeXml(attribute(sheetTag, "name") ?? "") || null
  const relationId = attribute(sheetTag, "r:id")
  const relations = read("xl/_rels/workbook.xml.rels") ?? ""
  const target = [...relations.matchAll(/<Relationship\s[^>]*>/g)]
    .map((match) => match[0])
    .find((tag) => attribute(tag, "Id") === relationId)
  const targetPath = target ? attribute(target, "Target") : undefined
  const sheetPath = targetPath
    ? targetPath.startsWith("/")
      ? targetPath.slice(1)
      : `xl/${targetPath.replace(/^\.\//, "")}`
    : "xl/worksheets/sheet1.xml"
  const sheet = read(sheetPath)
  if (!sheet) throw unreadable()

  const shared = [
    ...(read("xl/sharedStrings.xml") ?? "").matchAll(/<si>([\s\S]*?)<\/si>/g),
  ].map((match) => textRuns(match[1] ?? ""))

  const grid: Array<{ number: number; cells: string[] }> = []
  for (const rowMatch of sheet.matchAll(
    /<row\s([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g,
  )) {
    const number = Number(attribute(` ${rowMatch[1]}`, "r")) || grid.length + 1
    const cells: string[] = []
    for (const cellMatch of (rowMatch[2] ?? "").matchAll(
      /<c\s([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g,
    )) {
      const tag = ` ${cellMatch[1]}`
      const inner = cellMatch[2] ?? ""
      const reference = attribute(tag, "r")
      const type = attribute(tag, "t")
      const raw = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1]
      let value = ""
      if (type === "s") value = shared[Number(raw)] ?? ""
      else if (type === "inlineStr") value = textRuns(inner)
      else if (type === "b") value = raw === "1" ? "TRUE" : "FALSE"
      else if (raw !== undefined) value = decodeXml(raw)
      const index = reference ? columnIndex(reference) : cells.length
      if (index < 0 || index > 200) continue
      while (cells.length < index) cells.push("")
      cells[index] = value
    }
    grid.push({ number, cells })
    if (grid.length > 5_000) break
  }
  return shape(grid, sheetName, { ...DEFAULT_LIMITS, ...options.limits })
}

export function parseSpreadsheet(
  bytes: Uint8Array,
  contentType: string,
  options: { limits?: Partial<Limits> } = {},
): ParsedTable {
  if (
    contentType ===
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  )
    return parseXlsxTable(bytes, options)
  return parseCsvTable(bytes, {
    ...options,
    delimiter: contentType === "text/tab-separated-values" ? "\t" : undefined,
  })
}
