export type PurchaseCleanupScope = {
  run: string
  tenantId?: string
  actorUserId?: string
  bookId?: string
  items: string[]
}
export function assertPurchaseCleanupScope(
  input: PurchaseCleanupScope,
  source: {
    tenant: { id: string; slug: string; dataClassification: string } | null
    book: { id: string; tenantId: string } | null
    user: { id: string; email: string } | null
    items: { id: string; tenantId: string }[]
    foreignMemberships: number
  },
) {
  const { run, tenantId, actorUserId, bookId, items } = input
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      run,
    ) ||
    (tenantId &&
      (source.tenant?.id !== tenantId ||
        source.tenant.slug !== `supplier-recognition-${run}` ||
        source.tenant.dataClassification !== "QA")) ||
    (bookId &&
      (!tenantId ||
        source.book?.id !== bookId ||
        source.book.tenantId !== tenantId)) ||
    (actorUserId &&
      (source.user?.id !== actorUserId ||
        source.user.email !== `supplier-recognition-${run}@example.invalid` ||
        source.foreignMemberships !== 0)) ||
    new Set(items).size !== items.length ||
    (items.length > 0 &&
      (!tenantId ||
        source.items.length !== items.length ||
        source.items.some(
          (item) => item.tenantId !== tenantId || !items.includes(item.id),
        )))
  )
    throw new Error(
      `Refusing cleanup of mismatched supplier recognition fixture ${run}`,
    )
}
