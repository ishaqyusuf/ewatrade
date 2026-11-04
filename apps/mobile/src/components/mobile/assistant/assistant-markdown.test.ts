import { expect, test } from "bun:test"
import { parseInline, parseMarkdown } from "./assistant-markdown"

test("inline: bold, italic and code; links keep only their label; HTML stays text", () => {
  expect(parseInline("**₦486,300.00** from *14* sales, ref `S-1042`")).toEqual([
    { kind: "bold", text: "₦486,300.00" },
    { kind: "text", text: " from " },
    { kind: "italic", text: "14" },
    { kind: "text", text: " sales, ref " },
    { kind: "code", text: "S-1042" },
  ])
  expect(parseInline("Open [S-1039](https://evil.example/x) now")).toEqual([
    { kind: "text", text: "Open " },
    { kind: "text", text: "S-1039" },
    { kind: "text", text: " now" },
  ])
  expect(parseInline("<b>hi</b> 2 * 3 * 4")).toEqual([
    { kind: "text", text: "<b>hi</b> 2 * 3 * 4" },
  ])
})

test("blocks: heading, paragraphs, bullet and numbered lists, tables", () => {
  const reply = [
    "### Yaba Main today",
    "**₦486,300.00** from 14 sales.",
    "As of 2:10 pm.",
    "",
    "1. Cash: **₦212,000.00**",
    "2. Transfer: **₦198,300.00**",
    "",
    "- Up **12%**",
    "* Busiest at noon",
    "",
    "| Item | Yaba | Surulere |",
    "|---|---:|---:|",
    "| Table Water 75cl | 3 | 11 |",
    "| Tomato Paste 70g | 7 |",
  ].join("\n")
  const blocks = parseMarkdown(reply)
  expect(blocks.map((block) => block.type)).toEqual([
    "heading",
    "paragraph",
    "list",
    "list",
    "table",
  ])
  expect(blocks[1]).toMatchObject({ type: "paragraph" })
  expect(blocks[1]?.type === "paragraph" && blocks[1].lines).toHaveLength(2)
  expect(blocks[2]).toMatchObject({ type: "list", ordered: true, start: 1 })
  expect(blocks[3]).toMatchObject({ type: "list", ordered: false })
  const table = blocks[4]
  expect(table?.type === "table" && table.right).toEqual([false, true, true])
  expect(table?.type === "table" && table.rows[1]?.[2]).toEqual([])
})

test("a reply mid-stream hides loose markers instead of flashing them", () => {
  expect(parseMarkdown("Sales are **₦2,75", { streaming: true })).toEqual([
    { type: "paragraph", lines: [[{ kind: "text", text: "Sales are" }]] },
  ])
  expect(
    parseMarkdown("Low stock:\n\n| Item | Yaba |", { streaming: true }),
  ).toEqual([
    { type: "paragraph", lines: [[{ kind: "text", text: "Low stock:" }]] },
  ])
  expect(
    parseMarkdown("| Item | Yaba |\n|---|---:|\n| Water | 3 |", {
      streaming: true,
    })[0],
  ).toMatchObject({ type: "table" })
  expect(parseMarkdown("- One\n- ", { streaming: true })).toEqual([
    {
      type: "list",
      ordered: false,
      start: 1,
      items: [[{ kind: "text", text: "One" }]],
    },
  ])
  // Finished replies keep every character.
  expect(parseMarkdown("Sales are **₦2,75")[0]).toEqual({
    type: "paragraph",
    lines: [[{ kind: "text", text: "Sales are **₦2,75" }]],
  })
})
