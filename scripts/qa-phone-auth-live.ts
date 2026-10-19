import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { emitKeypressEvents } from "node:readline"
import { createInterface } from "node:readline/promises"
import { parseEnv } from "node:util"

type Mode = "sign_up" | "login"
type Session = {
  token: string
  profile: { id: string }
  tenant: { id: string } | null
}
export type LivePhoneTransport = {
  request(input: Record<string, unknown>): Promise<{ devCode: string | null }>
  verify(input: { phone: string; mode: Mode; code: string }): Promise<Session>
  access(token: string): Promise<{ hasBusinessAccess: boolean }>
}

type PhoneOtpDelivery = {
  http: number
  accepted: boolean
  messageId?: string
  messageStatus?: string
  errorCode?: number
  errorSubcode?: number
}

/** Retain only delivery diagnostics; never the request/code or raw response. */
export function recordPhoneOtpDelivery(
  file: string,
  report: Record<string, unknown>,
  progress: {
    phase: string
    requestedCodes: number
    providerResults: PhoneOtpDelivery[]
  },
  http: number,
  payload: unknown,
) {
  const object = (value: unknown): Record<string, unknown> =>
    value !== null && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {}
  const body = object(payload)
  const message = object(
    Array.isArray(body.messages) ? body.messages[0] : undefined,
  )
  const error = object(body.error)
  const id =
    typeof message.id === "string" &&
    message.id.length <= 512 &&
    /^wamid\.[A-Za-z0-9+/_=.-]+$/.test(message.id)
      ? message.id
      : undefined
  const status = ["accepted", "held_for_quality_assessment", "paused"].includes(
    String(message.message_status),
  )
    ? String(message.message_status)
    : undefined
  progress.providerResults.push({
    http,
    accepted:
      http >= 200 &&
      http < 300 &&
      typeof message.id === "string" &&
      message.id.length > 0,
    messageId: id,
    messageStatus: status,
    errorCode: typeof error.code === "number" ? error.code : undefined,
    errorSubcode:
      typeof error.error_subcode === "number" ? error.error_subcode : undefined,
  })
  progress.phase = progress.providerResults.at(-1)?.accepted
    ? "provider-accepted"
    : "provider-rejected"
  writeFileSync(
    file,
    JSON.stringify(
      { ...report, ...progress, updatedAt: new Date().toISOString() },
      null,
      2,
    ),
    { mode: 0o600 },
  )
}

