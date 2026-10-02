import { describe, expect, it } from "bun:test"

import {
  beginSupplierCommandPreparation,
  createSupplierCommandAuthority,
  invalidateSupplierCommandAuthority,
  isSupplierCommandPreparationCurrent,
  reconcileSupplierCommandScope,
} from "./supplier-command-authority"

describe("supplier command preparation authority", () => {
  it("rejects a preparation after offline invalidation, including offline then online", () => {
    const authority = createSupplierCommandAuthority(
      "actor:tenant:book:supplier",
    )
    const token = beginSupplierCommandPreparation(authority, true)
    if (!token) throw new Error("expected preparation token")
    const offline = invalidateSupplierCommandAuthority(authority)
    const onlineAgain = { ...offline }
    expect(
      isSupplierCommandPreparationCurrent(
        onlineAgain,
        token,
        "actor:tenant:book:supplier",
        true,
      ),
    ).toBe(false)
  })

  it("rejects stale responses after actor, book, supplier or unmount scope changes", () => {
    const authority = createSupplierCommandAuthority(
      "actor:tenant:book:supplier",
    )
    const token = beginSupplierCommandPreparation(authority, true)
    if (!token) throw new Error("expected preparation token")
    const changed = reconcileSupplierCommandScope(
      authority,
      "other-actor:tenant:book:other-supplier",
    )
    expect(
      isSupplierCommandPreparationCurrent(changed, token, changed.scope, true),
    ).toBe(false)
    const unmounted = invalidateSupplierCommandAuthority(authority)
    expect(
      isSupplierCommandPreparationCurrent(
        unmounted,
        token,
        authority.scope,
        true,
      ),
    ).toBe(false)
  })

  it("allows only the matching online preparation in the same scope", () => {
    const authority = createSupplierCommandAuthority("actor:tenant:book:new")
    const token = beginSupplierCommandPreparation(authority, true)
    if (!token) throw new Error("expected preparation token")
    expect(
      isSupplierCommandPreparationCurrent(
        authority,
        token,
        authority.scope,
        true,
      ),
    ).toBe(true)
    expect(
      isSupplierCommandPreparationCurrent(
        authority,
        token,
        authority.scope,
        false,
      ),
    ).toBe(false)
  })
})
