import { expect, test } from "bun:test"
import {
  type QuickSaleCorrectionAttempt,
  blankQuickSaleLines,
  correctionAvailability,
  correctionDescriptions,
  correctionKey,
  correctionView,
  expectedCorrectionEnvelope,
  restoreCorrectionAttempt,
  validateCorrectionReceipt,
} from "./quick-sale-correction"

const payload = {
  lines: [
    { custom: "quick_sale", amountMinor: 1_200_000 },
    {
      custom: "additional_cost",
      amountMinor: 150_000,
      description: "Delivery",
    },
    { offeringId: "offering-a", quantity: 1 },
    { custom: "quick_sale", amountMinor: 450_000, description: "   " },
  ],
  initialPayment: {
    clientPaymentId: "payment-original",
    amountMinor: 1_800_000,
  },
  customerName: "Walk-in",
}
const owner = {
  actorUserId: "actor-a",
  businessId: "business-a",
  storeId: "store-a",
  deviceId: "device-a",
}
const key = correctionKey({ ...owner, clientCommandId: "command-original" })
const attempt: QuickSaleCorrectionAttempt = {
  key,
  ...owner,
  original: {
    clientCommandId: "command-original",
    eventVersion: 1,
    payload,
    dependencyClientIds: ["command-earlier"],
    createdAtClient: new Date("2026-10-13T16:12:00.000Z"),
  },
  replacementClientCommandId: "command-replacement",
  replacementClientPaymentId: "payment-replacement",
  descriptions: [
    { lineIndex: 0, description: "2 bags of rice" },
    { lineIndex: 3, description: "Palm oil" },
  ],
  state: "sent",
}

test("blank Quick sale lines only; Additional cost and catalog never count", () => {
  expect(blankQuickSaleLines(payload)).toEqual([0, 3])
  expect(
    blankQuickSaleLines({
      lines: [{ custom: "quick_sale", description: "Rice" }],
    }),
  ).toEqual([])
  expect(
    blankQuickSaleLines({ lines: [{ custom: "quick_sale", description: 5 }] }),
  ).toEqual([])
  expect(blankQuickSaleLines(null)).toEqual([])
})

test("every blank line needs one trimmed 1–200 character description", () => {
  expect(correctionDescriptions([0, 3], { 0: " Rice ", 3: "Oil" })).toEqual([
    { lineIndex: 0, description: "Rice" },
    { lineIndex: 3, description: "Oil" },
  ])
  expect(correctionDescriptions([0, 3], { 0: "Rice" })).toBeNull()
  expect(correctionDescriptions([0, 3], { 0: "Rice", 3: "   " })).toBeNull()
  expect(
    correctionDescriptions([0, 3], { 0: "Rice", 3: "x".repeat(201) }),
  ).toBeNull()
  expect(correctionDescriptions([0], { 0: "Rice", 1: "Delivery" })).toBeNull()
  expect(correctionDescriptions([], {})).toBeNull()
})

test("the expected envelope changes only identities and blank descriptions", () => {
  const envelope = expectedCorrectionEnvelope(attempt)
  expect(envelope.clientCommandId).toBe("command-replacement")
  expect(envelope.dependencyClientIds).toEqual(["command-earlier"])
  expect(envelope.createdAtClient.toISOString()).toBe(
    "2026-10-13T16:12:00.000Z",
  )
  expect(envelope.payload.lines).toEqual([
    {
      custom: "quick_sale",
      amountMinor: 1_200_000,
      description: "2 bags of rice",
    },
    payload.lines[1],
    payload.lines[2],
    { custom: "quick_sale", amountMinor: 450_000, description: "Palm oil" },
  ])
  expect(envelope.payload.initialPayment as unknown).toEqual({
    clientPaymentId: "payment-replacement",
    amountMinor: 1_800_000,
  })
  // The original is never mutated.
  expect(payload.lines[0]).toEqual({
    custom: "quick_sale",
    amountMinor: 1_200_000,
  })
  expect(payload.initialPayment.clientPaymentId).toBe("payment-original")
})

const receipt = () => ({
  outcome: "replaced",
  originalClientCommandId: "command-original",
  originalPayloadHash: "hash-original",
  replacement: {
    id: "server-row",
    envelope: expectedCorrectionEnvelope(attempt),
    payloadHash: "hash-replacement",
    status: "REVIEW_REQUIRED",
    recoveryHeld: false,
    result: null,
  },
  replacedAt: new Date(),
})

