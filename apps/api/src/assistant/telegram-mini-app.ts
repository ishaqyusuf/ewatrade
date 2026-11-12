import { createHmac, timingSafeEqual } from "node:crypto"

/**
 * Workshop family 16 (Forms as a Telegram Mini App) is a proposal. This is only
 * its server-side gate: Telegram signs the Mini App's `initData`, and EwaTrade
 * must check that signature before trusting the Telegram user it names. No route
 * uses it yet; see the phase 6 notes for the route plan and what remains pending.
 *
 * Algorithm (Bot API, "Validating data received via the Mini App"): every field
 * except `hash`, as `key=value` sorted by key and joined with "\n", signed with
 * HMAC-SHA256 under the key HMAC-SHA256("WebAppData", bot token).
 */

export type TelegramMiniAppInit = {
  userId: string
  authDate: Date
  queryId: string | null
  chatType: string | null
  startParam: string | null
}

export type TelegramMiniAppInitResult =
  | { ok: true; init: TelegramMiniAppInit }
  | {
      ok: false
      reason: "malformed" | "signature" | "expired" | "user"
    }

const maxInitDataBytes = 8 * 1024

const positiveId = (value: unknown) =>
  typeof value === "number" && Number.isSafeInteger(value) && value > 0
    ? String(value)
    : null

export function verifyTelegramMiniAppInitData(
  initData: string,
  botToken: string,
  { now = new Date(), maxAgeMs = 60 * 60_000 } = {},
): TelegramMiniAppInitResult {
  if (
    !initData ||
    !botToken ||
    Buffer.byteLength(initData, "utf8") > maxInitDataBytes
  )
    return { ok: false, reason: "malformed" }
  const fields = new Map<string, string>()
  for (const [key, value] of new URLSearchParams(initData)) {
    if (fields.has(key)) return { ok: false, reason: "malformed" }
    fields.set(key, value)
  }
  const hash = fields.get("hash")
  if (!hash || !/^[0-9a-f]{64}$/.test(hash))
    return { ok: false, reason: "malformed" }
  fields.delete("hash")

  const checkString = [...fields.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n")
  const secret = createHmac("sha256", "WebAppData").update(botToken).digest()
  const expected = createHmac("sha256", secret).update(checkString).digest()
  if (!timingSafeEqual(expected, Buffer.from(hash, "hex")))
    return { ok: false, reason: "signature" }

  const authSeconds = Number(fields.get("auth_date"))
  if (!Number.isSafeInteger(authSeconds) || authSeconds <= 0)
    return { ok: false, reason: "malformed" }
  const authDate = new Date(authSeconds * 1000)
  if (
    authDate.getTime() > now.getTime() + 30_000 ||
    authDate.getTime() <= now.getTime() - maxAgeMs
  )
    return { ok: false, reason: "expired" }

  let userId: string | null = null
  try {
    const user = JSON.parse(fields.get("user") ?? "null") as {
      id?: unknown
      is_bot?: unknown
    } | null
    userId = user && user.is_bot !== true ? positiveId(user.id) : null
  } catch {
    userId = null
  }
  if (!userId) return { ok: false, reason: "user" }
  return {
    ok: true,
    init: {
      userId,
      authDate,
      queryId: fields.get("query_id") ?? null,
      chatType: fields.get("chat_type") ?? null,
      startParam: fields.get("start_param") ?? null,
    },
  }
}
