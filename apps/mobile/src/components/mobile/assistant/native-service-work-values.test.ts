import { expect, test } from "bun:test"
import type { ServiceWorkEditorAction } from "@ewatrade/assistant/general/contracts"
import {
  createNativeServiceWorkSave,
  nativeServiceWorkActions,
  nativeServiceWorkAssignees,
  nativeServiceWorkCandidate,
  nativeServiceWorkContext,
  nativeServiceWorkDraft,
  nativeServiceWorkReview,
  nativeServiceWorkScope,
  nativeServiceWorkTarget,
} from "./native-service-work-values"

const scope = {
  tenantId: "business",
  storeId: "store",
  actorUserId: "actor",
  role: "OWNER",
  accessMode: "LEGACY",
}
const tenant = {
  tenant: { id: "business" },
  activeStore: { id: "store", status: "ACTIVE" },
  actorUserId: "actor",
  membership: {
    tenantId: "business",
    role: "OWNER",
    staffAccessMode: "LEGACY",
  },
  staffAccess: { status: "ACTIVE", mode: "LEGACY" },
}
const actions: ServiceWorkEditorAction[] = [
  {
    action: "service_job_assign",
    jobId: "job",
    assigneeUserId: "staff-a",
    reason: "Next shift",
  },
  {
    action: "service_job_reschedule",
    jobId: "job",
    promisedAt: "2026-10-25T01:30:00.123456+01:00",
    reason: "Customer changed time",
  },
  {
    action: "service_job_line_transition",
    jobId: "job",
    lineId: "line",
    toStatus: "in_progress",
    reason: "Started",
  },
  {
    action: "service_work_note",
    jobId: "job",
    lineId: "line",
    body: "Handle gently",
  },
  {
    action: "service_work_exception",
    jobId: "job",
    lineId: "line",
    type: "quality",
    description: "Fabric mark",
  },
  {
    action: "service_work_rework",
    jobId: "job",
    lineId: "line",
    quantity: "0.000001",
    reason: "Redo finish",
  },
  {
    action: "service_work_handoff",
    jobId: "job",
    note: "Collected by customer",
  },
]
function actionOf(name: ServiceWorkEditorAction["action"]) {
  const action = actions.find((row) => row.action === name)
  if (!action) throw Error("Missing test action")
  return action
}
function contextFor(action: ServiceWorkEditorAction) {
  return {
    tenantId: "business",
    storeId: "store",
    actorUserId: "actor",
    job: {
      id: "job",
      orderNumber: "ORD-1042",
      customerName: "Customer",
      promisedAt: "2026-10-24T12:00:00Z",
    },
    line:
      "lineId" in action && action.lineId
        ? {
            id: action.lineId,
            offeringName: "Wash",
            variantName: "Linen",
            quantity: "2.500000",
            status: "IN_PROGRESS",
            authorizationStatus: "AUTHORIZED",
          }
        : null,
    assignees: [
      { id: "staff-a", name: "Amina" },
      { id: "staff-b", name: "Amina" },
    ],
    assigneesComplete: true,
  }
}
function reviewFor(action: ServiceWorkEditorAction) {
  const target = nativeServiceWorkTarget(action)
  return {
    tenantId: "business",
    storeId: "store",
    actorUserId: "actor",
    jobId: action.jobId,
    lineId: target.lineId ?? null,
    target: {
      id:
        action.action === "service_work_rework"
          ? action.jobId
          : (target.lineId ?? action.jobId),
      revision: "a".repeat(64),
    },
    lines: ["Protected current work review", "No payment or provider delivery"],
  }
}
const names = [
  { id: "staff-a", name: "Amina", email: "amina.a@example.test" },
  { id: "staff-b", name: "Amina", email: "amina.b@example.test" },
  {
    id: "not-eligible",
    name: "Other business-wide staff",
    email: "not.eligible@example.test",
  },
]

