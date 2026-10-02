export type SupplierCommandAuthority = {
  generation: number
  scope: string
}

export type SupplierCommandPreparation = {
  generation: number
  scope: string
}

export function createSupplierCommandAuthority(
  scope: string,
): SupplierCommandAuthority {
  return { generation: 0, scope }
}

export function reconcileSupplierCommandScope(
  authority: SupplierCommandAuthority,
  scope: string,
): SupplierCommandAuthority {
  return authority.scope === scope
    ? authority
    : { generation: authority.generation + 1, scope }
}

export function invalidateSupplierCommandAuthority(
  authority: SupplierCommandAuthority,
): SupplierCommandAuthority {
  return { ...authority, generation: authority.generation + 1 }
}

export function beginSupplierCommandPreparation(
  authority: SupplierCommandAuthority,
  canStart: boolean,
): SupplierCommandPreparation | null {
  if (!canStart) return null
  return { generation: authority.generation, scope: authority.scope }
}

export function isSupplierCommandPreparationCurrent(
  authority: SupplierCommandAuthority,
  preparation: SupplierCommandPreparation,
  scope: string,
  canContinue: boolean,
) {
  return (
    canContinue &&
    authority.scope === scope &&
    preparation.scope === scope &&
    authority.generation === preparation.generation
  )
}
