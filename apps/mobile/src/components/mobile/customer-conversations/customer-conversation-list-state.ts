type CustomerConversationListItem = {
  conversationId: string
  lastActivityAt: string | Date
}

export function canFetchCustomerConversationListNextPage(input: {
  hasNextPage: boolean
  isFetchingNextPage: boolean
  qaIsolated: boolean
}) {
  return !input.qaIsolated && input.hasNextPage && !input.isFetchingNextPage
}

export function mergeCustomerConversationAccessItems<
  TItem extends CustomerConversationListItem,
>(input: {
  accountItems: TItem[]
  credentialRejected: boolean
  guestItems: TItem[]
  qaUnavailable: boolean
}) {
  if (input.qaUnavailable)
    return [] as Array<TItem & { access: "account" | "guest" }>

  const merged = new Map<string, TItem & { access: "account" | "guest" }>()

  if (!input.credentialRejected) {
    for (const item of input.guestItems) {
      merged.set(item.conversationId, { ...item, access: "guest" })
    }
  }

  for (const item of input.accountItems) {
    merged.set(item.conversationId, { ...item, access: "account" })
  }

  return [...merged.values()].sort(
    (left, right) =>
      new Date(right.lastActivityAt).getTime() -
      new Date(left.lastActivityAt).getTime(),
  )
}