test("all seven existing actions preserve the exact saved Job/Line and strict payload", () => {
  expect(actions.map((action) => action.action)).toEqual([
    ...nativeServiceWorkActions,
  ])
  for (const action of actions) {
    expect(
      nativeServiceWorkCandidate(action, action, contextFor(action), scope),
    ).toEqual(action)
    expect(() =>
      nativeServiceWorkDraft(action, { ...action, jobId: "other-job" }),
    ).toThrow()
    expect(() =>
      nativeServiceWorkDraft(action, { ...action, lineId: "other-line" }),
    ).toThrow()
    for (const injected of [
      { tenantId: "foreign" },
      { storeId: "foreign" },
      { actorUserId: "other" },
      { expectedRevision: 4 },
      { payment: { amountMinor: 100 } },
      { eventId: "fake" },
    ])
      expect(() =>
        nativeServiceWorkDraft(action, { ...action, ...injected }),
      ).toThrow()
  }
  expect(() =>
    nativeServiceWorkDraft(actionOf("service_job_assign"), actions[1]),
  ).toThrow()
})

test("note/exception optional Line is fixed even when the Job-only form was drafted", () => {
  for (const action of actions.filter(
    (row) =>
      row.action === "service_work_note" ||
      row.action === "service_work_exception",
  )) {
    const { lineId: _lineId, ...jobOnly } = action
    expect(nativeServiceWorkDraft(jobOnly, jobOnly)).toEqual(jobOnly)
    expect(() => nativeServiceWorkDraft(jobOnly, action)).toThrow()
    expect(() => nativeServiceWorkDraft(action, jobOnly)).toThrow()
  }
})

test("stated ISO time keeps exact offset and subseconds; ambiguous/local/invalid dates refuse", () => {
  const action = actionOf("service_job_reschedule")
  for (const promisedAt of [
    "2026-10-25T01:30:00.123456+01:00",
    "2026-10-25T00:30:00.123456Z",
    "2026-10-25T01:30:00.999+00:00",
  ])
    expect(
      nativeServiceWorkDraft(action, { ...action, promisedAt }),
    ).toMatchObject({ promisedAt })
  for (const promisedAt of [
    "2026-10-25T01:30",
    "25/10/2026 01:30",
    "2026-02-30T01:30:00Z",
    "",
    "tomorrow",
  ])
    expect(() =>
      nativeServiceWorkDraft(action, { ...action, promisedAt }),
    ).toThrow()
})

test("rework quantity stays exact and refuses zero, negative, exponent or excess scale", () => {
  const action = actionOf("service_work_rework")
  for (const quantity of ["0.000001", "1.250000", "1000000000000000.000001"])
    expect(
      nativeServiceWorkDraft(action, { ...action, quantity }),
    ).toMatchObject({ quantity })
  for (const quantity of ["0", "-1", "1e2", "0.0000001", "1,000", "NaN"])
    expect(() =>
      nativeServiceWorkDraft(action, { ...action, quantity }),
    ).toThrow()
})

test("required reasons, states, texts and categories obey canonical shared schemas", () => {
  const line = actionOf("service_job_line_transition")
  for (const toStatus of ["blocked", "cancelled"])
    expect(() =>
      nativeServiceWorkDraft(line, { ...line, toStatus, reason: undefined }),
    ).toThrow()
  for (const toStatus of ["completed", "handed_off", "paid", "AUTHORIZED"])
    expect(() => nativeServiceWorkDraft(line, { ...line, toStatus })).toThrow()
  for (const action of actions) {
    if (
      action.action === "service_job_reschedule" ||
      action.action === "service_work_rework"
    )
      expect(() =>
        nativeServiceWorkDraft(action, { ...action, reason: " " }),
      ).toThrow()
    if (action.action === "service_work_note")
      for (const body of [" ", "x".repeat(4001)])
        expect(() =>
          nativeServiceWorkDraft(action, { ...action, body }),
        ).toThrow()
    if (action.action === "service_work_exception") {
      expect(() =>
        nativeServiceWorkDraft(action, { ...action, type: "resolved" }),
      ).toThrow()
      expect(() =>
        nativeServiceWorkDraft(action, { ...action, description: " " }),
      ).toThrow()
    }
  }
})

