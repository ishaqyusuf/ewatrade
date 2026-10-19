import { expect, test } from "bun:test"
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  type LivePhoneTransport,
  PhoneAuthRefused,
  createPhoneAuthTransport,
  recordPhoneOtpDelivery,
  runLivePhoneScenario,
} from "./qa-phone-auth-live"

test("Meta acceptance/queue diagnostics are persisted while the code prompt is still waiting", () => {
  const directory = mkdtempSync(join(tmpdir(), "ewatrade-phone-progress-"))
  const file = join(directory, "progress.json")
  try {
    const progress = {
      phase: "request-code",
      requestedCodes: 1,
      providerResults: [],
    }
    recordPhoneOtpDelivery(file, { recipientEnding: "7306" }, progress, 200, {
      messages: [
        {
          id: "wamid.synthetic-test",
          message_status: "held_for_quality_assessment",
        },
      ],
      contacts: [{ wa_id: "2348186877306" }],
      code: "654321",
      access_token: "never-retain-this-credential",
    })
    const text = readFileSync(file, "utf8")
    expect(JSON.parse(text)).toMatchObject({
      phase: "provider-accepted",
      requestedCodes: 1,
      providerResults: [
        {
          http: 200,
          accepted: true,
          messageId: "wamid.synthetic-test",
          messageStatus: "held_for_quality_assessment",
        },
      ],
    })
    expect(text).not.toMatch(/654321|never-retain|2348186877306/)
    expect(statSync(file).mode & 0o777).toBe(0o600)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test("provider rejection reports numeric diagnostics without copying raw error text", () => {
  const directory = mkdtempSync(join(tmpdir(), "ewatrade-phone-rejected-"))
  const file = join(directory, "progress.json")
  try {
    recordPhoneOtpDelivery(
      file,
      { passed: false, productionEnabled: false },
      { phase: "request-code", requestedCodes: 1, providerResults: [] },
      400,
      {
        error: {
          code: 131037,
          error_subcode: 99,
          message: "private-token-and-code-654321",
        },
      },
    )
    const text = readFileSync(file, "utf8")
    expect(JSON.parse(text)).toMatchObject({
      passed: false,
      phase: "provider-rejected",
      providerResults: [
        { accepted: false, errorCode: 131037, errorSubcode: 99 },
      ],
    })
    expect(text).not.toContain("private-token-and-code-654321")
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

function fixture(
  options: {
    devCode?: string
    differentUser?: boolean
    reusedSession?: boolean
    replay?: "accepted" | "network"
    access?: boolean
    challengePresent?: boolean
    replayCreatesSession?: boolean
  } = {},
) {
  let count = 0
  let observations = 0
  const modes: string[] = []
  const messages: string[] = []
  const used = new Set<string>()
  const transport: LivePhoneTransport = {
    request: async (input) => {
      modes.push(String(input.mode))
      return { devCode: options.devCode ?? null }
    },
    verify: async (input) => {
      if (used.has(input.mode)) {
        if (options.replay === "network") throw new Error("Network unavailable")
        if (options.replay !== "accepted")
          throw new PhoneAuthRefused("BAD_REQUEST")
      }
      used.add(input.mode)
      count += 1
      return {
        token: options.reusedSession
          ? "secret-session"
          : `secret-session-${count}`,
        profile: {
          id:
            options.differentUser && input.mode === "login"
              ? "other-user"
              : "test-user",
        },
        tenant: { id: "test-business" },
      }
    },
    access: async () => ({ hasBusinessAccess: options.access ?? true }),
  }
  const run = (signup = true) =>
    runLivePhoneScenario({
      phone: "+447700900245",
      signup: signup ? { name: "Test business" } : undefined,
      transport,
      readCode: async () => "927401",
      observeConsumption: async () => {
        observations += 1
        return {
          challengePresent: options.challengePresent ?? false,
          sessionCount:
            count +
            (options.replayCreatesSession && observations % 2 === 0 ? 1 : 0),
        }
      },
      progress: (message) => messages.push(message),
    })
  return { run, modes, messages }
}

test("real-code scenario proves signup, same-account sign-in and single use without retaining credentials", async () => {
  const f = fixture()
  const result = await f.run()
  expect(result).toMatchObject({
    signupPassed: true,
    signInPassed: true,
    sameAccount: true,
    replayRefused: true,
  })
  expect(f.modes).toEqual(["sign_up", "login"])
  expect(JSON.stringify([result, f.messages])).not.toMatch(
    /927401|secret-session/,
  )
})
test("repeat sign-in test needs only one delivery", async () => {
  const f = fixture()
  expect(await f.run(false)).toMatchObject({
    signupPassed: false,
    signInPassed: true,
    sameAccount: null,
  })
  expect(f.modes).toEqual(["login"])
})
test("fixed code output is refused before verification", async () => {
  await expect(fixture({ devCode: "123456" }).run()).rejects.toThrow(
    "development code",
  )
})
test("another user or a reused session cannot pass", async () => {
  await expect(fixture({ differentUser: true }).run()).rejects.toThrow(
    "signup account",
  )
  await expect(fixture({ reusedSession: true }).run()).rejects.toThrow(
    "fresh session",
  )
})
test("accepted replay or a network failure cannot establish single use", async () => {
  await expect(fixture({ replay: "accepted" }).run()).rejects.toThrow(
    "REPLAY_ACCEPTED",
  )
  await expect(fixture({ replay: "network" }).run()).rejects.toThrow(
    "Replay must be refused",
  )
})
test("session without workspace access fails", async () => {
  await expect(fixture({ access: false }).run()).rejects.toThrow(
    "open its business",
  )
})
test("persisted challenge or a new session after refused replay cannot pass", async () => {
  await expect(fixture({ challengePresent: true }).run()).rejects.toThrow(
    "consumed in storage",
  )
  await expect(fixture({ replayCreatesSession: true }).run()).rejects.toThrow(
    "issue another session",
  )
})
test("HTTP transport uses real auth routes and bearer headers; cannot switch recipient", async () => {
  const requests: Request[] = []
  const transport = createPhoneAuthTransport(
    async (request) => {
      requests.push(request)
      return Response.json({
        result: { data: { json: { devCode: null, hasBusinessAccess: true } } },
      })
    },
    "+447700900245",
    () => {},
  )
  await transport.request({ phone: "+447700900245", mode: "login" })
  await transport.access("private-session")
  expect(new URL(requests[0]?.url ?? "").pathname).toBe(
    "/api/trpc/auth.requestPhoneOtp",
  )
  expect(requests[0]?.method).toBe("POST")
  expect(requests[1]?.headers.get("authorization")).toBe(
    "Bearer private-session",
  )
  await expect(transport.request({ phone: "+447700900246" })).rejects.toThrow(
    "Recipient changed",
  )
  expect(requests).toHaveLength(2)
})
test("HTTP errors retain only the public classification", async () => {
  const transport = createPhoneAuthTransport(
    async () =>
      Response.json(
        {
          error: {
            json: {
              message: "secret server detail",
              data: { code: "BAD_REQUEST" },
            },
          },
        },
        { status: 400 },
      ),
    "+447700900245",
    () => {},
  )
  await expect(
    transport.verify({ phone: "+447700900245", mode: "login", code: "927401" }),
  ).rejects.toThrow("Phone authentication refused (BAD_REQUEST)")
})
