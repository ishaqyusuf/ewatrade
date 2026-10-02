import { sortParamsSchema } from "@/hooks/sort-params"
import { createLoader } from "nuqs/server"

export const staffSortFields = [
  "name",
  "role",
  "status",
  "invitedAt",
  "acceptedAt",
] as const

const loadSort = createLoader(sortParamsSchema)

export async function loadStaffSort(
  searchParams: Record<string, string | string[] | undefined>,
) {
  const { sort } = await loadSort(searchParams)
  if (!sort || sort.length !== 2) return undefined
  const field = staffSortFields.find((candidate) => candidate === sort[0])
  const direction = sort[1]
  if (!field || (direction !== "asc" && direction !== "desc")) return undefined
  return { field, direction } as const
}
