import type { StaffAccessWorkload } from "./staff-access-workload-state"
import { staffAccessWorkloadJob } from "./staff-access-workload-state"

export type DraftJobScope = {
  actorUserId: string
  tenantId: string
  storeId: string
}
export type DraftJobHandoff = {
  token: string
  draftKey: string
  scope: DraftJobScope
  membershipId: string
  staffRevision: number
  jobId: string
  jobStoreId: string
  jobRevision: number
  assigneeUserId: string
}
export function draftJobScopeEqual(a: DraftJobScope, b: DraftJobScope) {
  return (
    a.actorUserId === b.actorUserId &&
    a.tenantId === b.tenantId &&
    a.storeId === b.storeId
  )
}
export function draftJobFactoryReadState(
  handoff: DraftJobHandoff,
  liveToken: string | undefined,
  expectedScope: DraftJobScope | undefined,
  query: {
    isPending: boolean
    isFetching: boolean
    isPaused: boolean
    isError: boolean
    isSuccess: boolean
    isFetchedAfterMount: boolean
    data?: {
      actorUserId: string
      tenant: { id: string }
      activeStore: { id: string } | null
    }
  },
) {
  if (liveToken !== handoff.token || query.isError)
    return "unavailable" as const
  if (
    query.isPending ||
    query.isFetching ||
    query.isPaused ||
    !query.isFetchedAfterMount
  )
    return "loading" as const
  if (!query.isSuccess || !query.data?.activeStore)
    return "unavailable" as const
  const current = {
    actorUserId: query.data.actorUserId,
    tenantId: query.data.tenant.id,
    storeId: query.data.activeStore.id,
  }
  if (
    !draftJobScopeEqual(handoff.scope, current) ||
    (expectedScope && !draftJobScopeEqual(expectedScope, current))
  )
    return "unavailable" as const
  return "ready" as const
}
export function draftJobPreflightMatches(
  workload: StaffAccessWorkload,
  membershipId: string,
  selected: StaffAccessWorkload["jobs"][number],
  native: {
    id: string
    storeId: string
    revision: number
    currentAssigneeUserId: string | null
  } | null,
) {
  const fresh = staffAccessWorkloadJob(workload, membershipId, selected.jobId)
  return Boolean(
    fresh &&
      native &&
      fresh.storeId === selected.storeId &&
      fresh.revision === selected.revision &&
      native.id === fresh.jobId &&
      native.storeId === fresh.storeId &&
      native.revision === fresh.revision &&
      native.currentAssigneeUserId,
  )
}
/** The factory must withhold old facts during every new authorized observer/read. */
export function draftJobNativeReadState(
  handoff: DraftJobHandoff,
  scope: DraftJobScope,
  query: {
    isPending: boolean
    isFetching: boolean
    isPaused: boolean
    isError: boolean
    isSuccess: boolean
    isFetchedAfterMount: boolean
    data?: {
      id: string
      storeId: string
      revision: number
      currentAssigneeUserId: string | null
    } | null
  },
) {
  if (!draftJobScopeEqual(handoff.scope, scope)) return "unavailable" as const
  if (
    query.isPending ||
    query.isFetching ||
    query.isPaused ||
    !query.isFetchedAfterMount
  )
    return "loading" as const
  if (
    query.isError ||
    !query.isSuccess ||
    !query.data ||
    query.data.id !== handoff.jobId ||
    query.data.storeId !== handoff.jobStoreId ||
    query.data.revision !== handoff.jobRevision ||
    query.data.currentAssigneeUserId !== handoff.assigneeUserId
  )
    return "unavailable" as const
  return "ready" as const
}

/** Ephemeral only: no URL authority, durable storage, draft fields or private Job graph. */
export function createDraftJobHandoffStore() {
  let current: DraftJobHandoff | null = null
  const listeners = new Set<() => void>()
  const notify = () => {
    for (const listener of listeners) listener()
  }
  return {
    getSnapshot: () => current,
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    claim: (value: DraftJobHandoff) => {
      if (current) return false
      current = value
      notify()
      return true
    },
    release: (token: string) => {
      if (current?.token !== token) return false
      current = null
      notify()
      return true
    },
  }
}
