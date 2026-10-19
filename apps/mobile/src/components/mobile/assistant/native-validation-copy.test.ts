import { expect, test } from "bun:test"
import { generalActionSchema } from "@ewatrade/assistant/general/contracts"
import type { QuoteDecisionAction } from "@ewatrade/assistant/general/quote-decision"
import type { ServiceIntakeAction } from "@ewatrade/assistant/general/service-intake"
import type { GeneralStaffStatusAction } from "@ewatrade/assistant/general/staff-status"
import { z } from "zod"
import { nativeOrderCandidate } from "./native-order-values"
import { createNativeQuoteDecisionSave } from "./native-quote-decision-values"
import {
  type NativeIntakeOffering,
  nativeServiceIntakeCandidate,
} from "./native-service-intake-values"
import {
  type NativeInvitationValues,
  type NativeStaffInvitationAction,
  nativeStaffInvitationCandidate,
} from "./native-staff-invitation-values"
import { createNativeStaffStatusSave } from "./native-staff-status-values"
import {
  nativeIssueText,
  nativeValidationMessage,
} from "./native-validation-copy"

// Zod's built-in wording, raw patterns, issue-list JSON and minor-unit limits.
const raw =
  /Too (small|big):|Invalid (input|string|option|email)|must match pattern|expected (string|number|one of)|<=|>=|"code"|\[\s*\{|\^\\d/

function plain(message: string) {
  expect(message).not.toMatch(raw)
  expect(message.length).toBeGreaterThan(0)
}

test("built-in issues become plain correction text naming the field", () => {
  const schema = z
    .object({
      reason: z.string().trim().min(1).max(5),
      email: z.string().email(),
      quantity: z.string().regex(/^\d+(\.\d{1,6})?$/),
      unitPriceMinor: z.number().int().min(1).max(100_000_000),
      lines: z.array(z.string()).min(1),
    })
    .strict()
  const cases: Array<[Record<string, unknown>, string]> = [
    [{ reason: "" }, "Enter a reason."],
    [{ reason: "toolong" }, "Keep reason within 5 characters."],
    [{ email: "nope" }, "Enter a valid email address."],
    [
      { quantity: "1.1234567" },
      "Check quantity. Use a number above zero with up to six decimal places.",
    ],
    [{ unitPriceMinor: 100_000_001 }, "Unit price is too large."],
    [{ unitPriceMinor: 0 }, "Unit price must be more than zero."],
    [{ lines: [] }, "Add a service line."],
  ]
  const valid = {
    reason: "ok",
    email: "a@example.test",
    quantity: "1",
    unitPriceMinor: 1,
    lines: ["x"],
  }
  for (const [patch, expected] of cases) {
    const result = schema.safeParse({ ...valid, ...patch })
    if (result.success) throw Error("expected a validation issue")
    expect(nativeIssueText(result.error.issues[0] ?? {}, "Check it.")).toBe(
      expected,
    )
    expect(nativeValidationMessage(result.error, "Check it.")).toBe(expected)
  }
})

test("authored schema/helper messages, server refusals and unknown errors are not rewritten or hidden", () => {
  const authored = z.string().min(1, "Say why this changed.").safeParse("")
  if (authored.success) throw Error("expected a validation issue")
  expect(nativeIssueText(authored.error.issues[0] ?? {}, "x")).toBe(
    "Say why this changed.",
  )
  const custom = z
    .string()
    .refine(() => false, "Choose an eligible Store.")
    .safeParse("a")
  if (custom.success) throw Error("expected a validation issue")
  expect(nativeIssueText(custom.error.issues[0] ?? {}, "x")).toBe(
    "Choose an eligible Store.",
  )
  expect(
    nativeValidationMessage(
      Error("This staff member's access changed. Review again."),
      "x",
    ),
  ).toBe("This staff member's access changed. Review again.")
  expect(nativeValidationMessage("not an error", "Fallback text.")).toBe(
    "Fallback text.",
  )
  expect(nativeValidationMessage(Error(""), "Fallback text.")).toBe(
    "Fallback text.",
  )
})

test("authored messages are kept even when they start like Zod defaults; only exact defaults are rewritten", () => {
  const authored = [
    "Invalid approval choice: keep the original staff selection.",
    "Invalid input: expected the original Store.",
    "Expected one Store role per assignment.",
    "Too small: add at least one service line.",
    "Unrecognized key: use the drafted fields only.",
  ]
  for (const message of authored) {
    const result = z
      .object({ reason: z.string().min(1, message) })
      .safeParse({ reason: "" })
    if (result.success) throw Error("expected a validation issue")
    expect(nativeIssueText(result.error.issues[0] ?? {}, "x")).toBe(message)
    expect(nativeValidationMessage(result.error, "x")).toBe(message)
  }
  const typed = z.object({ reason: z.string() }).safeParse({ reason: 5 })
  if (typed.success) throw Error("expected a validation issue")
  expect(typed.error.issues[0]?.message).toBe(
    "Invalid input: expected string, received number",
  )
  expect(nativeIssueText(typed.error.issues[0] ?? {}, "x")).toBe(
    "Check reason.",
  )
  const missing = z.object({ reason: z.string() }).safeParse({})
  if (missing.success) throw Error("expected a validation issue")
  expect(nativeIssueText(missing.error.issues[0] ?? {}, "x")).toBe(
    "Check reason.",
  )
  const authoredType = z
    .object({ reason: z.string({ error: "Invalid input: give a reason." }) })
    .safeParse({ reason: 5 })
  if (authoredType.success) throw Error("expected a validation issue")
  expect(nativeIssueText(authoredType.error.issues[0] ?? {}, "x")).toBe(
    "Invalid input: give a reason.",
  )
})

test("money minimums: inclusive zero says zero or more (and zero is accepted); positive minimums say more than zero", () => {
  const draft = {
    action: "order_replace",
    orderId: "original-order",
    reason: "Correct prices",
    changes: [{ orderLineId: "fixed-line", quantity: "2", unitPriceMinor: -1 }],
  } as const
  const negative = generalActionSchema.safeParse(draft)
  if (negative.success) throw Error("expected a validation issue")
  const issue = negative.error.issues[0]
  expect(issue).toMatchObject({
    code: "too_small",
    minimum: 0,
    inclusive: true,
  })
  expect(nativeIssueText(issue ?? {}, "x")).toBe(
    "Unit price must be zero or more.",
  )
  const zero = generalActionSchema.safeParse({
    ...draft,
    changes: [{ orderLineId: "fixed-line", quantity: "2", unitPriceMinor: 0 }],
  })
  expect(zero.success).toBe(true)
  const sources = [{ id: "fixed-line", snapshot: { pricingPolicy: "fixed" } }]
  expect(
    nativeOrderCandidate(
      { ...draft, changes: [...draft.changes] },
      {
        reason: "Free line",
        changes: [{ quantity: "2", amount: "0" }],
        sources,
      },
    ),
  ).toMatchObject({ ok: true })
  const positive = (minimum: number, inclusive: boolean) =>
    nativeIssueText(
      {
        code: "too_small",
        origin: "number",
        minimum,
        inclusive,
        path: ["initialPaymentMinor"],
        message: inclusive
          ? `Too small: expected number to be >=${minimum}`
          : `Too small: expected number to be >${minimum}`,
      },
      "x",
    )
  expect(positive(1, true)).toBe("Payment amount must be more than zero.")
  expect(positive(0, false)).toBe("Payment amount must be more than zero.")
})

test("order: a default-text custom refine (quantity 0) and an over-limit item total read plainly; authored custom and server text kept", () => {
  const draft = {
    action: "order_replace",
    orderId: "original-order",
    reason: "Correct quantities",
    changes: [
      { orderLineId: "fixed-line", quantity: "2", unitPriceMinor: 12345 },
      { orderLineId: "total-line", enteredTotalMinor: 50000 },
    ],
  } as const
  const zeroQuantity = generalActionSchema.safeParse({
    ...draft,
    changes: [{ orderLineId: "fixed-line", quantity: "0", unitPriceMinor: 1 }],
  })
  if (zeroQuantity.success) throw Error("expected a validation issue")
  expect(zeroQuantity.error.issues[0]).toMatchObject({
    code: "custom",
    message: "Invalid input",
  })
  const sources = [
    { id: "fixed-line", snapshot: { pricingPolicy: "fixed" } },
    { id: "total-line", snapshot: { pricingPolicy: "order_total" } },
  ]
  const zero = nativeOrderCandidate(
    { ...draft, changes: [...draft.changes] },
    {
      reason: "Fix",
      changes: [
        { quantity: "0", amount: "1" },
        { quantity: "", amount: "500" },
      ],
      sources,
    },
  )
  expect(zero).toEqual({
    ok: false,
    error:
      "Check quantity. Use a number above zero with up to six decimal places.",
  })
  const bigTotal = nativeOrderCandidate(
    { ...draft, changes: [...draft.changes] },
    {
      reason: "Fix",
      changes: [
        { quantity: "2", amount: "1" },
        { quantity: "", amount: "99999999999" },
      ],
      sources,
    },
  )
  expect(bigTotal).toEqual({ ok: false, error: "Item total is too large." })
  expect(
    nativeOrderCandidate(
      { ...draft, changes: [...draft.changes] },
      {
        reason: "Free",
        changes: [
          { quantity: "2", amount: "0" },
          { quantity: "", amount: "0" },
        ],
        sources,
      },
    ),
  ).toMatchObject({ ok: true })
  const authoredCustom = z
    .object({
      quantity: z.string().refine(() => false, "Count each box once."),
    })
    .safeParse({ quantity: "1" })
  if (authoredCustom.success) throw Error("expected a validation issue")
  expect(nativeIssueText(authoredCustom.error.issues[0] ?? {}, "x")).toBe(
    "Count each box once.",
  )
  expect(
    nativeValidationMessage(Error("Invalid input"), "Fallback text."),
  ).toBe("Invalid input")
})

test("order editor: blank reason, bad quantity and an out-of-range price read plainly and still refuse", () => {
  const draft = {
    action: "order_replace",
    orderId: "original-order",
    reason: "Correct quantities",
    changes: [
      { orderLineId: "fixed-line", quantity: "2", unitPriceMinor: 12345 },
    ],
  } as const
  const sources = [{ id: "fixed-line", snapshot: { pricingPolicy: "fixed" } }]
  const cases = [
    { reason: "", changes: [{ quantity: "2", amount: "123.45" }] },
    { reason: "ok", changes: [{ quantity: "1.1234567", amount: "1" }] },
    { reason: "ok", changes: [{ quantity: "2", amount: "99999999999" }] },
  ]
  for (const edits of cases) {
    const result = nativeOrderCandidate(
      { ...draft, changes: [...draft.changes] },
      { ...edits, sources },
    )
    expect(result.ok).toBe(false)
    if (!result.ok) plain(result.error)
  }
})

test("staff invitation: missing and malformed email read plainly and still refuse", () => {
  const invite: NativeInvitationValues = {
    email: "staff@example.test",
    name: "Staff",
    assignments: [{ storeId: "store-a", role: "CASHIER" }],
    defaultStoreId: "store-a",
    catalogEditor: false,
  }
  const initial: NativeStaffInvitationAction = {
    action: "staff_invitation",
    intent: { kind: "INVITE", invite },
  }
  for (const email of ["", "not-an-email"]) {
    const result = nativeStaffInvitationCandidate(
      initial,
      { kind: "INVITE", invite: { ...invite, email } },
      [{ id: "store-a", name: "Main" }],
    )
    expect(result.ok).toBe(false)
    if (!result.ok) {
      plain(result.error)
      expect(result.error).toMatch(/email/i)
    }
  }
})

test("staff status: a blank required reason shows a sentence, not the issue-list JSON; review refusals keep their text", async () => {
  const initial: GeneralStaffStatusAction = {
    action: "staff_status",
    membershipId: "fixed-membership",
    status: "suspended",
    expectedRevision: 2,
    reason: "Access review",
  }
  const saved: unknown[] = []
  const owner = createNativeStaffStatusSave({
    initial,
    isCurrent: () => true,
    fetchReview: async () => {
      throw Error("This member's status changed. Open a fresh draft.")
    },
    onSave: (payload) => saved.push(payload),
  })
  const bad = await owner.save({ status: "suspended", reason: "   " })
  expect(bad.state).toBe("error")
  if (bad.state === "error") plain(bad.error)
  const refused = await owner.save({ status: "active", reason: "Back" })
  expect(refused).toEqual({
    state: "error",
    stage: "review",
    error: "This member's status changed. Open a fresh draft.",
  })
  expect(saved).toEqual([])
})

test("service intake: invalid quantity, email and an over-limit payment read plainly and still refuse", () => {
  const tracked: NativeIntakeOffering = {
    offeringId: "tracked",
    itemName: "Laundry",
    variantName: "Shirt",
    offeringName: "Wash",
    fixedPriceMinor: 2500,
    service: { workPolicy: "TRACKED", authorizationPolicy: "MANUAL_RELEASE" },
  }
  const options = {
    offerings: [tracked],
    assignees: [{ id: "staff", name: "Ada" }],
  }
  const initial: ServiceIntakeAction = {
    action: "service_intake",
    customerName: "Amina",
    customerPhone: "08012345678",
    customerEmail: "amina@example.test",
    lines: [{ offeringId: "tracked", quantity: "1" }],
  } as ServiceIntakeAction
  const edits = { payment: "", requested: "", due: "" }
  const cases: Array<[ServiceIntakeAction, typeof edits]> = [
    [{ ...initial, lines: [{ offeringId: "tracked", quantity: "0" }] }, edits],
    [{ ...initial, customerEmail: "bad-email" }, edits],
    [initial, { ...edits, payment: "99999999999" }],
  ]
  for (const [draft, values] of cases) {
    const result = nativeServiceIntakeCandidate(initial, draft, values, options)
    expect(result.ok).toBe(false)
    if (!result.ok) plain(result.error)
  }
})

test("quote decision: a blank reason shows a sentence and nothing is saved", async () => {
  const initial: QuoteDecisionAction = {
    action: "commerce_quote_reject",
    approvalId: "approval",
    quoteId: "quote",
    quoteVersionId: "version",
    reason: "Too expensive",
  }
  const errors: string[] = []
  const saved: unknown[] = []
  await createNativeQuoteDecisionSave().save({
    initial,
    raw: { ...initial, reason: "  " },
    scope: { tenantId: "b", storeId: "s", actorUserId: "a" },
    isCurrent: () => true,
    fetchScope: async () => {
      throw Error("should not read scope")
    },
    fetchReview: async () => {
      throw Error("should not review")
    },
    onSave: (draft) => saved.push(draft),
    onError: (message) => errors.push(message),
    onBusy: () => {},
  })
  expect(saved).toEqual([])
  expect(errors).toHaveLength(1)
  plain(errors[0] ?? "")
})
