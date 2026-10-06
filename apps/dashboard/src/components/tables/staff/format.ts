export function formatStaffDate(value: string | null) {
  if (!value) return "Not yet"
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("en-NG", { dateStyle: "medium" }).format(date)
}
