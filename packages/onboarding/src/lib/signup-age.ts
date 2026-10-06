export type EligibleAgeBand = "AGE_13_TO_15" | "AGE_16_TO_17" | "ADULT"

const storageKey = "ewatrade.signup-age"
const maxAgeMs = 24 * 60 * 60 * 1000
type AgeStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">

async function attemptId(token: string) {
  const hash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(token),
  )
  return Array.from(new Uint8Array(hash), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("")
}

export async function readSignupAge(
  storage: AgeStorage,
  token: string,
  now = Date.now(),
): Promise<EligibleAgeBand | null> {
  try {
    if (!token) return null
    const value = JSON.parse(storage.getItem(storageKey) ?? "null")
    if (!value) return null
    if (
      value.attempt !== (await attemptId(token)) ||
      typeof value.savedAt !== "number" ||
      value.savedAt > now ||
      now - value.savedAt >= maxAgeMs ||
      !["AGE_13_TO_15", "AGE_16_TO_17", "ADULT"].includes(value.ageBand)
    ) {
      storage.removeItem(storageKey)
      return null
    }
    return value.ageBand
  } catch {
    return null
  }
}

export async function saveSignupAge(
  storage: AgeStorage,
  token: string,
  ageBand: EligibleAgeBand,
  now = Date.now(),
) {
  try {
    if (!token) return
    storage.setItem(
      storageKey,
      JSON.stringify({
        attempt: await attemptId(token),
        ageBand,
        savedAt: now,
      }),
    )
  } catch {
    // Storage is optional; the ordinary age gate remains available.
  }
}

export function clearSignupAge(storage: AgeStorage) {
  try {
    storage.removeItem(storageKey)
  } catch {
    // Browser storage restrictions must not prevent signup completion.
  }
}
