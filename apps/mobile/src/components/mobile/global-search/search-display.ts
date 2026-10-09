export function searchPayment(subtitle: string) {
  const status = subtitle.split(" · ").at(-1)?.trim().toLowerCase()
  if (status === "paid") return { label: "Paid", tone: "ok" as const }
  if (status === "partially paid")
    return { label: "Part paid", tone: "warn" as const }
  if (status === "unpaid") return { label: "Unpaid", tone: "warn" as const }
  if (status === "refunded")
    return { label: "Refunded", tone: "muted" as const }
  if (status === "failed") return { label: "Failed", tone: "danger" as const }
  return null
}
export function matchParts(text: string, query: string) {
  const q = query.trim().toLowerCase()
  const at = q ? text.toLowerCase().indexOf(q) : -1
  return at < 0
    ? [text, "", ""]
    : [
        text.slice(0, at),
        text.slice(at, at + q.length),
        text.slice(at + q.length),
      ]
}
export function availableSearchActions<T extends { id: string }>(
  actions: T[],
  offline: boolean,
) {
  return offline ? actions.filter((a) => a.id === "create-order") : actions
}
