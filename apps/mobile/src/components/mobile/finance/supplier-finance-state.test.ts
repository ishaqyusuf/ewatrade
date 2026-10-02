import { describe, expect, it } from "bun:test"
import {
  beginSupplierProtectedRead,
  canShowSupplierRead,
  completeSupplierProtectedRead,
  createSupplierReadAuthority,
  isSupplierAgingDay,
  supplierAgingBucketLabels,
  transitionSupplierReadAuthority,
} from "./supplier-finance-state"

describe("supplier finance read state", () => {
  it("accepts only real UTC cutoff days", () => {
    expect(isSupplierAgingDay("2026-10-02")).toBe(true)
    expect(isSupplierAgingDay("2024-02-29")).toBe(true)
    expect(isSupplierAgingDay("2025-02-29")).toBe(false)
    expect(isSupplierAgingDay("2026-13-02")).toBe(false)
    expect(isSupplierAgingDay("2026-10-2")).toBe(false)
  })

  it("conceals cached read data unless the current request is fresh and usable", () => {
    const available = {
      success: true,
      fetching: false,
      paused: false,
      offline: false,
      error: false,
      verified: true,
      scopeMatches: true,
    }
    expect(canShowSupplierRead(available)).toBe(true)
    for (const blocked of [
      { ...available, fetching: true },
      { ...available, paused: true },
      { ...available, offline: true },
      { ...available, error: true },
      { ...available, success: false },
      { ...available, verified: false },
      { ...available, scopeMatches: false },
    ]) {
      expect(canShowSupplierRead(blocked)).toBe(false)
    }
  })

  it("keeps undated source meaning explicit", () => {
    expect(supplierAgingBucketLabels.UNDATED).toBe("No due date recorded")
  })

  it("requires a current-generation successful read after authority taints", () => {
    const scope = "statement:book-1:supplier-1:latest:first-page"
    let authority = createSupplierReadAuthority(scope)
    const firstRead = beginSupplierProtectedRead(authority, scope)
    expect(firstRead).not.toBeNull()
    if (!firstRead) return
    authority = firstRead.authority
    authority = completeSupplierProtectedRead(authority, firstRead.token, true)
    expect(authority.verified).toBe(true)

    // A pause taints the prior success. Returning to idle with the old query
    // success does not change authority; only a new request can restore it.
    authority = transitionSupplierReadAuthority(authority, true, scope)
    expect(authority.verified).toBe(false)
    expect(authority.attempted).toBe(false)
    expect(
      canShowSupplierRead({
        success: true,
        fetching: false,
        paused: false,
        offline: false,
        error: false,
        verified: authority.verified,
        scopeMatches: authority.scope === scope,
      }),
    ).toBe(false)

    const obsoleteRead = beginSupplierProtectedRead(authority, scope)
    expect(obsoleteRead).not.toBeNull()
    if (!obsoleteRead) return
    expect(obsoleteRead.authority.tainted).toBe(true)
    expect(obsoleteRead.authority.activeRequestId).toBe(
      obsoleteRead.token.requestId,
    )
    authority = obsoleteRead.authority
    const recoveryGeneration = authority.generation
    authority = transitionSupplierReadAuthority(authority, true, scope)
    expect(authority.generation).toBe(recoveryGeneration + 1)
    expect(authority.activeRequestId).toBeNull()
    const afterOffline = authority
    authority = completeSupplierProtectedRead(
      authority,
      obsoleteRead.token,
      true,
    )
    expect(authority).toEqual(afterOffline)
    expect(authority.verified).toBe(false)

    const freshRead = beginSupplierProtectedRead(authority, scope)
    expect(freshRead).not.toBeNull()
    if (!freshRead) return
    authority = completeSupplierProtectedRead(
      freshRead.authority,
      freshRead.token,
      true,
    )
    expect(authority.verified).toBe(true)

    const oldScopeRead = beginSupplierProtectedRead(authority, scope)
    expect(oldScopeRead).not.toBeNull()
    if (!oldScopeRead) return
    const nextScope = `${scope}:next-page`
    const nextScopeRead = beginSupplierProtectedRead(
      oldScopeRead.authority,
      nextScope,
    )
    expect(nextScopeRead).not.toBeNull()
    if (!nextScopeRead) return
    expect(nextScopeRead.authority.verified).toBe(false)
    const afterScopeChange = completeSupplierProtectedRead(
      nextScopeRead.authority,
      oldScopeRead.token,
      true,
    )
    expect(afterScopeChange.verified).toBe(false)
    authority = completeSupplierProtectedRead(
      afterScopeChange,
      nextScopeRead.token,
      true,
    )
    expect(authority.verified).toBe(true)
  })
})
