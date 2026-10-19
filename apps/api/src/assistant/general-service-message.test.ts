import { afterAll, beforeAll, expect, mock, test } from "bun:test"
import { capabilityManifest } from "@ewatrade/assistant/capabilities/manifest"
import type { GeneralAction } from "@ewatrade/assistant/general/contracts"
import { ServiceIntakeReviewError } from "@ewatrade/db/service-intake-review"
import type { GeneralTransactionContext } from "./general-actions"

// Only the canonical review, lock and record commands are stood in for (the
// DB package tests them); input mapping, wording, receipts and central
// authority are real.
const calls: Array<[string, Record<string, unknown>]> = []
let refusal: ServiceIntakeReviewError | null = null
const review = {
  jobId: "job-1",
  jobRevision: 4,
  storeId: "store-a",
  orderId: "order-1",
  orderNumber: "ORD-7",
  recipient: {
    name: "Amina",
    phone: "+234 803 000 1234",
    email: "amina@example.test",
  },
  channel: "whatsapp" as const,
  message: "Your shoes are ready for pickup.",
  reason: "Sent from the shop phone",
  alreadyShared: true as const,
}
const actual = await import("@ewatrade/db/queries")
mock.module("@ewatrade/db/queries", () => ({
  ...actual,
  lockServiceManualMessageTargetInTransaction: async (
    _tx: unknown,
    input: Record<string, unknown>,
  ) => {
    calls.push(["lock", input])
  },
  reviewServiceManualMessageInTransaction: async (
    _tx: unknown,
    input: Record<string, unknown>,
  ) => {
    calls.push(["review", input])
    if (refusal) throw refusal
    return { review, target: { id: "job-1", revision: "rev-1" } }
  },
  recordServiceManualMessageInTransaction: async (
    _tx: unknown,
    input: Record<string, unknown>,
  ) => {
    calls.push(["record", input])
    if (refusal) throw refusal
    return {
      intent: { id: "intent-1" },
      share: { id: "share-1" },
      review,
      replayed: false,
    }
  },
}))
const { serviceMessageShare } = await import("./general-service-message")
const {
  assertCapabilityAuthority,
  assertGeneralAction,
  assertGeneralActionAuthority,
} = await import("./general-context")

const savedKey = process.env.ASSISTANT_APPROVAL_SIGNING_KEY
beforeAll(() => {
  process.env.ASSISTANT_APPROVAL_SIGNING_KEY = "c".repeat(32)
})
afterAll(() => {
  if (savedKey === undefined)
    Reflect.deleteProperty(process.env, "ASSISTANT_APPROVAL_SIGNING_KEY")
  else process.env.ASSISTANT_APPROVAL_SIGNING_KEY = savedKey
})

type Share = Extract<GeneralAction, { action: "service_message_share" }>
const draft: Share = {
  action: "service_message_share",
  jobId: "job-1",
  channel: "whatsapp",
  message: "Your shoes are ready for pickup.",
  reason: "Sent from the shop phone",
  alreadyShared: true,
}
function context(
  role = "MANAGER",
  staffAccess: Record<string, unknown> = {
    status: "ACTIVE",
    mode: "LEGACY",
    businessRole: role,
    assignments: [],
  },
  client = "dashboard",
) {
  return {
    session: { user: { id: "manager-u" }, session: { id: "session" } },
    requestHeaders: new Headers({ "x-assistant-client": client }),
    tenantContext: {
      tenant: { id: "tenant-a", dataClassification: "QA" },
      membership: { role },
      activeStore: { id: "store-a", name: "Wuse" },
      stores: [{ id: "store-a" }],
      staffAccess,
    },
    db: {},
  } as unknown as GeneralTransactionContext
}
const serverInput = {
  tenantId: "tenant-a",
  storeId: "store-a",
  actorUserId: "manager-u",
  jobId: "job-1",
  channel: "whatsapp",
  message: "Your shoes are ready for pickup.",
  reason: "Sent from the shop phone",
  alreadyShared: true,
}

test("review discloses a staff-reported record, no send and customer tracking", async () => {
  calls.length = 0
  refusal = null
  const result = await serviceMessageShare.review(context(), draft)
  expect(calls).toEqual([["review", serverInput]])
  expect(result.target).toEqual({ id: "job-1", revision: "rev-1" })
  expect(result.lines).toEqual([
    "Record that you already shared this message with Amina · +234 803 000 1234 for ORD-7.",
    "How you shared it: WhatsApp from your own phone.",
    "Message: Your shoes are ready for pickup.",
    "Note: Sent from the shop phone",
    "This is a staff-reported record. ewatrade sends nothing, launches no app and does not verify delivery.",
    "The message will appear in the customer's tracking history for this Order.",
  ])
})

