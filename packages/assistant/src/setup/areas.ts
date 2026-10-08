/**
 * The four optional setup areas, in the order the assistant offers them. Each
 * is finished (DONE) or skipped (SKIPPED) explicitly; otherwise it is OPEN, or
 * STARTED once it holds records.
 */
import { z } from "zod"
import { type SetupEntityPayload, setupEntityPayloadSchema } from "./contracts"

export const SETUP_AREAS = ["sell", "use", "customers", "money"] as const
export type SetupArea = (typeof SETUP_AREAS)[number]
export type SetupAreaMark = "DONE" | "SKIPPED"
export type SetupAreaStatus = SetupAreaMark | "STARTED" | "OPEN"

export const SETUP_AREA_LABELS: Record<SetupArea, string> = {
  sell: "products and services you sell",
  use: "things you use but don't sell",
  customers: "customers who owe you or whom you owe",
  money: "cash and bank balances",
}

const marksSchema = z
  .record(z.string(), z.unknown())
  .catch({})
  .transform((value) => {
    const marks: Partial<Record<SetupArea, SetupAreaMark>> = {}
    for (const area of SETUP_AREAS) {
      const mark = value[area]
      if (mark === "DONE" || mark === "SKIPPED") marks[area] = mark
    }
    return marks
  })

export function parseSetupAreaMarks(value: unknown) {
  return marksSchema.parse(value ?? {})
}

export function setupEntityArea(payload: SetupEntityPayload): SetupArea {
  switch (payload.kind) {
    case "product":
      return payload.usage === "INTERNAL_USE" ? "use" : "sell"
    case "service":
      return "sell"
    case "customer":
      return "customers"
    case "money_account":
      return "money"
  }
}

export type SetupAreaProgress = {
  area: SetupArea
  label: string
  status: SetupAreaStatus
  records: number
}

/** Area-by-area progress from explicit marks and the records staged so far. */
export function summarizeSetupAreas(
  marks: unknown,
  entities: Array<{ state: string; payload: unknown }>,
): SetupAreaProgress[] {
  const parsedMarks = parseSetupAreaMarks(marks)
  const counts = new Map<SetupArea, number>()
  for (const entity of entities) {
    if (entity.state === "SKIPPED") continue
    const parsed = setupEntityPayloadSchema.safeParse(entity.payload)
    if (!parsed.success) continue
    const area = setupEntityArea(parsed.data)
    counts.set(area, (counts.get(area) ?? 0) + 1)
  }
  return SETUP_AREAS.map((area) => {
    const records = counts.get(area) ?? 0
    return {
      area,
      label: SETUP_AREA_LABELS[area],
      status: parsedMarks[area] ?? (records > 0 ? "STARTED" : "OPEN"),
      records,
    }
  })
}

/** The first area the owner has neither finished nor skipped. */
export function nextSetupArea(progress: SetupAreaProgress[]) {
  return (
    progress.find(
      (entry) => entry.status !== "DONE" && entry.status !== "SKIPPED",
    ) ?? null
  )
}

export function unfinishedSetupAreas(progress: SetupAreaProgress[]) {
  return progress.filter(
    (entry) => entry.status === "OPEN" || entry.status === "STARTED",
  )
}
