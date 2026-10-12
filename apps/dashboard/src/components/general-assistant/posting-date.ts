/** datetime-local may omit zero seconds on blur; unchanged seconds retain the reviewed precision. */
export function preserveReviewedTimestamp(date: Date, reviewed: string) {
  return Math.floor(date.getTime() / 1000) ===
    Math.floor(new Date(reviewed).getTime() / 1000)
    ? reviewed
    : date.toISOString()
}
