import { timingSafeEqual } from "node:crypto"

export function safeCompare(
  left: string | null | undefined,
  right: string | null | undefined,
) {
  if (!left || !right) return false

  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)

  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  )
}