test("a matching receipt validates; every forged association is refused", () => {
  expect(validateCorrectionReceipt(attempt, receipt())).toMatchObject({
    outcome: "replaced",
    status: "REVIEW_REQUIRED",
    recoveryHeld: false,
  })
  // A receipt as untrusted JSON: every field may be rewritten to anything.
  type ForgedReceipt = {
    outcome: unknown
    originalClientCommandId: unknown
    replacement: {
      status: unknown
      recoveryHeld: unknown
      envelope: {
        clientCommandId: unknown
        createdAtClient: unknown
        dependencyClientIds: unknown
        payload: {
          customerName?: unknown
          lines: Array<Record<string, unknown>>
          initialPayment: Record<string, unknown>
        }
      }
    }
  }
  const forged = (mutate: (value: ForgedReceipt) => void) => {
    const value: ForgedReceipt = JSON.parse(JSON.stringify(receipt()))
    value.replacement.envelope.createdAtClient = new Date(
      value.replacement.envelope.createdAtClient as string,
    )
    mutate(value)
    return validateCorrectionReceipt(attempt, value)
  }
  expect(
    forged((v) => {
      v.originalClientCommandId = "command-other"
    }),
  ).toBeNull()
  expect(
    forged((v) => {
      v.replacement.envelope.clientCommandId = "command-x"
    }),
  ).toBeNull()
  expect(
    forged((v) => {
      const line = v.replacement.envelope.payload.lines[1]
      if (line) line.amountMinor = 1
    }),
  ).toBeNull()
  expect(
    forged((v) => {
      v.replacement.envelope.payload.customerName = "Someone"
    }),
  ).toBeNull()
  expect(
    forged((v) => {
      v.replacement.envelope.payload.initialPayment.clientPaymentId =
        "payment-original"
    }),
  ).toBeNull()
  expect(
    forged((v) => {
      v.replacement.envelope.dependencyClientIds = []
    }),
  ).toBeNull()
  expect(
    forged((v) => {
      v.replacement.status = "SAVED"
    }),
  ).toBeNull()
  expect(
    forged((v) => {
      v.replacement.recoveryHeld = "no"
    }),
  ).toBeNull()
  expect(
    forged((v) => {
      v.outcome = "created"
    }),
  ).toBeNull()
  expect(validateCorrectionReceipt(attempt, null)).toBeNull()
  // already_applied needs the original's actual canonical result.
  expect(
    validateCorrectionReceipt(attempt, {
      outcome: "already_applied",
      originalClientCommandId: "command-original",
      result: null,
    }),
  ).toBeNull()
  expect(
    validateCorrectionReceipt(attempt, {
      outcome: "already_applied",
      originalClientCommandId: "command-original",
      result: { orderId: "order-a" },
    }),
  ).toEqual({ outcome: "already_applied", result: { orderId: "order-a" } })
})

test("restore keeps exact identities, turns sent into unknown, and never trusts malformed attempts", () => {
  const saved = JSON.parse(JSON.stringify(attempt))
  const restored = restoreCorrectionAttempt(key, saved)
  expect(restored?.state).toBe("unknown")
  expect(restored?.replacementClientCommandId).toBe("command-replacement")
  expect(restored?.original.createdAtClient).toBeInstanceOf(Date)
  for (const broken of [
    { ...saved, replacementClientCommandId: "x" },
    { ...saved, actorUserId: "actor-b" },
    { ...saved, descriptions: [{ lineIndex: 0, description: "Rice" }] },
    { ...saved, replacementClientPaymentId: undefined },
    { ...saved, state: "saved" },
    "nonsense",
  ])
    expect(restoreCorrectionAttempt(key, broken)?.state).toBe("invalid")
  expect(restoreCorrectionAttempt("not-json", saved)).toBeNull()
})

test("availability: corrected, terminal, held and depended-on originals", () => {
  const original = {
    clientCommandId: "command-original",
    payload,
    dependencyClientIds: [],
    localStatus: "blocked",
  }
  expect(correctionAvailability(original, [original])).toBe("eligible")
  expect(
    correctionAvailability({ ...original, recoveryHeld: true }, [original]),
  ).toBe("needs_owner")
  expect(
    correctionAvailability(original, [
      original,
      {
        clientCommandId: "child",
        payload: {},
        dependencyClientIds: ["command-original"],
        localStatus: "pending",
      },
    ]),
  ).toBe("needs_owner")
  expect(
    correctionAvailability(
      { ...original, correctedBy: "command-replacement" },
      [],
    ),
  ).toBe("unavailable")
  expect(
    correctionAvailability({ ...original, localStatus: "applied" }, []),
  ).toBe("unavailable")
})

test("the merchant never sees an absence claim without a server answer", () => {
  const views = [
    correctionView({
      availability: "eligible",
      attempt: null,
      sending: false,
      canSend: true,
    }),
    correctionView({
      availability: "needs_owner",
      attempt: null,
      sending: false,
      canSend: true,
    }),
    ...(["ready", "sent", "unknown", "refused", "invalid"] as const).map(
      (state) =>
        correctionView({
          availability: "eligible",
          attempt: { ...attempt, state },
          sending: false,
          canSend: true,
        }),
    ),
    correctionView({
      availability: "eligible",
      attempt,
      sending: true,
      canSend: true,
    }),
  ]
  for (const view of views) {
    expect(view.business).not.toMatch(
      /^Not recorded|never reached|wasn't recorded/i,
    )
    expect([
      "Not confirmed yet",
      "Not confirmed · check with your owner",
      "Check with your owner",
    ]).toContain(view.business)
  }
  expect(views[0]?.editable).toBe(true)
  expect(views.slice(1).every((view) => !view.editable)).toBe(true)
  const replaced = { ...attempt, state: "replaced" as const }
  expect(
    correctionView({
      availability: "unavailable",
      attempt: replaced,
      replacementStatus: "approval",
      sending: false,
      canSend: true,
    }).business,
  ).toBe("Waiting for owner review")
  expect(
    correctionView({
      availability: "unavailable",
      attempt: replaced,
      replacementStatus: "pending",
      sending: false,
      canSend: true,
    }).business,
  ).toBe("Recording on next sync")
  expect(
    correctionView({
      availability: "unavailable",
      attempt: replaced,
      replacementStatus: "applied",
      sending: false,
      canSend: true,
    }).business,
  ).toBe("Recorded")
  expect(
    correctionView({
      availability: "unavailable",
      attempt: { ...attempt, state: "already_applied" },
      sending: false,
      canSend: true,
    }).business,
  ).toBe("Already recorded")
  // Offline: the description can be typed, but sending waits.
  expect(
    correctionView({
      availability: "eligible",
      attempt: null,
      sending: false,
      canSend: false,
    }).banner?.title,
  ).toBe("Reconnect to send")
})