test("fresh Tenant scope must match native actor, business, Store, role and access", () => {
  expect(nativeServiceWorkScope(tenant, scope)).toEqual(scope)
  for (const altered of [
    { ...tenant, actorUserId: "other" },
    { ...tenant, tenant: { id: "foreign" } },
    { ...tenant, activeStore: { id: "other-store", status: "ACTIVE" } },
    { ...tenant, activeStore: { id: "store", status: "ARCHIVED" } },
    { ...tenant, membership: { ...tenant.membership, tenantId: "foreign" } },
    { ...tenant, membership: { ...tenant.membership, role: "CASHIER" } },
    { ...tenant, staffAccess: { status: "SUSPENDED", mode: "LEGACY" } },
  ])
    expect(() => nativeServiceWorkScope(altered, scope)).toThrow()
  expect(() =>
    nativeServiceWorkScope(
      {
        ...tenant,
        membership: {
          ...tenant.membership,
          role: "MANAGER",
          staffAccessMode: "SCOPED",
        },
      },
      { ...scope, role: "MANAGER", accessMode: "SCOPED" },
    ),
  ).toThrow()
})

test("context and review require exact target and canonical scope; rework target is its source Job", () => {
  for (const action of actions) {
    const context = contextFor(action)
    expect(nativeServiceWorkContext(context, scope, action)).toEqual(context)
    for (const changed of [
      { tenantId: "foreign" },
      { storeId: "other" },
      { actorUserId: "other" },
      { job: { ...context.job, id: "other" } },
      {
        line: {
          id: "other",
          offeringName: "X",
          variantName: "X",
          quantity: "1",
          status: "QUEUED",
          authorizationStatus: "AUTHORIZED",
        },
      },
    ])
      expect(() =>
        nativeServiceWorkContext({ ...context, ...changed }, scope, action),
      ).toThrow()
    const review = reviewFor(action)
    expect(nativeServiceWorkReview(review, scope, action)).toEqual(review)
    for (const changed of [
      { jobId: "other" },
      { lineId: "other" },
      { actorUserId: "other" },
      { target: { ...review.target, id: "other" } },
      { target: { ...review.target, revision: "guessed" } },
      { lines: [] },
    ])
      expect(() =>
        nativeServiceWorkReview({ ...review, ...changed }, scope, action),
      ).toThrow()
  }
})

test("only complete current Store eligibility joins real name/email identities, including same names", () => {
  const action = actionOf("service_job_assign")
  const context = contextFor(action)
  expect(nativeServiceWorkAssignees(context, names)).toEqual(names.slice(0, 2))
  expect(() =>
    nativeServiceWorkAssignees({ ...context, assigneesComplete: false }, names),
  ).toThrow()
  expect(() => nativeServiceWorkAssignees(context, names.slice(0, 1))).toThrow()
  expect(() =>
    nativeServiceWorkAssignees(context, [...names, names[0]]),
  ).toThrow()
  expect(() =>
    nativeServiceWorkCandidate(
      action,
      { ...action, assigneeUserId: "not-eligible" },
      context,
      scope,
    ),
  ).toThrow()
  expect(() =>
    nativeServiceWorkCandidate(
      action,
      action,
      { ...context, assigneesComplete: false },
      scope,
    ),
  ).toThrow()
  expect(
    nativeServiceWorkCandidate(
      action,
      { ...action, assigneeUserId: "staff-b" },
      context,
      scope,
    ),
  ).toMatchObject({ assigneeUserId: "staff-b" })
})

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (cause: unknown) => void
  const promise = new Promise<T>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}
function pipeline(
  action: ServiceWorkEditorAction,
  overrides: Partial<Parameters<typeof createNativeServiceWorkSave>[0]> = {},
) {
  const calls: string[] = []
  const saved: ServiceWorkEditorAction[] = []
  const owner = createNativeServiceWorkSave({
    initial: action,
    scope,
    isCurrent: () => true,
    fetchTenant: async () => {
      calls.push("tenant")
      return tenant
    },
    fetchContext: async (input) => {
      calls.push("context")
      expect(input).toEqual(nativeServiceWorkTarget(action))
      return contextFor(action)
    },
    fetchAssignees: async () => {
      calls.push("names")
      return names
    },
    fetchReview: async (draft) => {
      calls.push("review")
      expect(draft).toEqual(action)
      return reviewFor(draft)
    },
    onSave: (draft) => {
      calls.push("save")
      saved.push(draft)
    },
    ...overrides,
  })
  return { owner, calls, saved }
}

