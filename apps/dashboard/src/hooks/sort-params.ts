import { createLoader, parseAsArrayOf, parseAsString } from "nuqs/server"

export const sortParamsSchema = { sort: parseAsArrayOf(parseAsString) }
export const loadSortParams = createLoader(sortParamsSchema)

export function getTableSort<const T extends readonly string[]>(
  values: string[] | null,
  fields: T,
): { field: T[number]; direction: "asc" | "desc" } | undefined {
  if (values?.length !== 2) return undefined
  const field = fields.find((candidate) => candidate === values[0])
  const direction = values[1]
  if (!field || (direction !== "asc" && direction !== "desc")) return undefined
  return { field, direction }
}

export const expenseSortFields = [
  "incurredAt",
  "description",
  "payeeName",
  "totalMinor",
  "paidMinor",
] as const
export const catalogSortFields = [
  "name",
  "kind",
  "status",
  "updatedAt",
] as const
export const orderSortFields = [
  "orderNumber",
  "status",
  "createdAt",
  "total",
] as const
export const serviceWorkSortFields = ["createdAt", "priority"] as const
