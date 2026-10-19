import { expect, test } from "bun:test"
import type { GeneralStaffAccessAction } from "@ewatrade/assistant/general/staff-access"
import {
  type NativeStaffAccessReview,
  createNativeStaffAccessSaveSession,
  createNativeStaffAccessScopeFence,
  nativeStaffAccessCandidate,
  nativeStaffAccessEdits,
  nativeStaffAccessFields,
  nativeStaffAccessWorkloadReady,
} from "./native-staff-access-values"
const initial: GeneralStaffAccessAction = {
  action: "staff_access",
  membershipId: "person",
  expectedRevision: 2,
  assignments: [{ storeId: "shop", role: "MANAGER" }],
  defaultStoreId: "shop",
  catalogEditor: true,
  confirmLegacyCutover: true,
}
const edits = () => nativeStaffAccessEdits(initial)
function review(fields = edits()): NativeStaffAccessReview {
  return {
    membershipId: "person",
    expectedRevision: 9,
    availableStoresCoverage: "complete",
    availableStores: [
      { id: "shop", name: "Main Shop" },
      { id: "other", name: "Other Store" },
    ],
    requiresLegacyCutoverConfirmation: false,
    after: {
      assignments: fields.assignments,
      defaultStoreId: fields.defaultStoreId,
      catalogEditor: fields.catalogEditor,
    },
  }
}
test("fixed person and strict canonical fields never accept actor, reason, status, business role or inferred revision", () => {
  expect(
    nativeStaffAccessCandidate(initial, edits(), review()).expectedRevision,
  ).toBe(9)
  expect(
    nativeStaffAccessCandidate(initial, edits(), review()).membershipId,
  ).toBe("person")
  for (const extra of [
    { membershipId: "other" },
    { expectedRevision: 99 },
    { actorUserId: "other" },
    { reason: "handover" },
    { status: "SUSPENDED" },
    { businessRole: "ADMIN" },
    { handover: "another person" },
  ])
    expect(() =>
      nativeStaffAccessFields(initial, { ...edits(), ...extra }, review()),
    ).toThrow()
  expect(() =>
    nativeStaffAccessFields(
      initial,
      {
        ...edits(),
        assignments: [{ storeId: "shop", role: "OWNER" as never }],
      },
      review(),
    ),
  ).toThrow()
})
test("Store options, duplicate rows, default Store and Manager-backed catalog grant are exact", () => {
  for (const fields of [
    {
      ...edits(),
      assignments: [{ storeId: "foreign", role: "CASHIER" as const }],
      defaultStoreId: "foreign",
    },
    {
      ...edits(),
      assignments: [...edits().assignments, ...edits().assignments],
    },
    { ...edits(), defaultStoreId: "other" },
    {
      ...edits(),
      assignments: [{ storeId: "shop", role: "CASHIER" as const }],
    },
  ])
    expect(() => nativeStaffAccessFields(initial, fields, review())).toThrow()
  for (const patch of [
    { membershipId: "other" },
    { availableStoresCoverage: "limited" },
  ])
    expect(() =>
      nativeStaffAccessFields(initial, edits(), { ...review(), ...patch }),
    ).toThrow()
})
test("empty assignments explicitly remove Store access without status mutation", () => {
  const fields = {
    ...edits(),
    assignments: [],
    defaultStoreId: null,
    catalogEditor: false,
  }
  const payload = nativeStaffAccessCandidate(initial, fields, review(fields))
  expect(payload.assignments).toEqual([])
  expect(payload.defaultStoreId).toBeNull()
  expect("status" in payload).toBe(false)
  expect(() =>
    nativeStaffAccessFields(
      initial,
      { ...fields, defaultStoreId: "shop" },
      review(),
    ),
  ).toThrow()
})
test("legacy acknowledgment starts unchecked on every edit and is checked against new review", () => {
  expect(edits().confirmLegacyCutover).toBe(false)
  expect(() =>
    nativeStaffAccessFields(initial, edits(), {
      ...review(),
      requiresLegacyCutoverConfirmation: true,
    }),
  ).toThrow()
  expect(
    nativeStaffAccessCandidate(
      initial,
      { ...edits(), confirmLegacyCutover: true },
      { ...review(), requiresLegacyCutoverConfirmation: true },
    ).confirmLegacyCutover,
  ).toBe(true)
})
test("fresh reviewed intent and positive revision must match before a proposal can be emitted", () => {
  for (const patch of [
    { expectedRevision: 0 },
    { expectedRevision: Number.NaN },
    { after: { ...review().after, catalogEditor: false } },
    { after: { ...review().after, defaultStoreId: "other" } },
    {
      after: {
        ...review().after,
        assignments: [{ storeId: "shop", role: "CASHIER" as const }],
      },
    },
  ])
    expect(() =>
      nativeStaffAccessCandidate(initial, edits(), { ...review(), ...patch }),
    ).toThrow()
})
function deferred<T>() {
  let resolve!: (v: T) => void
  let reject!: (e: Error) => void
  const promise = new Promise<T>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}