test("recipient, Store and tenant come from the server, never the draft", async () => {
  calls.length = 0
  refusal = null
  const smuggled = {
    ...draft,
    customerPhone: "+2348039999999",
    storeId: "store-b",
  } as unknown as Share
  await expect(
    serviceMessageShare.review(context(), smuggled),
  ).rejects.toThrow()
  expect(calls).toEqual([])
})

test("confirmation locks Order then Job, then records under the reviewed revision", async () => {
  calls.length = 0
  refusal = null
  const prepared = await serviceMessageShare.prepareExecution?.(
    context(),
    draft,
    { clientOperationId: "proposal-key", expectedReviewDigest: "x" },
  )
  expect(calls.map(([name]) => name)).toEqual(["lock", "review"])
  const receipt = await prepared?.execute("proposal-key-0001")
  expect(calls.at(-1)).toEqual([
    "record",
    {
      ...serverInput,
      clientCommandId: "proposal-key-0001",
      expectedReviewRevision: "rev-1",
    },
  ])
  expect(receipt).toEqual({
    kind: "service_manual_message",
    recordId: "intent-1",
    jobId: "job-1",
    orderId: "order-1",
    shareId: "share-1",
    title: "Manual share recorded",
    detail:
      "ORD-7 · You reported sharing this message by WhatsApp from your own phone with Amina · +234 803 000 1234. Nothing was sent by ewatrade and delivery is not verified. It now appears in the customer's tracking history.",
  })
})

test("canonical refusals keep their code and wording", async () => {
  for (const code of ["FORBIDDEN", "CONFLICT"] as const) {
    refusal = new ServiceIntakeReviewError(code, `refused ${code}`)
    await expect(
      serviceMessageShare.validate(context(), draft, true),
    ).rejects.toMatchObject({ code, message: `refused ${code}` })
    await expect(
      serviceMessageShare.execute(context(), draft, "proposal-key-0002"),
    ).rejects.toMatchObject({ code, message: `refused ${code}` })
  }
  refusal = null
})

test("central authority: legacy managers only, declared clients only, still planned", () => {
  const scoped = (storeRole: string) => ({
    status: "ACTIVE",
    mode: "SCOPED",
    businessRole: "MANAGER",
    catalogEditor: false,
    assignments: [{ storeId: "store-a", status: "ACTIVE", role: storeRole }],
  })
  const legacy = (role: string, status = "ACTIVE") => ({
    status,
    mode: "LEGACY",
    businessRole: role,
    assignments: [],
  })
  const read = capabilityManifest.find(
    (capability) => capability.id === "services.messages.read",
  )
  if (!read) throw Error("Read capability missing")
  for (const role of ["OWNER", "ADMIN", "MANAGER"]) {
    expect(() =>
      assertGeneralActionAuthority(
        context(role, legacy(role)),
        "service_message_share",
      ),
    ).not.toThrow()
    expect(() =>
      assertCapabilityAuthority(context(role, legacy(role)), read),
    ).not.toThrow()
  }
  // Scoped Managers have no procedure grant and the canonical command also
  // refuses them. A completed proposal's replay after access is lost runs
  // this same fresh authority check first.
  for (const ctx of [
    context("MANAGER", scoped("MANAGER")),
    context("MANAGER", scoped("OPERATOR")),
    context("CASHIER", legacy("CASHIER")),
    context("OPERATOR", legacy("OPERATOR")),
    context("MANAGER", legacy("MANAGER", "SUSPENDED")),
  ]) {
    expect(() =>
      assertGeneralActionAuthority(ctx, "service_message_share"),
    ).toThrow()
    expect(() => assertCapabilityAuthority(ctx, read)).toThrow()
  }
  expect(() =>
    assertGeneralActionAuthority(
      context("OWNER", legacy("OWNER"), "mobile"),
      "service_message_share",
    ),
  ).not.toThrow()
  expect(() =>
    assertCapabilityAuthority(
      context("OWNER", legacy("OWNER"), "mobile"),
      read,
    ),
  ).toThrow()
  for (const id of [
    "services.message.context.read",
    "services.message.original.read",
  ]) {
    const capability = capabilityManifest.find((row) => row.id === id)
    if (!capability) throw Error("Missing message read capability")
    expect(() =>
      assertCapabilityAuthority(
        context("OWNER", legacy("OWNER"), "mobile"),
        capability,
      ),
    ).not.toThrow()
    expect(() =>
      assertCapabilityAuthority(
        context("MANAGER", scoped("MANAGER")),
        capability,
      ),
    ).toThrow()
  }

  expect(() =>
    assertGeneralAction(
      context("OWNER", legacy("OWNER")),
      "service_message_share",
    ),
  ).toThrow()
})
