import { expect, test } from "bun:test"
import { capabilityForAction } from "../capabilities/manifest"
import {
  GENERAL_PLAN_MAX_STEPS,
  generalBoundedPlanSchema,
  generalPlanContinuation,
  generalPlanIntentSchema,
  generalPlanProposalReferenceSchema,
} from "./bounded-plan"

const hash = "a".repeat(64)
const origin = {
  actorUserId: "actor",
  tenantId: "tenant",
  storeId: "store",
  conversationId: "chat",
}

test("proposal binding preserves a full native 191-character target without truncation", () => {
  const target = {
    id: "原生 /?=# %:《》".padEnd(191, "n"),
    revision: "current",
  }
  expect(
    generalPlanProposalReferenceSchema.parse({ ...reference(0), target })
      .target,
  ).toEqual(target)
  expect(
    generalPlanProposalReferenceSchema.safeParse({
      ...reference(0),
      target: { ...target, id: `${target.id}x` },
    }).success,
  ).toBe(false)
})
function reference(index: number) {
  return {
    proposalId: `proposal-${index}`,
    revision: 1,
    payloadHash: hash,
    target: { id: `customer-${index}`, revision: "original" },
  }
}
function serverPlan(count = 2) {
  const capability = capabilityForAction("customer_create")
  return generalBoundedPlanSchema.parse({
    version: 1,
    id: "plan",
    revision: 1,
    origin,
    title: "Reviewed customers",
    createdAt: "2026-10-15T12:00:00.000Z",
    updatedAt: "2026-10-15T12:00:00.000Z",
    status: "open",
    steps: Array.from({ length: count }, (_, i) => ({
      id: `step-${i}`,
      title: `Customer ${i}`,
      dependsOn: i ? [`step-${i - 1}`] : [],
      intent: {
        kind: "action",
        payload: { action: "customer_create", name: `Customer ${i}` },
      },
      capability: { id: capability.id, version: capability.version },
      state: { status: "draft" },
    })),
  })
}
function completed(index: number) {
  return {
    status: "completed" as const,
    proposal: reference(index),
    receiptDigest: hash,
    receipt: {
      kind: "customer" as const,
      recordId: `customer-${index}`,
      title: "Customer created",
      detail: "Original saved outcome",
    },
  }
}

test("untrusted plan intent contains only actual actions or explicit unresolved facts, never execution/identity/proof", () => {
  const base = {
    title: "Customer then order",
    steps: [
      {
        key: "customer",
        title: "Resolve customer",
        dependsOn: [],
        intent: {
          kind: "action",
          payload: { action: "customer_create", name: "Ishaq" },
        },
      },
      {
        key: "order",
        title: "Resolve sale",
        dependsOn: ["customer"],
        intent: {
          kind: "needs_resolution",
          action: "order_create",
          question: "Which exact goods and quantities?",
        },
      },
    ],
  }
  expect(generalPlanIntentSchema.safeParse(base).success).toBe(true)
  for (const change of [
    { ...base, actorUserId: "actor" },
    { ...base, execute: true },
    { ...base, approvalToken: "fake" },
    { ...base, planId: "server-plan" },
    { ...base, offline: true },
    { ...base, steps: [{ ...base.steps[0], proposalId: "server-proposal" }] },
    { ...base, steps: [{ ...base.steps[0], receipt: completed(0).receipt }] },
    {
      ...base,
      steps: [
        {
          key: "future",
          title: "Unsupported",
          dependsOn: [],
          intent: {
            kind: "needs_resolution",
            action: "invented_native_action",
            question: "Do it",
          },
        },
      ],
    },
  ])
    expect(generalPlanIntentSchema.safeParse(change).success).toBe(false)
})

test("ten-step ceiling preserves every step; eleven, duplicate, cyclic, missing or forward dependencies reject the WHOLE plan", () => {
  expect(serverPlan(GENERAL_PLAN_MAX_STEPS).steps).toHaveLength(10)
  expect(() => serverPlan(11)).toThrow()
  const base = serverPlan()
  const first = base.steps[0]
  const second = base.steps[1]
  if (!first || !second) throw Error("Original steps required")
  for (const steps of [
    [first, { ...second, id: first.id }],
    [{ ...first, dependsOn: [second.id] }, second],
    [first, { ...second, dependsOn: ["missing"] }],
    [first, { ...second, dependsOn: [first.id, first.id] }],
    [{ ...first, dependsOn: [first.id] }, second],
  ])
    expect(generalBoundedPlanSchema.safeParse({ ...base, steps }).success).toBe(
      false,
    )
})

test("actual capability version and canonical receipt family remain bound; planned/source capability is not activated by parsing", () => {
  const base = serverPlan(1)
  const step = base.steps[0]
  if (!step) throw Error("Original step required")
  for (const changed of [
    { ...step, capability: { ...step.capability, id: "foreign" } },
    {
      ...step,
      capability: { ...step.capability, version: step.capability.version + 1 },
    },
    {
      ...step,
      state: {
        ...completed(0),
        receipt: {
          kind: "order",
          recordId: "foreign",
          title: "Wrong family",
          detail: "Not a customer outcome",
        },
      },
    },
    {
      ...step,
      state: {
        ...completed(0),
        receipt: { ...completed(0).receipt, token: "private" },
      },
    },
    { ...step, state: { ...completed(0), receiptDigest: "unknown" } },
  ])
    expect(
      generalBoundedPlanSchema.safeParse({ ...base, steps: [changed] }).success,
    ).toBe(false)
  expect(capabilityForAction("customer_create").rollout).not.toBe("enabled")
})