function harness() {
  const session = createNativeStaffAccessSaveSession()
  const d = deferred<NativeStaffAccessReview>()
  let reads = 0
  let allowed = true
  const saves: GeneralStaffAccessAction[] = []
  const errors: string[] = []
  const busy: boolean[] = []
  const options = {
    initial,
    edits: edits(),
    shownReview: review(),
    read: async () => {
      reads++
      return d.promise
    },
    allowed: () => allowed,
    onSave: (v: GeneralStaffAccessAction) => saves.push(v),
    onError: (m: string) => errors.push(m),
    onBusy: (v: boolean) => busy.push(v),
  }
  return {
    session,
    d,
    saves,
    errors,
    busy,
    options,
    reads: () => reads,
    disable: () => {
      allowed = false
    },
  }
}
test("Save makes one actual review for double presses and emits its latest revision", async () => {
  const h = harness()
  const pending = h.session.save(h.options)
  await h.session.save(h.options)
  expect(h.reads()).toBe(1)
  expect(h.saves).toEqual([])
  h.d.resolve({ ...review(), expectedRevision: 13 })
  await pending
  expect(h.saves[0]?.expectedRevision).toBe(13)
  expect(h.busy).toEqual([true, false])
})
test("unmount, cancellation and current disabled scope discard late successful review", async () => {
  for (const stop of [
    (h: ReturnType<typeof harness>) => h.session.dispose(),
    (h: ReturnType<typeof harness>) => h.session.cancel(),
    (h: ReturnType<typeof harness>) => h.disable(),
  ]) {
    const h = harness()
    const p = h.session.save(h.options)
    stop(h)
    h.d.resolve(review())
    await p
    expect(h.saves).toEqual([])
    expect(h.errors).toEqual([])
  }
})
test("StrictMode cleanup and reactivation never revive an earlier request", async () => {
  const h = harness()
  const p = h.session.save(h.options)
  h.session.dispose()
  h.session.activate()
  h.d.resolve(review())
  await p
  expect(h.saves).toEqual([])
})
test("review refusal reports error without emitting or applying access and can retry", async () => {
  const h = harness()
  const p = h.session.save(h.options)
  h.d.reject(Error("Access changed. Review again."))
  await p
  expect(h.saves).toEqual([])
  expect(h.errors).toEqual(["Access changed. Review again."])
  await h.session.save({ ...h.options, read: async () => review() })
  expect(h.saves).toHaveLength(1)
})
test("invalid inputs and disabled Save do not contact the server", async () => {
  const h = harness()
  await h.session.save({
    ...h.options,
    edits: {
      ...edits(),
      catalogEditor: true,
      assignments: [],
      defaultStoreId: null,
    },
  })
  expect(h.reads()).toBe(0)
  expect(h.errors).toHaveLength(1)
  h.disable()
  await h.session.save(h.options)
  expect(h.reads()).toBe(0)
})

