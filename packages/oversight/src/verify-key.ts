import { createHash, timingSafeEqual } from "node:crypto"
export function validOversightKey(
  received: string | undefined,
  expected: string | undefined,
) {
  if (!received || !expected || expected.length < 32) return false
  return timingSafeEqual(
    createHash("sha256").update(received).digest(),
    createHash("sha256").update(expected).digest(),
  )
}
