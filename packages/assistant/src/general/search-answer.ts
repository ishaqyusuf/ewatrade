import { z } from "zod"
import {
  type ReadRecordTarget,
  readRecordTargetSchema,
} from "./read-record-target"

export const generalSearchRecordsSchema = z
  .object({
    rows: z
      .array(
        z
          .object({
            type: z.string().max(40),
            title: z.string().max(300),
            subtitle: z.string().max(500).optional(),
            target: readRecordTargetSchema.optional(),
          })
          .strict(),
      )
      .max(6),
    labelsShortened: z.boolean(),
  })
  .strict()
function label(value: string, limit: number) {
  if (value.length <= limit) return value
  let text = ""
  for (const point of value) {
    if (text.length + point.length > limit - 1) break
    text += point
  }
  return `${text}…`
}
/** Exact authorized match page; names are display labels, never a complete count or guessed target. */
export function generalSearchRecordsAnswer(
  rows: Array<{
    type: string
    title: string
    subtitle?: string | null
    target?: ReadRecordTarget
  }>,
  scope: string,
  asOf = new Date().toISOString(),
) {
  const shown = rows.slice(0, 6)
  return {
    id: `search_${crypto.randomUUID()}`,
    title: "Search results",
    value: shown.length
      ? `${shown.length} matching record${shown.length === 1 ? "" : "s"} shown`
      : "No matching records shown",
    scope,
    asOf,
    detail: shown.length
      ? `Matched names: ${shown.map((row) => label(row.title, 80)).join("; ")}. Limited page, not a total; labels may be shortened. ${shown.length > 1 ? "Several matches are shown; ask which saved record the user means before choosing one." : ""}`
      : "No authorized matches on this search page. This does not establish that no other records exist.",
    records: {
      rows: shown.map((row) => ({
        type: label(row.type, 40),
        title: label(row.title, 300),
        ...(row.subtitle ? { subtitle: label(row.subtitle, 500) } : {}),
        ...(row.target
          ? { target: readRecordTargetSchema.parse(row.target) }
          : {}),
      })),
      labelsShortened: shown.some(
        (row) =>
          row.type.length > 40 ||
          row.title.length > 300 ||
          (row.subtitle?.length ?? 0) > 500,
      ),
    },
  }
}
