import { expect, test } from "bun:test"
import { createHmac } from "node:crypto"
import { authenticateOfficePrivacy } from "./office-auth"
const now = new Date("2026-10-12T18:00:00Z")
const key = "synthetic-key-for-office-auth-test-only"
const env = {
  OVERSIGHT_PRIVACY_ENABLED: "true",
  OVERSIGHT_PRIVACY_KEY: key,
  OVERSIGHT_PRIVACY_OPERATORS_JSON: JSON.stringify({
    office: {
      userId: "operator",
      scope: "process",
      expiresAt: "2026-10-13T00:00:00Z",
    },
    support: {
      userId: "support",
      scope: "read",
      expiresAt: "2026-10-13T00:00:00Z",
    },
  }),
}
function message(
  actorId = "office",
  operation = "workflow",
  issuedAt = now.toISOString(),
) {
  const body = JSON.stringify({
    version: 1,
    actorId,
    operation,
    issuedAt,
    input: { requestId: "synthetic" },
  })
  return {
    body,
    signature: createHmac("sha256", key).update(body).digest("hex"),
  }
}
test("signed server actor maps to an explicit genuine operator without caller authority", () => {
  const m = message()
  expect(
    authenticateOfficePrivacy(m.body, m.signature, env, now)?.operatorUserId,
  ).toBe("operator")
  expect(
    authenticateOfficePrivacy(
      m.body,
      m.signature,
      { ...env, OVERSIGHT_PRIVACY_ENABLED: "false" },
      now,
    ),
  ).toBeNull()
  expect(
    authenticateOfficePrivacy(
      m.body,
      m.signature,
      { ...env, OVERSIGHT_PRIVACY_KEY: "short" },
      now,
    ),
  ).toBeNull()
  expect(
    authenticateOfficePrivacy(
      m.body,
      m.signature,
      { ...env, OVERSIGHT_READ_KEY: key },
      now,
    ),
  ).toBeNull()
})
test("unsigned, altered, expired, future, unmapped and prototype actors are rejected", () => {
  for (const m of [
    message("unknown"),
    message("__proto__"),
    message("office", "workflow", "2026-10-12T17:58:59Z"),
    message("office", "workflow", "2026-10-12T18:01:01Z"),
  ])
    expect(authenticateOfficePrivacy(m.body, m.signature, env, now)).toBeNull()
  const m = message()
  expect(authenticateOfficePrivacy(m.body, "", env, now)).toBeNull()
  expect(
    authenticateOfficePrivacy(`${m.body} `, m.signature, env, now),
  ).toBeNull()
  expect(authenticateOfficePrivacy(m.body, "f".repeat(64), env, now)).toBeNull()
})
test("support can only read the reduced queue; operator mappings require current expiry", () => {
  const q = message("support", "queue")
  expect(authenticateOfficePrivacy(q.body, q.signature, env, now)?.scope).toBe(
    "read",
  )
  for (const op of ["workflow", "advance"]) {
    const m = message("support", op)
    expect(authenticateOfficePrivacy(m.body, m.signature, env, now)).toBeNull()
  }
  const m = message()
  expect(
    authenticateOfficePrivacy(
      m.body,
      m.signature,
      {
        ...env,
        OVERSIGHT_PRIVACY_OPERATORS_JSON:
          '{"office":{"userId":"operator","scope":"process","expiresAt":"2026-10-12T17:59:00Z"}}',
      },
      now,
    ),
  ).toBeNull()
})
test("malformed settings and unknown envelope fields fail closed", () => {
  const m = message()
  expect(
    authenticateOfficePrivacy(
      m.body,
      m.signature,
      { ...env, OVERSIGHT_PRIVACY_OPERATORS_JSON: "invalid" },
      now,
    ),
  ).toBeNull()
  const b = JSON.stringify({
    ...JSON.parse(m.body),
    operatorUserId: "caller-spoof",
  })
  expect(
    authenticateOfficePrivacy(
      b,
      createHmac("sha256", key).update(b).digest("hex"),
      env,
      now,
    ),
  ).toBeNull()
})