test("a plan describes separate reviews and receipts rather than interpreting six inference steps as execution authority", () => {
  const plan = serverPlan()
  expect(generalPlanContinuation(plan)).toEqual({
    kind: "draft_proposal",
    stepId: "step-0",
  })
  const first = plan.steps[0]
  const second = plan.steps[1]
  if (!first || !second) throw Error("Original steps required")
  first.state = { status: "review_required", proposal: reference(0) }
  expect(generalPlanContinuation(plan)).toEqual({
    kind: "individual_review",
    stepId: "step-0",
    proposal: reference(0),
  })
  first.state = completed(0)
  expect(generalPlanContinuation(plan)).toEqual({
    kind: "draft_proposal",
    stepId: "step-1",
  })
  second.state = { status: "review_required", proposal: reference(1) }
  expect(generalPlanContinuation(plan)).toEqual({
    kind: "individual_review",
    stepId: "step-1",
    proposal: reference(1),
  })
  second.state = completed(1)
  expect(generalPlanContinuation(generalBoundedPlanSchema.parse(plan))).toEqual(
    { kind: "completed" },
  )
  expect(plan.steps.map((step) => step.state.status)).toEqual([
    "completed",
    "completed",
  ])
})

test("executing/unknown step fences all later work and preserves original proposal identity for recovery", () => {
  for (const status of ["executing", "unknown"] as const) {
    const plan = serverPlan()
    const first = plan.steps[0]
    if (!first) throw Error("Original step required")
    first.state =
      status === "executing"
        ? { status, proposal: reference(0) }
        : { status, proposal: reference(0), reason: "response_lost" }
    expect(
      generalPlanContinuation(generalBoundedPlanSchema.parse(plan)),
    ).toEqual({ kind: "recover", stepId: "step-0", proposal: reference(0) })
    expect(first.state.proposal.proposalId).toBe("proposal-0")
    expect(
      generalBoundedPlanSchema.safeParse({ ...plan, status: "cancelled" })
        .success,
    ).toBe(false)
  }
})

test("missing dependency receipt, duplicate proposal and unresolved native fields cannot fabricate completion", () => {
  const plan = serverPlan()
  const first = plan.steps[0]
  const second = plan.steps[1]
  if (!first || !second) throw Error("Original steps required")
  second.state = completed(1)
  expect(generalBoundedPlanSchema.safeParse(plan).success).toBe(false)
  first.state = completed(0)
  second.state = { ...completed(1), proposal: reference(0) }
  expect(generalBoundedPlanSchema.safeParse(plan).success).toBe(false)
  second.state = completed(1)
  second.intent = {
    kind: "needs_resolution",
    action: "customer_create",
    question: "Which exact customer?",
  }
  expect(generalBoundedPlanSchema.safeParse(plan).success).toBe(false)
  second.state = { status: "needs_resolution" }
  expect(generalPlanContinuation(generalBoundedPlanSchema.parse(plan))).toEqual(
    { kind: "resolve", stepId: "step-1" },
  )
})

test("stale review, canonical failure and cancellation remain distinct from completed effects", () => {
  const plan = serverPlan(1)
  const step = plan.steps[0]
  if (!step) throw Error("Original step required")
  step.state = { status: "stale", proposal: reference(0) }
  expect(generalPlanContinuation(plan)).toEqual({
    kind: "refresh_review",
    stepId: "step-0",
    proposal: reference(0),
  })
  step.state = {
    status: "failed",
    proposal: reference(0),
    reason: "canonical_refusal",
  }
  expect(generalPlanContinuation(plan)).toEqual({
    kind: "blocked",
    stepId: "step-0",
  })
  step.state = { status: "cancelled", proposal: reference(0) }
  expect(generalPlanContinuation(plan)).toEqual({
    kind: "blocked",
    stepId: "step-0",
  })
  plan.status = "cancelled"
  expect(generalPlanContinuation(generalBoundedPlanSchema.parse(plan))).toEqual(
    { kind: "cancelled" },
  )
})

test("a reordered dependency or copied receipt cannot become another current plan by changing authority metadata", () => {
  const base = serverPlan()
  for (const raw of [
    { ...base, approved: true },
    { ...base, offlineQueue: true },
    { ...base, origin: { ...origin, authorized: true } },
    { ...base, revision: 2_147_483_648 },
    { ...base, steps: [...base.steps].reverse() },
  ])
    expect(generalBoundedPlanSchema.safeParse(raw).success).toBe(false)
  // A same-shaped foreign origin is still data, not an authenticated grant.
  expect(
    generalBoundedPlanSchema.safeParse({
      ...base,
      origin: { ...origin, actorUserId: "other" },
    }).success,
  ).toBe(true)
})