/** Uses the public auth contract; codes/tokens never enter its returned report. */
export async function runLivePhoneScenario(input: {
  phone: string
  signup?: Record<string, unknown>
  transport: LivePhoneTransport
  readCode(mode: Mode): Promise<string>
  observeConsumption(
    mode: Mode,
    userId: string,
  ): Promise<{ challengePresent: boolean; sessionCount: number }>
  progress(message: string): void
}) {
  const { transport, phone } = input
  let firstUserId: string | undefined
  let firstToken: string | undefined
  let tenantId: string | undefined
  let verified = 0
  let replayRefused = false
  for (const mode of (input.signup
    ? ["sign_up", "login"]
    : ["login"]) as Mode[]) {
    const challenge = await transport.request({
      ...(mode === "sign_up" ? input.signup : {}),
      phone,
      mode,
    })
    assert.equal(
      challenge.devCode,
      null,
      "Live tests must never expose a development code",
    )
    input.progress(
      `WhatsApp ${mode === "sign_up" ? "signup" : "sign-in"} code requested. Check your phone.`,
    )
    const code = await input.readCode(mode)
    assert.match(code, /^\d{6}$/, "Enter exactly six digits")
    const session = await transport.verify({ phone, mode, code })
    assert.ok(
      session.token && session.profile.id,
      "A genuine session is required",
    )
    if (firstUserId) {
      assert.equal(
        session.profile.id,
        firstUserId,
        "Sign-in must return the signup account",
      )
      assert.notEqual(
        session.token,
        firstToken,
        "Sign-in must issue a fresh session",
      )
      assert.equal(
        session.tenant?.id,
        tenantId,
        "Sign-in must return the same business",
      )
    } else {
      firstUserId = session.profile.id
      firstToken = session.token
      tenantId = session.tenant?.id
    }
    assert.equal(
      (await transport.access(session.token)).hasBusinessAccess,
      true,
      "Persisted bearer session must open its business",
    )
    verified += 1
    const consumed = await input.observeConsumption(mode, session.profile.id)
    assert.equal(
      consumed.challengePresent,
      false,
      "Verified challenge must be consumed in storage",
    )
    assert.ok(consumed.sessionCount > 0, "Session must exist in storage")
    try {
      await transport.verify({ phone, mode, code })
      throw new Error("REPLAY_ACCEPTED")
    } catch (error) {
      if (error instanceof Error && error.message === "REPLAY_ACCEPTED")
        throw error
      // Network/server errors cannot prove single-use consumption.
      assert.ok(
        error instanceof PhoneAuthRefused && error.code === "BAD_REQUEST",
        "Replay must be refused by authentication",
      )
      replayRefused = true
    }
    assert.deepEqual(
      await input.observeConsumption(mode, session.profile.id),
      consumed,
      "Replay must not recreate a challenge or issue another session",
    )
    input.progress(
      `PASS: ${mode === "sign_up" ? "signup" : "sign-in"}, saved bearer session and single-use code.`,
    )
  }
  return {
    signupPassed: Boolean(input.signup),
    signInPassed: true,
    sameAccount: input.signup ? verified === 2 : null,
    replayRefused,
    userId: firstUserId,
    tenantId,
  }
}

export class PhoneAuthRefused extends Error {
  constructor(readonly code: string) {
    super(`Phone authentication refused (${code})`)
  }
}

export function createPhoneAuthTransport(
  fetcher: (request: Request) => Response | Promise<Response>,
  phone: string,
  onRequest: () => void,
): LivePhoneTransport {
  async function call(path: string, input?: unknown, token?: string) {
    const url = new URL(`/api/trpc/${path}`, "http://127.0.0.1")
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "x-real-ip": "127.0.0.1",
    }
    if (token) headers.authorization = `Bearer ${token}`
    if (input === undefined)
      url.searchParams.set("input", JSON.stringify({ json: null }))
    const response = await fetcher(
      new Request(url, {
        method: input === undefined ? "GET" : "POST",
        headers,
        ...(input === undefined
          ? {}
          : { body: JSON.stringify({ json: input }) }),
      }),
    )
    const body = (await response.json()) as {
      error?: { json?: { message?: string; data?: { code?: string } } }
      result?: { data?: { json?: unknown } }
    }
    if (!response.ok || body.error) {
      throw new PhoneAuthRefused(body.error?.json?.data?.code ?? "UNKNOWN")
    }
    assert.ok(
      body.result?.data && "json" in body.result.data,
      "Invalid auth API response",
    )
    return body.result.data.json
  }
  return {
    request: async (input) => {
      assert.equal(input.phone, phone, "Recipient changed during test")
      onRequest()
      return (await call("auth.requestPhoneOtp", input)) as {
        devCode: string | null
      }
    },
    verify: async (input) => {
      assert.equal(input.phone, phone, "Recipient changed during test")
      return (await call("auth.verifyPhoneOtp", input)) as Session
    },
    access: async (token) =>
      (await call("auth.getMobileAccessProfile", undefined, token)) as {
        hasBusinessAccess: boolean
      },
  }
}

async function question(prompt: string) {
  const terminal = createInterface({
    input: process.stdin,
    output: process.stdout,
  })
  try {
    return (await terminal.question(prompt)).trim()
  } finally {
    terminal.close()
  }
}

