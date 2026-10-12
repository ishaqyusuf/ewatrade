export type ServiceIntakeEditorOffering = {
  id: string
  name: string
  priceMinor: number | null
  workPolicy: string
}

export type ServiceIntakeEditorContinuation = {
  query?: string
  cursor?: string
  offeringAfter?: string
}

type ReadState = {
  isPending: boolean
  isFetching: boolean
  isPaused: boolean
  isError: boolean
  isSuccess: boolean
}

export function serviceIntakeEditorReadState(reads: ReadState[]) {
  if (reads.some((read) => read.isError)) return "unavailable"
  if (reads.some((read) => read.isPaused)) return "paused"
  if (
    reads.some((read) => read.isPending || read.isFetching || !read.isSuccess)
  )
    return "loading"
  return "ready"
}

/** Retain only explicitly selected choices, never all previously browsed pages. */
export function selectedServiceIntakeOfferings(
  offerings: ServiceIntakeEditorOffering[],
  selectedIds: string[],
) {
  const selected = new Set(selectedIds)
  return [...new Map(offerings.map((row) => [row.id, row])).values()].filter(
    (row) => selected.has(row.id),
  )
}

export function serviceIntakeOfferingChoices(
  offerings: ServiceIntakeEditorOffering[],
  selectedId: string,
) {
  const choices = offerings.map((row) => ({
    value: row.id,
    label: `${row.name} · ${row.workPolicy.toLowerCase().replaceAll("_", " ")}`,
  }))
  if (!choices.some((choice) => choice.value === selectedId))
    choices.unshift({
      value: selectedId,
      label: "Selected service is outside this page or unavailable",
    })
  return choices
}
