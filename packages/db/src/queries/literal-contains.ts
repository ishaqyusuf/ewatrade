/** Escape PostgreSQL LIKE metacharacters for Prisma `contains` filters. */
export function literalContains(value: string) {
  return value.replace(/[\\%_]/g, "\\$&")
}