function hiddenCode(): Promise<string> {
  assert.ok(
    process.stdin.isTTY && process.stdout.isTTY,
    "Run this command directly in your Terminal; OTP input is private",
  )
  process.stdout.write("Received six-digit code (hidden; never saved): ")
  emitKeypressEvents(process.stdin)
  const previousRaw = process.stdin.isRaw
  process.stdin.setRawMode(true)
  process.stdin.resume()
  return new Promise((resolveCode, reject) => {
    let code = ""
    const finish = (cancel: boolean) => {
      process.stdin.off("keypress", keypress)
      process.stdin.setRawMode(previousRaw)
      process.stdin.pause()
      process.stdout.write("\n")
      const result = code
      code = ""
      if (cancel) reject(new Error("Test cancelled"))
      else resolveCode(result)
    }
    function keypress(text: string, key: { ctrl?: boolean; name?: string }) {
      if (key.ctrl && key.name === "c") return finish(true)
      if (key.name === "return" && code.length === 6) return finish(false)
      if (key.name === "backspace") code = code.slice(0, -1)
      else if (/^\d$/.test(text) && code.length < 6) code += text
    }
    process.stdin.on("keypress", keypress)
  })
}

async function main() {
  const args = process.argv.slice(2)
  if (args.includes("--help")) {
    console.log(
      "bun qa:phone-auth-live --phone +COUNTRYNUMBER [--check | --sign-in-only]\nDevelopment database only. Real WhatsApp billing applies. Run in your Terminal for hidden code entry. No emulator, deployment or global activation.",
    )
    return
  }
  const phoneIndex = args.indexOf("--phone")
  const phone = args[phoneIndex + 1]
  assert.ok(
    phoneIndex >= 0 && phone && /^\+[1-9]\d{7,14}$/.test(phone),
    "Supply --phone with an international number",
  )
  const known = new Set(["--phone", phone, "--check", "--sign-in-only"])
  assert.ok(
    args.every((arg) => known.has(arg)),
    "Unknown argument; use --help",
  )
  assert.equal(
    process.env.DATABASE_PROFILE_VERIFIED,
    "1",
    "Use bun qa:phone-auth-live so the database profile is verified",
  )
  assert.equal(
    process.env.DEV_PROFILE,
    "local",
    "This runner supports the local Neon Development database only",
  )
  assert.equal(process.env.APP_ENV, "local")
  assert.equal(
    process.env.NODE_ENV,
    "production",
    "Random-code mode is mandatory",
  )
  await import("../apps/api/src/shared-env")
  assert.ok(
    (process.env.BETTER_AUTH_SECRET ?? process.env.AUTH_SECRET)?.trim(),
    "Authentication secret is missing",
  )
  const { isLocalPhoneAuth } = await import(
    "../packages/db/src/queries/phone-auth-profile"
  )
  assert.equal(isLocalPhoneAuth(), false, "Fixed codes are forbidden")
  const root = resolve(import.meta.dir, "..")
  const credentialPath = resolve(root, ".env.dev")
  assert.equal(
    statSync(credentialPath).mode & 0o077,
    0,
    "Provider secret file must be private",
  )
  const provider = parseEnv(readFileSync(credentialPath, "utf8"))
  assert.equal(
    provider.WHATSAPP_OTP_ENABLED,
    "false",
    "Shared provider gate must remain disabled",
  )
  assert.equal(provider.WHATSAPP_OTP_PHONE_NUMBER_ID, "1392318457295932")
  assert.equal(provider.WHATSAPP_OTP_TEMPLATE_NAME, "ewatrade_login_otp")
  assert.equal(provider.WHATSAPP_OTP_TEMPLATE_LANGUAGE, "en_US")
  assert.ok(
    provider.WHATSAPP_OTP_ACCESS_TOKEN,
    "Approved provider token is missing",
  )
  // The sole cross-profile read is the explicitly approved OTP credential; DB,
  // auth and other settings remain owned by the selected local profile.
  for (const key of [
    "ACCESS_TOKEN",
    "PHONE_NUMBER_ID",
    "TEMPLATE_NAME",
    "TEMPLATE_LANGUAGE",
  ])
    process.env[`WHATSAPP_OTP_${key}`] = provider[`WHATSAPP_OTP_${key}`]
  process.env.WHATSAPP_OTP_ENABLED = "true"
  process.env.ACCOUNT_PRIVACY_TRUSTED_CLIENT_IP_HEADER = "x-real-ip"
  process.env.WHATSAPP_ASSISTANT_ENABLED = "false"
  process.env.PERFORMANCE_TRACE = "false"
  const { prisma } = await import("../packages/db/src/client")
  const startedAt = new Date().toISOString()
  let report: Record<string, unknown> = {
    passed: false,
    startedAt,
    environment: "local-Neon-Development",
    productionEnabled: false,
    recipientEnding: phone.slice(-4),
  }
  let sent = 0
  let phase = "preflight"
  const providerResults: PhoneOtpDelivery[] = []
  const originalFetch = globalThis.fetch
  const reportDir = resolve(root, ".scratch/whatsapp-otp/live")
  mkdirSync(reportDir, { recursive: true, mode: 0o700 })
  const reportFile = resolve(
    reportDir,
    `${Date.now()}-${randomUUID().slice(0, 8)}.json`,
  )
  const saveProgress = () => {
    if (!args.includes("--check"))
      writeFileSync(
        reportFile,
        JSON.stringify(
          {
            ...report,
            phase,
            requestedCodes: sent,
            providerResults,
            updatedAt: new Date().toISOString(),
          },
          null,
          2,
        ),
        { mode: 0o600 },
      )
  }
  saveProgress()
  try {
    const existing = await prisma.user.findUnique({
      where: { phone },
      select: { id: true },
    })
    console.log(
      `PASS: verified Development database, random codes and approved sender; recipient ending ${phone.slice(-4)}. Production stays disabled.`,
    )
    if (args.includes("--check")) {
      console.log(
        `PASS: configuration check only; no code requested. Account ${existing ? "exists; use --sign-in-only" : "is available for signup"}.`,
      )
      return
    }
    const loginOnly = args.includes("--sign-in-only")
    assert.ok(
      loginOnly ? existing : !existing,
      loginOnly
        ? "No phone account exists; run signup first"
        : "Phone account already exists; use --sign-in-only. Existing identities are never merged or deleted",
    )
    assert.ok(
      process.stdin.isTTY && process.stdout.isTTY,
      "Run directly in your Terminal to enter received codes privately",
    )
    console.log(
      `${loginOnly ? "One" : "Two"} real WhatsApp codes will be sent. A new signup creates a clearly named test business; no existing account is changed or erased.`,
    )
    phase = "awaiting-start-confirmation"
    saveProgress()
    assert.equal(
      await question("Type SEND to start: "),
      "SEND",
      "Test cancelled; no code sent",
    )
    let signup: Record<string, unknown> | undefined
    if (!loginOnly) {
      phase = "awaiting-age-choice"
      saveProgress()
      const age = await question(
        "Your age range: 1 = 13–15, 2 = 16–17, 3 = 18 or older: ",
      )
      const ageBand = (
        { "1": "AGE_13_TO_15", "2": "AGE_16_TO_17", "3": "ADULT" } as Record<
          string,
          string
        >
      )[age]
      assert.ok(ageBand, "Choose an eligible age range")
      signup = {
        ageBand,
        name: "WhatsApp OTP Test",
        businessName: `WhatsApp OTP Test ${randomUUID().slice(0, 8)}`,
        businessProfileKey: "general-retail-groceries",
        businessProfileVersion: 1,
        operatingModel: "products",
        orderChannels: ["walk_in"],
        teamSize: "solo",
        countryCode: "NG",
        currencyCode: "NGN",
      }
    }
    const { app } = await import("../apps/api/src/index")
    const { buildPhoneOtpIdentifier } = await import(
      "../packages/db/src/queries/phone-otp-identifier"
    )
    globalThis.fetch = (async (
      input: Parameters<typeof fetch>[0],
      init?: Parameters<typeof fetch>[1],
    ) => {
      const url = String(input instanceof Request ? input.url : input)
      if (
        url.startsWith("https://graph.facebook.com/") &&
        url.endsWith("/messages")
      ) {
        const body = JSON.parse(String(init?.body))
        assert.equal(body.to, phone.slice(1), "Provider recipient changed")
        assert.equal(
          body.template?.name,
          "ewatrade_login_otp",
          "Provider template changed",
        )
        const response = await originalFetch(input, {
          ...init,
          signal: AbortSignal.timeout(30000),
        })
        const value = await response
          .clone()
          .json()
          .catch(() => ({}))
        recordPhoneOtpDelivery(
          reportFile,
          report,
          { phase, requestedCodes: sent, providerResults },
          response.status,
          value,
        )
        return response
      }
      return originalFetch(input, init)
    }) as typeof fetch
    const result = await runLivePhoneScenario({
      phone,
      signup,
      progress: (message) => {
        phase = message.startsWith("PASS:") ? "verified" : "awaiting-code"
        saveProgress()
        console.log(message)
      },
      readCode: async () => {
        const code = await hiddenCode()
        phase = "verify-received-code"
        saveProgress()
        return code
      },
      observeConsumption: async (mode, userId) => {
        const [challenge, sessionCount] = await Promise.all([
          prisma.verification.findFirst({
            where: { identifier: buildPhoneOtpIdentifier(phone, mode) },
            select: { id: true },
          }),
          prisma.session.count({ where: { userId } }),
        ])
        return { challengePresent: Boolean(challenge), sessionCount }
      },
      transport: createPhoneAuthTransport(
        (request) => app.fetch(request),
        phone,
        () => {
          phase = "request-code"
          assert.ok(sent < 2, "Live test send budget exceeded")
          sent += 1
          saveProgress()
        },
      ),
    })
    const user = await prisma.user.findUniqueOrThrow({
      where: { phone },
      select: { id: true, phoneVerifiedAt: true, emailVerified: true },
    })
    assert.equal(user.id, result.userId)
    assert.ok(user.phoneVerifiedAt, "Phone verification must be persisted")
    if (signup)
      assert.equal(
        user.emailVerified,
        false,
        "Phone signup must not verify email",
      )
    report = {
      ...report,
      ...result,
      passed: true,
      requestedCodes: sent,
      providerResults,
      phoneVerified: true,
      finishedAt: new Date().toISOString(),
    }
    console.log(
      "PASS: real WhatsApp phone authentication. Codes and session tokens were not saved. Production rollout remains separate.",
    )
  } catch (error) {
    report = {
      ...report,
      requestedCodes: sent,
      phase,
      providerResults,
      failureCode:
        error instanceof PhoneAuthRefused
          ? error.code
          : "CHECK_FAILED_OR_CANCELLED",
      finishedAt: new Date().toISOString(),
    }
    console.error(
      `Stopped at ${phase}${error instanceof PhoneAuthRefused ? ` (${error.code})` : ""}.`,
    )
    const providerFailure = providerResults.find((value) => !value.accepted)
    if (providerFailure)
      console.error(
        `Meta refused delivery: HTTP ${providerFailure.http}, code ${providerFailure.errorCode ?? "unavailable"}.`,
      )
    throw new Error(
      "Live phone auth test did not pass. No automatic resend. If signup completed, resume with --sign-in-only; use a new code after the cooldown.",
    )
  } finally {
    globalThis.fetch = originalFetch
    if (!args.includes("--check")) {
      writeFileSync(reportFile, JSON.stringify(report, null, 2), {
        mode: 0o600,
      })
      console.log(`Sanitized report: ${reportFile}`)
    }
    await prisma.$disconnect()
  }
}

if (import.meta.main) {
  try {
    await main()
    process.exit(0)
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : "Phone auth check failed",
    )
    process.exit(1)
  }
}
