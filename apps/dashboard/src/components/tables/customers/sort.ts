import { sortParamsSchema } from "@/hooks/sort-params"
import { createLoader } from "nuqs/server"

export const customerSortFields = [
  "name",
  "orderCount",
  "totalMinor",
  "lastOrder",
  "lastSeenAt",
] as const

const loadSort = createLoader(sortParamsSchema)

export async function loadCustomerSort(
  searchParams: Record<string, string | string[] | undefined>,
) {
  const params = await loadSort(searchParams)
  const values = params.sort
  if (!values || values.length !== 2) return undefined
  const field = customerSortFields.find((candidate) => candidate === values[0])
  const direction = values[1]
  if (!field || (direction !== "asc" && direction !== "desc")) return undefined
  return { field, direction } as const
}
