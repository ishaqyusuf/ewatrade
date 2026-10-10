import { expect, test } from "bun:test"
import { createHmac } from "node:crypto"
import { authenticatedEnvironment } from "./gateway-auth"
import { createPublisher } from "./publisher"
import { type VoiceTarget, voiceTargets } from "./targets"

function required<T>(value: T | undefined): T {
  if (value === undefined) throw new Error("Missing fixture value")
  return value
}

const targets: VoiceTarget[] = ["local", "dev", "preview", "production"].map(
  (environment, index) => ({
    environment: environment as VoiceTarget["environment"],
    registryUrl: `https://${environment}.example.com/api/assistant/voice/gateway`,
    publishSecret: `publish-${index}-`.repeat(4),
    gatewaySecret: `gateway-${index}-`.repeat(4),
  }),
)
const tunnel = "https://voice-test.ngrok-free.app"
const generation = "c41b50a0-95d6-401d-85c2-2b547461ea84"
const jsonConfig = (values: VoiceTarget[]) => ({
  ASSISTANT_VOICE_TARGETS_JSON: JSON.stringify(values),
})

test("all four targets are explicit; duplicate identities and secrets fail without leaking values", () => {
  expect(voiceTargets(jsonConfig(targets))).toHaveLength(4)
  for (const field of [
    "environment",
    "registryUrl",
    "publishSecret",
    "gatewaySecret",
  ] as const) {
    const duplicate = targets.map((target) => ({ ...target }))
    duplicate[1] = {
      ...required(duplicate[1]),
      [field]: required(duplicate[0])[field],
    }
    expect(() => voiceTargets(jsonConfig(duplicate))).toThrow(
      `distinct ${field}`,
    )
  }
  expect(() =>
    voiceTargets({ ASSISTANT_VOICE_TARGETS_JSON: "secret broken JSON" }),
  ).toThrow("credentials hidden")
})

test("one registry outage cannot block other environments; it recovers on the next renewal", async () => {
  let offline = true
  const writes: Array<{
    environment: string
    previousGeneration: string | null
    method: string
    authorization: string | null
  }> = []
  const publisher = createPublisher(targets, generation, {
    log: () => {},
    fetchImpl: (async (url, init) => {
      const target = required(
        targets.find((target) => target.registryUrl === String(url)),
      )
      if (target.environment === "preview" && offline)
        throw new Error("private upstream details")
      if (init?.method === "GET")
        return Response.json({
          lease: { generation: `previous-${target.environment}` },
        })
      writes.push({
        ...JSON.parse(String(init?.body)),
        method: required(init?.method),
        authorization: new Headers(init?.headers).get("Authorization"),
      })
      return Response.json({ accepted: true })
    }) as typeof fetch,
  })
  await publisher.publish(tunnel)
  expect(writes.map((write) => write.environment)).toEqual([
    "local",
    "dev",
    "production",
  ])
  offline = false
  await publisher.publish(tunnel)
  for (const target of targets) {
    const write = required(
      writes.findLast((write) => write.environment === target.environment),
    )
    expect(write.authorization).toBe(`Bearer ${target.publishSecret}`)
    expect(write.previousGeneration).toBe(
      target.environment === "preview" ? "previous-preview" : generation,
    )
  }
  await publisher.stop(tunnel)
  expect(
    writes
      .filter((write) => write.method === "DELETE")
      .map((write) => write.environment),
  ).toEqual(["local", "dev", "preview", "production"])
  const count = writes.length
  await publisher.publish(tunnel)
  expect(writes).toHaveLength(count)
})

test("lease conflict does not re-read and take over a newer publisher", async () => {
  let reads = 0
  let writes = 0
  const publisher = createPublisher([required(targets[0])], generation, {
    log: () => {},
    fetchImpl: (async (_url, init) => {
      if (init?.method === "GET") {
        reads++
        return Response.json({ lease: null })
      }
      writes++
      return new Response(null, { status: 409 })
    }) as typeof fetch,
  })
  await publisher.publish(tunnel)
  await publisher.publish(tunnel)
  expect(reads).toBe(1)
  expect(writes).toBe(2)
})

test("shutdown cancels an in-flight renewal then withdraws only this generation", async () => {
  let began: () => void = () => {}
  const pending = new Promise<void>((done) => {
    began = done
  })
  let deleted = false
  const publisher = createPublisher([required(targets[0])], generation, {
    log: () => {},
    fetchImpl: (async (_url, init) => {
      if (init?.method === "GET") return Response.json({ lease: null })
      if (init?.method === "DELETE") {
        expect(JSON.parse(String(init.body)).generation).toBe(generation)
        deleted = true
        return Response.json({ accepted: true })
      }
      began()
      return new Promise((_resolve, reject) =>
        init?.signal?.addEventListener(
          "abort",
          () => reject(new Error("aborted")),
          { once: true },
        ),
      )
    }) as typeof fetch,
  })
  const running = publisher.publish(tunnel)
  await pending
  await publisher.stop(tunnel)
  await running
  expect(deleted).toBe(true)
})

test("request origin follows the verified environment key, never a spoofed label", () => {
  const headers = new Headers({
    "x-voice-generation": generation,
    "x-voice-expires": "100",
    "x-voice-nonce": "nonce",
    "x-voice-digest": "digest",
    "x-voice-environment": "production",
  })
  const sign = (secret: string) =>
    createHmac("sha256", secret)
      .update(`/transcribe\n${generation}\n100\nnonce\ndigest`)
      .digest("hex")
  headers.set("x-voice-signature", sign(required(targets[2]).gatewaySecret))
  expect(
    authenticatedEnvironment(targets, headers, "/transcribe", generation),
  ).toBe("preview")
  expect(
    authenticatedEnvironment(targets, headers, "/health", generation),
  ).toBeNull()
  expect(
    authenticatedEnvironment(targets, headers, "/transcribe", "old-generation"),
  ).toBeNull()
  headers.set("x-voice-signature", sign("unconfigured-secret"))
  expect(
    authenticatedEnvironment(targets, headers, "/transcribe", generation),
  ).toBeNull()
})