test("all seven saves use sequential fresh protected context and review before parent edit only", async () => {
  for (const action of actions) {
    const { owner, calls, saved } = pipeline(action)
    expect(await owner.save(action)).toEqual({ state: "saved" })
    expect(calls).toEqual(
      action.action === "service_job_assign"
        ? ["tenant", "context", "names", "review", "save"]
        : ["tenant", "context", "review", "save"],
    )
    expect(saved).toEqual([action])
  }
})

test("invalid input never sends a read; wrong fresh scope stops before work context", async () => {
  const action = actionOf("service_job_assign")
  const invalid = pipeline(action)
  expect(await invalid.owner.save({ ...action, payment: true })).toMatchObject({
    state: "error",
    stage: "input",
  })
  expect(invalid.calls).toEqual([])
  const wrongScope = pipeline(action, {
    fetchTenant: async () => ({ ...tenant, actorUserId: "other" }),
  })
  expect(await wrongScope.owner.save(action)).toMatchObject({
    state: "error",
    stage: "review",
  })
  expect(wrongScope.calls).toEqual([])
  expect(wrongScope.saved).toEqual([])
})

test("a fresh context/review denial cannot update draft and a later explicit retry rereads", async () => {
  const action = actionOf("service_job_assign")
  let count = 0
  const work = pipeline(action, {
    fetchReview: async () => {
      if (++count === 1) throw Error("Current review refused")
      return reviewFor(action)
    },
  })
  expect(await work.owner.save(action)).toMatchObject({
    state: "error",
    stage: "review",
    error: "Current review refused",
  })
  expect(work.saved).toEqual([])
  expect(await work.owner.save(action)).toEqual({ state: "saved" })
  expect(work.calls.filter((call) => call === "tenant")).toHaveLength(2)
})

test("double taps join no earlier request and cannot emit duplicate parent edits", async () => {
  const action = actionOf("service_job_assign")
  const read = deferred<unknown>()
  const work = pipeline(action, { fetchTenant: () => read.promise })
  const first = work.owner.save(action)
  expect(await work.owner.save(action)).toEqual({ state: "ignored" })
  read.resolve(tenant)
  expect(await first).toEqual({ state: "saved" })
  expect(work.saved).toHaveLength(1)
})

test("scope or draft changes, disabled state and unmount suppress late success/error callbacks", async () => {
  const action = actionOf("service_job_assign")
  for (const kind of ["scope", "intent", "unmount", "late-error"] as const) {
    const read = deferred<unknown>()
    let scopeCurrent = true
    let intentCurrent = true
    const work = pipeline(action, {
      isCurrent: () => scopeCurrent,
      fetchTenant: () => read.promise,
    })
    const pending = work.owner.save(action, () => intentCurrent)
    if (kind === "scope") scopeCurrent = false
    else if (kind === "intent") intentCurrent = false
    else work.owner.invalidate()
    if (kind === "late-error") read.reject(Error("Denied"))
    else read.resolve(tenant)
    expect(await pending).toEqual({ state: "ignored" })
    expect(work.calls).toEqual([])
    expect(work.saved).toEqual([])
  }
  const disabled = pipeline(action, { isCurrent: () => false })
  expect(await disabled.owner.save(action)).toEqual({ state: "ignored" })
  expect(disabled.calls).toEqual([])
})

test("old completion/finally cannot unlock or overwrite a newer mounted lifetime", async () => {
  const action = actionOf("service_job_assign")
  const old = deferred<unknown>()
  const fresh = deferred<unknown>()
  let count = 0
  const work = pipeline(action, {
    fetchTenant: () => (++count === 1 ? old.promise : fresh.promise),
  })
  const first = work.owner.save(action)
  work.owner.invalidate()
  work.owner.activate()
  const second = work.owner.save(action)
  old.resolve(tenant)
  expect(await first).toEqual({ state: "ignored" })
  expect(await work.owner.save(action)).toEqual({ state: "ignored" })
  fresh.resolve(tenant)
  expect(await second).toEqual({ state: "saved" })
  expect(work.saved).toEqual([action])
})
