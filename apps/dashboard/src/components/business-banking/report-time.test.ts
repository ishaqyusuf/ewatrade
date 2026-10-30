import { expect, test } from "bun:test"
import { fileURLToPath } from "node:url"
import { formatReportTime as modelFormatReportTime } from "./business-banking-model"
import { formatReportTime } from "./report-time"

test("report time keeps its display, time zone, empty and invalid behavior", () => {
  expect(modelFormatReportTime).toBe(formatReportTime)
  expect(formatReportTime(null, "Africa/Lagos")).toBe("—")
  expect(formatReportTime("", "Africa/Lagos")).toBe("—")
  const instant = "2026-10-28T20:19:00.000Z"
  const lagos = formatReportTime(instant, "Africa/Lagos")
  expect(formatReportTime(new Date(instant), "Africa/Lagos")).toBe(lagos)
  expect(lagos).toContain("28 Oct 2026")
  expect(lagos).toMatch(/\b(21:19|9:19)/)
  expect(formatReportTime(instant, "UTC")).toMatch(/\b(20:19|8:19)/)
  expect(() => formatReportTime("not a date", "UTC")).toThrow(RangeError)
  expect(() => formatReportTime(instant, "Not/AZone")).toThrow(RangeError)
})

async function graph(file: string) {
  const result = await Bun.build({
    entrypoints: [fileURLToPath(new URL(file, import.meta.url))],
    target: "browser",
    metafile: true,
  })
  expect(result.success).toBe(true)
  if (!result.metafile) throw new Error("Missing import graph")
  const meta: { inputs: Record<string, unknown> } =
    typeof result.metafile === "string"
      ? JSON.parse(result.metafile)
      : result.metafile
  const output = result.outputs.find((item) => item.kind === "entry-point")
  if (!output) throw new Error("Missing entry output")
  return { paths: Object.keys(meta.inputs), text: await output.text() }
}
const PHONE =
  /libphonenumber-js|customer-messages\/src\/(phone|message-url)\.ts$/

test("the notification time edge compiles without phone or WhatsApp helpers", async () => {
  // Positive control: the same compiler and filter see the model's phone graph.
  const model = await graph("./business-banking-model.ts")
  expect(model.paths.some((path) => PHONE.test(path))).toBe(true)
  const narrow = await graph("./report-time.ts")
  expect(narrow.paths.filter((path) => PHONE.test(path))).toEqual([])
  expect(narrow.paths).toHaveLength(1)
  expect(narrow.text).toContain("formatReportTime")
}, 30_000)
