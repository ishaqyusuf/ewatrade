import { expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import {
  createDraftJobHandoffStore,
  draftJobNativeReadState,
  draftJobFactoryReadState,
  draftJobPreflightMatches,
  draftJobScopeEqual,
  type DraftJobHandoff,
} from "./assistant-draft-job-handoff-state"
import type { StaffAccessWorkload } from "./staff-access-workload-state"
import { StaffAccessWorkloadView } from "./staff-access-workload-view"

const scope = {
  actorUserId: "actor",
  tenantId: "business",
  storeId: "selected-store",
}
const selected = {
  jobId: "exact-job",
  revision: 7,
  storeId: "archived-store",
  storeName: "Old Workshop",
  storeStatus: "ARCHIVED",
  priority: "NORMAL",
  createdAt: "2026-10-01T10:00:00.000Z",
}
const workload: StaffAccessWorkload = {
  membershipId: "staff",
  storeId: null,
  scope: "all_business_stores_current_assignee",
  count: 1,
  shown: 1,
  limit: 10,
  hasMore: false,
  jobs: [selected],
  coverage: "available",
  countCoverage: "complete",
  detailsCoverage: "complete",
  attribution: "current_assignee",
  definition: "Native nonterminal Line predicate",
  ambiguity: "Separate whole-Job definition",
  asOf: "2026-10-12T10:00:00.000Z",
  detail: "One currently assigned Job",
  handover: "not_performed",
  performedWork: "not_measured",
  historicalSales: "excluded",
}
const native = {
  id: "exact-job",
  revision: 7,
  storeId: "archived-store",
  currentAssigneeUserId: "staff-user",
}
const handoff: DraftJobHandoff = {
  token: "owner-token",
  draftKey: "chat:proposal:revision",
  scope,
  membershipId: "staff",
  staffRevision: 4,
  jobId: selected.jobId,
  jobStoreId: selected.storeId,
  jobRevision: selected.revision,
  assigneeUserId: "staff-user",
}
const ready = {
  isPending: false,
  isFetching: false,
  isPaused: false,
  isError: false,
  isSuccess: true,
  isFetchedAfterMount: true,
  data: native,
}

test("the registered factory requires a live owner and freshly fetched current context", () => {
  const context = {
    ...ready,
    data: {
      actorUserId: scope.actorUserId,
      tenant: { id: scope.tenantId },
      activeStore: { id: scope.storeId },
    },
  }
  expect(draftJobFactoryReadState(handoff, handoff.token, scope, context)).toBe(
    "ready",
  )
  expect(
    draftJobFactoryReadState(handoff, handoff.token, undefined, context),
  ).toBe("ready")
  for (const live of [undefined, "another-token"])
    expect(draftJobFactoryReadState(handoff, live, scope, context)).toBe(
      "unavailable",
    )
  for (const flag of ["isPending", "isFetching", "isPaused"] as const)
    expect(
      draftJobFactoryReadState(handoff, handoff.token, scope, {
        ...context,
        [flag]: true,
      }),
    ).toBe("loading")
  expect(
    draftJobFactoryReadState(handoff, handoff.token, scope, {
      ...context,
      isFetchedAfterMount: false,
    }),
  ).toBe("loading")
  expect(
    draftJobFactoryReadState(handoff, handoff.token, scope, {
      ...context,
      isError: true,
    }),
  ).toBe("unavailable")
  expect(
    draftJobFactoryReadState(handoff, handoff.token, scope, {
      ...context,
      data: { ...context.data, activeStore: null },
    }),
  ).toBe("unavailable")
  expect(
    draftJobFactoryReadState(
      handoff,
      handoff.token,
      { ...scope, storeId: "other" },
      context,
    ),
  ).toBe("unavailable")
})

test("cross-Store and archived work pins exact authorized native Job without altering selected scope", () => {
  const before = JSON.stringify({ scope, workload, selected, native })
  expect(draftJobPreflightMatches(workload, "staff", selected, native)).toBe(
    true,
  )
  expect(draftJobNativeReadState(handoff, scope, ready)).toBe("ready")
  expect(JSON.stringify({ scope, workload, selected, native })).toBe(before)
  expect(scope.storeId).toBe("selected-store")
})

test("changed assignment, revision, missing/foreign Job or membership refuses preflight", () => {
  for (const result of [
    null,
    { ...native, id: "foreign-job" },
    { ...native, storeId: "foreign-store" },
    { ...native, revision: 8 },
    { ...native, currentAssigneeUserId: null },
  ])
    expect(draftJobPreflightMatches(workload, "staff", selected, result)).toBe(
      false,
    )
  expect(
    draftJobPreflightMatches(workload, "other-staff", selected, native),
  ).toBe(false)
  expect(
    draftJobPreflightMatches(
      { ...workload, count: 0, shown: 0, jobs: [] },
      "staff",
      selected,
      native,
    ),
  ).toBe(false)
  expect(
    draftJobPreflightMatches(
      workload,
      "staff",
      { ...selected, revision: 6 },
      native,
    ),
  ).toBe(false)
})

test("fresh native observer hides cached, pending, paused, fetching and failed reads", () => {
  expect(
    draftJobNativeReadState(handoff, scope, {
      ...ready,
      isFetchedAfterMount: false,
    }),
  ).toBe("loading")
  for (const flag of ["isPending", "isFetching", "isPaused"] as const)
    expect(
      draftJobNativeReadState(handoff, scope, { ...ready, [flag]: true }),
    ).toBe("loading")
  expect(
    draftJobNativeReadState(handoff, scope, { ...ready, isError: true }),
  ).toBe("unavailable")
  expect(
    draftJobNativeReadState(handoff, scope, { ...ready, data: null }),
  ).toBe("unavailable")
  expect(
    draftJobNativeReadState(handoff, scope, {
      ...ready,
      data: { ...native, currentAssigneeUserId: "later-assignee" },
    }),
  ).toBe("unavailable")
})

test("actor/business/selected-Store changes cannot adopt another handoff's data", () => {
  for (const field of ["actorUserId", "tenantId", "storeId"] as const) {
    const changed = { ...scope, [field]: "other" }
    expect(draftJobScopeEqual(scope, changed)).toBe(false)
    expect(draftJobNativeReadState(handoff, changed, ready)).toBe("unavailable")
  }
})

test("one ephemeral owner; delayed close cannot release a newer Job or store draft fields", () => {
  const store = createDraftJobHandoffStore()
  let notifications = 0
  const unsubscribe = store.subscribe(() => notifications++)
  expect(store.claim(handoff)).toBe(true)
  expect(store.claim({ ...handoff, token: "second" })).toBe(false)
  expect(store.release("other-owner")).toBe(false)
  expect(store.getSnapshot()).toEqual(handoff)
  expect(store.release(handoff.token)).toBe(true)
  expect(store.claim({ ...handoff, token: "second" })).toBe(true)
  expect(store.release(handoff.token)).toBe(false)
  expect(store.getSnapshot()?.token).toBe("second")
  expect(store.getSnapshot()).not.toHaveProperty("fields")
  unsubscribe()
  store.release("second")
  expect(notifications).toBe(3)
})

test("full native Job control is nonsubmit and disabled during preflight; internal IDs stay hidden", () => {
  for (const pending of [false, true]) {
    const html = renderToStaticMarkup(
      <StaffAccessWorkloadView
        workload={workload}
        membershipId="staff"
        jobPending={pending}
        onOpenJob={() => {}}
      />,
    )
    expect(html).toContain(
      pending ? "Checking current Job access" : "Open full Job",
    )
    expect(html).not.toContain('type="submit"')
    expect(html).not.toContain("exact-job")
    expect(html).not.toContain("archived-store")
    expect(html).toContain("unsaved access draft stays mounted")
    if (pending) expect(html).toMatch(/<button[^>]*disabled/)
  }
  const denied = renderToStaticMarkup(
    <StaffAccessWorkloadView
      workload={workload}
      membershipId="staff"
      onOpenJob={() => {}}
      jobError="Current authority revoked"
    />,
  )
  expect(denied).toContain("Current authority revoked")
})
