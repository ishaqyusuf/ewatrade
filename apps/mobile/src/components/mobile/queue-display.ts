export function queueItemTitle(payload: {
  customerName?: string | null
  lines?: readonly unknown[]
}) {
  const name = payload.customerName?.trim() || "Walk-in customer"
  const count = payload.lines?.length
  return count === undefined
    ? name
    : `${name} · ${count} ${count === 1 ? "item" : "items"}`
}
export function queueStatusLabel(status: string) {
  return (
    (
      {
        pending: "Waiting to sync",
        approval: "Waiting for approval",
        review: "Needs review",
        applied: "Synced",
        blocked: "Blocked",
        discarded: "Discarded",
      } as Record<string, string>
    )[status] ?? "Status unavailable"
  )
}

export function queueCreatedAt(value: unknown) {
  if (
    !(
      typeof value === "string" ||
      typeof value === "number" ||
      value instanceof Date
    )
  )
    return "Time unavailable"
  const date = new Date(value)
  return Number.isFinite(date.getTime())
    ? date.toLocaleString()
    : "Time unavailable"
}