test("canonical review Store labels and sorting do not alter the exact saved role intent", () => {
  const fields = {
    ...edits(),
    assignments: [
      { storeId: "shop", role: "MANAGER" as const },
      { storeId: "other", role: "CASHIER" as const },
    ],
  }
  const fresh = review(fields)
  const labeledAssignments = [
    { storeId: "other", role: "CASHIER" as const, storeName: "Other Store" },
    { storeId: "shop", role: "MANAGER" as const, storeName: "Main Shop" },
  ]
  fresh.after.assignments = labeledAssignments
  expect(
    nativeStaffAccessCandidate(initial, fields, fresh).assignments,
  ).toEqual(fields.assignments)
})

test("workload snapshot rejects incomplete counts, partial scope and stale or malformed job attribution", () => {
  const job = {
    jobId: "job",
    storeId: "shop",
    storeName: "Archived Shop",
    storeStatus: "ARCHIVED",
    priority: "URGENT",
    revision: 3,
    createdAt: "2026-10-14T09:00:00.000Z",
  }
  const work = {
    membershipId: "person",
    storeId: null,
    scope: "all_business_stores_current_assignee",
    coverage: "available",
    countCoverage: "complete",
    detailsCoverage: "complete",
    attribution: "current_assignee",
    count: 1,
    shown: 1,
    limit: 10,
    hasMore: false,
    asOf: "2026-10-15T09:00:00.000Z",
    jobs: [job],
  }
  expect(nativeStaffAccessWorkloadReady(work, "person")).toBe(true)
  for (const patch of [
    { membershipId: "other" },
    { scope: "selected_store_current_assignee" },
    { coverage: "unavailable" },
    { countCoverage: "limited" },
    { attribution: "performed" },
    { count: 0 },
    { shown: 0 },
    { limit: 0 },
    { hasMore: true },
    { detailsCoverage: "limited" },
    { asOf: "yesterday" },
    { jobs: [{ ...job, createdAt: "yesterday" }] },
    { jobs: [{ ...job, revision: -1 }] },
    { jobs: [{ ...job, storeId: "" }] },
    { jobs: [{ ...job, jobId: "job\n" }] },
    { jobs: [null] },
  ])
    expect(
      nativeStaffAccessWorkloadReady({ ...work, ...patch }, "person"),
    ).toBe(false)
  const limited = {
    ...work,
    count: 12,
    limit: 1,
    hasMore: true,
    detailsCoverage: "limited",
  }
  expect(nativeStaffAccessWorkloadReady(limited, "person")).toBe(true)
  expect(
    nativeStaffAccessWorkloadReady(
      { ...work, count: 2, shown: 2, jobs: [job, job] },
      "person",
    ),
  ).toBe(false)
})

test("parent role, business and draft changes synchronously fence old results before child cleanup", async () => {
  for (const changed of [
    "same-person:MANAGER:business-a",
    "same-person:OWNER:business-b",
    "different-draft:OWNER:business-a",
  ]) {
    const scope = createNativeStaffAccessScopeFence()
    const started = "same-person:OWNER:business-a"
    scope.update(started)
    const h = harness()
    const pending = h.session.save({
      ...h.options,
      allowed: () => scope.isCurrent(started),
    })
    scope.update(changed)
    // Deliberately no dispose, cancel or passive-effect cleanup.
    h.d.resolve(review())
    await pending
    expect(h.saves).toEqual([])
    expect(h.errors).toEqual([])
    expect(h.busy).toEqual([true])
  }
})
test("older finally cannot clear a newer pending save after cancel or StrictMode lifetime change", async () => {
  for (const invalidate of ["cancel", "dispose"] as const) {
    const h = harness()
    const old = h.session.save(h.options)
    if (invalidate === "cancel") h.session.cancel()
    else {
      h.session.dispose()
      h.session.activate()
    }
    const next = deferred<NativeStaffAccessReview>()
    const busy: boolean[] = []
    const current = h.session.save({
      ...h.options,
      read: () => next.promise,
      onBusy: (v) => busy.push(v),
    })
    expect(busy).toEqual([true])
    h.d.resolve(review())
    await old
    expect(busy).toEqual([true])
    expect(h.saves).toEqual([])
    next.resolve({ ...review(), expectedRevision: 21 })
    await current
    expect(busy).toEqual([true, false])
    expect(h.saves).toHaveLength(1)
    expect(h.saves[0]?.expectedRevision).toBe(21)
  }
})
