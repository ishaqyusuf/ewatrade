import { describe, expect, test } from "bun:test"
import { strToU8, zipSync } from "fflate"
import { extractPdfText } from "./pdf-text"
import {
  SetupFileParseError,
  parseCsvTable,
  parseDelimited,
  parseSpreadsheet,
} from "./spreadsheet"

const utf8 = (text: string) => new TextEncoder().encode(text)

function xlsx(options: { encrypted?: boolean } = {}) {
  const sharedStrings = [
    "Item",
    "Price (₦)",
    "Stock",
    "Crate of eggs",
    "Feed &amp; supplements",
    "Broiler",
  ]
  return zipSync({
    ...(options.encrypted ? { EncryptionInfo: strToU8("x") } : {}),
    "xl/workbook.xml": strToU8(
      '<workbook><sheets><sheet name="Price list" sheetId="1" r:id="rId1"/></sheets></workbook>',
    ),
    "xl/_rels/workbook.xml.rels": strToU8(
      '<Relationships><Relationship Id="rId1" Type="worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
    ),
    "xl/sharedStrings.xml": strToU8(
      `<sst>${sharedStrings.map((value) => `<si><t>${value}</t></si>`).join("")}</sst>`,
    ),
    "xl/worksheets/sheet1.xml": strToU8(
      [
        "<worksheet><sheetData>",
        '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c></row>',
        '<row r="2"><c r="A2" t="s"><v>3</v></c><c r="B2"><v>4500</v></c><c r="C2"><v>20</v></c></row>',
        '<row r="3"><c r="A3" t="s"><v>4</v></c><c r="B3"><v>18500.5</v></c></row>',
        '<row r="5"><c r="A5" t="inlineStr"><is><r><t>Live </t></r><r><t>broiler</t></r></is></c><c r="C5"><f>SUM(1,2)</f><v>3</v></c></row>',
        "</sheetData></worksheet>",
      ].join(""),
    ),
  })
}

function minimalPdf(lines: string[]) {
  const stream = [
    "BT /F1 12 Tf 72 720 Td 14 TL",
    ...lines.map((line) => `(${line}) Tj T*`),
    "ET",
  ].join("\n")
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ]
  let body = "%PDF-1.4\n"
  const offsets: number[] = []
  objects.forEach((object, index) => {
    offsets.push(body.length)
    body += `${index + 1} 0 obj\n${object}\nendobj\n`
  })
  const xref = body.length
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets
    .map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`)
    .join(
      "",
    )}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`
  return utf8(body)
}

describe("delimited text", () => {
  test("handles quotes, escaped quotes, embedded newlines and CRLF", () => {
    expect(
      parseDelimited(
        'a,"b, with comma","say ""hi"""\r\n"multi\nline",2,3',
        ",",
      ),
    ).toEqual([
      ["a", "b, with comma", 'say "hi"'],
      ["multi\nline", "2", "3"],
    ])
  })

  test("keeps exact cell text, detects a header and semicolon exports", () => {
    const table = parseCsvTable(
      utf8("﻿Name;Price;Stock\nCrate of eggs;4,500.00;20\n\n;;\nFeed;18500;"),
    )
    expect(table.columns).toEqual(["Name", "Price", "Stock"])
    expect(table.rows).toEqual([
      ["Crate of eggs", "4,500.00", "20"],
      ["Feed", "18500"],
    ])
    expect(table.rowNumbers).toEqual([2, 5])
    expect(table.totalRows).toBe(2)
  })

  test("a first row of values is data, not a header", () => {
    const table = parseCsvTable(
      utf8("Crate of eggs, 4500, 20\nBroiler, 9000, 45"),
    )
    expect(table.columns).toEqual([])
    expect(table.rows.length).toBe(2)
    expect(table.rowNumbers).toEqual([1, 2])
  })

  test("bounds rows and reports truncation", () => {
    const lines = Array.from(
      { length: 12 },
      (_, index) => `Item ${index},${index}`,
    )
    const table = parseCsvTable(utf8(`Name,Price\n${lines.join("\n")}`), {
      limits: { maxRows: 5 },
    })
    expect(table.rows.length).toBe(5)
    expect(table.totalRows).toBe(12)
    expect(table.truncated).toBe(true)
  })

  test("refuses binary or non UTF-8 content", () => {
    expect(() =>
      parseCsvTable(new Uint8Array([0xff, 0xfe, 0x00, 0x41])),
    ).toThrow(SetupFileParseError)
  })

  test("tab-separated files use tabs", () => {
    const table = parseSpreadsheet(
      utf8("Item\tPrice\nYam tuber\t2500"),
      "text/tab-separated-values",
    )
    expect(table.rows).toEqual([["Yam tuber", "2500"]])
  })
})

describe("xlsx", () => {
  test("reads the first sheet with shared, inline, numeric and cached formula cells", () => {
    const table = parseSpreadsheet(
      xlsx(),
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )
    expect(table.sheetName).toBe("Price list")
    expect(table.columns).toEqual(["Item", "Price (₦)", "Stock"])
    expect(table.rows).toEqual([
      ["Crate of eggs", "4500", "20"],
      ["Feed & supplements", "18500.5"],
      ["Live broiler", "", "3"],
    ])
    expect(table.rowNumbers).toEqual([2, 3, 5])
  })

  test("password-protected and corrupt workbooks are refused clearly", () => {
    const type =
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    expect(() => parseSpreadsheet(xlsx({ encrypted: true }), type)).toThrow(
      "password protected",
    )
    expect(() => parseSpreadsheet(utf8("not a zip"), type)).toThrow(
      SetupFileParseError,
    )
  })
})

describe("pdf text", () => {
  test("extracts text per page", async () => {
    const parsed = await extractPdfText(
      minimalPdf(["Crate of eggs 4500", "Broiler 9000"]),
    )
    expect(parsed.totalPages).toBe(1)
    expect(parsed.pages[0]?.page).toBe(1)
    expect(parsed.pages[0]?.text).toContain("Crate of eggs 4500")
    expect(parsed.pages[0]?.text).toContain("Broiler 9000")
  })

  test("a PDF without text asks for a photo; garbage is unreadable", async () => {
    await expect(extractPdfText(minimalPdf([]))).rejects.toThrow("photo")
    await expect(extractPdfText(utf8("%PDF-1.4 broken"))).rejects.toThrow(
      SetupFileParseError,
    )
  })
})
