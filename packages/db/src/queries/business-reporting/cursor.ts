import { createHash } from "node:crypto"
export function reportCursorScope(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex")
}
export function readReportCursor(cursor: string | undefined, scope: string) {
  if (!cursor) return null
  try {
    if (cursor.length > 8192) throw Error()
    const value = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"))
    if (
      value.version !== 1 ||
      value.scope !== scope ||
      typeof value.key !== "string" ||
      !value.key ||
      value.key.length > 4000 ||
      Object.keys(value).sort().join(",") !== "key,scope,version"
    )
      throw Error()
    return value.key as string
  } catch {
    throw new Error(
      "Keep the original report filters and scope when continuing; refresh this report.",
    )
  }
}
export function makeReportCursor(key: string, scope: string) {
  if (!key || key.length > 4000)
    throw new Error(
      "Original report identity exceeds continuation bounds; refine this report.",
    )
  return Buffer.from(JSON.stringify({ version: 1, scope, key })).toString(
    "base64url",
  )
}
