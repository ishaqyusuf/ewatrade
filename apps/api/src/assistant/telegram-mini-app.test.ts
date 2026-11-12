import { expect, test } from "bun:test"
import { createHmac } from "node:crypto"
import { verifyTelegramMiniAppInitData } from "./telegram-mini-app"

const token = "123:synthetic_test_token_123456789"
const now = new Date("2026-11-12T10:00:00Z")
const authDate = String(Math.floor(now.getTime() / 1000) - 60)

/** Sign like Telegram does, independently of the code under test. */
function signed(fields: Record<string, string>, botToken = token) {
  const secret = createHmac("sha256", "WebAppData").update(botToken).digest()
  const check = Object.keys(fields)
    .sort()
    .map((key) => `${key}=${fields[key]}`)
    .join("\n")
  const hash = createHmac("sha256", secret).update(check).digest("hex")
  return new URLSearchParams({ ...fields, hash }).toString()
}

const fields = {
  query_id: "AAH_synthetic",
  user: JSON.stringify({ id: 4501234567890, first_name: "Ada" }),
  auth_date: authDate,
  chat_type: "sender",
  signature: "synthetic-third-party-signature",
}

test("accepts Telegram-signed initData and returns only the verified user", () => {
  expect(verifyTelegramMiniAppInitData(signed(fields), token, { now })).toEqual(
    {
      ok: true,
      init: {
        userId: "4501234567890",
        authDate: new Date(Number(authDate) * 1000),
        queryId: "AAH_synthetic",
        chatType: "sender",
        startParam: null,
      },
    },
  )
})

test("rejects a changed field, another bot's signature and stale data", () => {
  const tampered = signed(fields).replace("4501234567890", "4501234567891")
  expect(verifyTelegramMiniAppInitData(tampered, token, { now })).toEqual({
    ok: false,
    reason: "signature",
  })
  expect(
    verifyTelegramMiniAppInitData(
      signed(fields, "999:other_synthetic_token_abcdefg"),
      token,
      { now },
    ),
  ).toEqual({ ok: false, reason: "signature" })
  expect(
    verifyTelegramMiniAppInitData(
      signed({ ...fields, auth_date: String(Number(authDate) - 3600) }),
      token,
      { now },
    ),
  ).toEqual({ ok: false, reason: "expired" })
})

test("rejects malformed input, repeated fields and bot or missing users", () => {
  const reject = (initData: string) =>
    verifyTelegramMiniAppInitData(initData, token, { now })
  expect(reject("")).toMatchObject({ ok: false, reason: "malformed" })
  expect(reject("auth_date=1&hash=xyz")).toMatchObject({
    ok: false,
    reason: "malformed",
  })
  expect(reject(`${signed(fields)}&user=%7B%22id%22%3A1%7D`)).toMatchObject({
    ok: false,
    reason: "malformed",
  })
  expect(reject("a".repeat(9000))).toMatchObject({
    ok: false,
    reason: "malformed",
  })
  expect(
    reject(
      signed({ ...fields, user: JSON.stringify({ id: 9, is_bot: true }) }),
    ),
  ).toMatchObject({ ok: false, reason: "user" })
  const { user: _, ...withoutUser } = fields
  expect(reject(signed(withoutUser))).toMatchObject({
    ok: false,
    reason: "user",
  })
})
