export function isSupplierAgingDay(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00.000Z`)
  return (
    Number.isFinite(date.getTime()) &&
    date.toISOString().slice(0, 10) === value &&
    value >= "0001-01-01" &&
    value <= "9999-12-30"
  )
}

export function canShowSupplierRead({
  success,
  fetching,
  paused,
  offline,
  error,
  verified,
  scopeMatches,
}: {
  success: boolean
  fetching: boolean
  paused: boolean
  offline: boolean
  error: boolean
  verified: boolean
  scopeMatches: boolean
}) {
  return (
    success &&
    verified &&
    scopeMatches &&
    !fetching &&
    !paused &&
    !offline &&
    !error
  )
}

export type SupplierReadToken = {
  generation: number
  requestId: number
  scope: string
}

export type SupplierReadAuthority = {
  generation: number
  nextRequestId: number
  activeRequestId: number | null
  scope: string
  verified: boolean
  attempted: boolean
  tainted: boolean
}

export function createSupplierReadAuthority(
  scope: string,
): SupplierReadAuthority {
  return {
    generation: 0,
    nextRequestId: 1,
    activeRequestId: null,
    scope,
    verified: false,
    attempted: false,
    tainted: false,
  }
}

export function taintSupplierReadAuthority(
  authority: SupplierReadAuthority,
  scope = authority.scope,
): SupplierReadAuthority {
  return {
    ...authority,
    generation: authority.generation + 1,
    activeRequestId: null,
    scope,
    verified: false,
    attempted: false,
    tainted: true,
  }
}

export function transitionSupplierReadAuthority(
  authority: SupplierReadAuthority,
  blocked: boolean,
  scope: string,
): SupplierReadAuthority {
  if (authority.scope !== scope)
    return taintSupplierReadAuthority(authority, scope)
  if (blocked && (!authority.tainted || authority.activeRequestId !== null))
    return taintSupplierReadAuthority(authority, scope)
  return authority
}

export function beginSupplierProtectedRead(
  authority: SupplierReadAuthority,
  scope: string,
): { authority: SupplierReadAuthority; token: SupplierReadToken } | null {
  const current =
    authority.scope === scope
      ? authority
      : taintSupplierReadAuthority(authority, scope)
  if (current.activeRequestId !== null) return null
  const requestId = current.nextRequestId
  const token = { generation: current.generation, requestId, scope }
  return {
    authority: {
      ...current,
      nextRequestId: requestId + 1,
      activeRequestId: requestId,
      verified: false,
      attempted: true,
      tainted: true,
    },
    token,
  }
}

export function completeSupplierProtectedRead(
  authority: SupplierReadAuthority,
  token: SupplierReadToken,
  succeeded: boolean,
): SupplierReadAuthority {
  if (
    authority.generation !== token.generation ||
    authority.scope !== token.scope ||
    authority.activeRequestId !== token.requestId
  )
    return authority
  return {
    ...authority,
    activeRequestId: null,
    verified: succeeded,
    attempted: true,
    tainted: !succeeded,
  }
}

export const supplierAgingBucketLabels = {
  NOT_DUE: "Not due",
  DUE_TODAY: "Due today",
  OVERDUE_1_30: "1–30 days overdue",
  OVERDUE_31_60: "31–60 days overdue",
  OVERDUE_61_90: "61–90 days overdue",
  OVERDUE_91_PLUS: "91+ days overdue",
  UNDATED: "No due date recorded",
} as const
