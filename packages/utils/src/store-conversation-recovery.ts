export type StoreConversationRecoveryPage<Message> = {
  messages: Message[]
  nextCursor: number | null
}

const STORE_CONVERSATION_ACTION_REFRESH_BATCH_SIZE = 100

function mountedActionMessageBatches(messageIds: string[]) {
  const uniqueIds = [...new Set(messageIds)]
  if (uniqueIds.length === 0) return [[]]
  const batches: string[][] = []
  for (
    let offset = 0;
    offset < uniqueIds.length;
    offset += STORE_CONVERSATION_ACTION_REFRESH_BATCH_SIZE
  ) {
    batches.push(
      uniqueIds.slice(
        offset,
        offset + STORE_CONVERSATION_ACTION_REFRESH_BATCH_SIZE,
      ),
    )
  }
  return batches
}

export async function drainStoreConversationRecovery<Message>(input: {
  afterSequence: number
  fetchPage: (
    afterSequence: number,
  ) => Promise<StoreConversationRecoveryPage<Message>>
  sequenceOf: (message: Message) => number
}) {
  const messages: Message[] = []
  let cursor = input.afterSequence
  for (;;) {
    const page = await input.fetchPage(cursor)
    messages.push(...page.messages)
    const lastSequence = page.messages.reduce(
      (latest, message) => Math.max(latest, input.sequenceOf(message)),
      cursor,
    )
    if (page.nextCursor === null) {
      return { messages, throughSequence: lastSequence }
    }
    if (page.nextCursor <= cursor) {
      throw new Error("Store Conversation recovery cursor did not advance.")
    }
    cursor = Math.max(page.nextCursor, lastSequence)
  }
}

export async function drainMountedStoreConversationActionRecovery<
  Message,
  Page extends
    StoreConversationRecoveryPage<Message> = StoreConversationRecoveryPage<Message>,
>(input: {
  actionMessageIds: string[]
  afterSequence: number
  fetchPage: (
    actionMessageIds: string[],
    afterSequence: number,
  ) => Promise<Page>
  onPage?: (page: Page) => void
  sequenceOf: (message: Message) => number
}) {
  const messages: Message[] = []
  let throughSequence = input.afterSequence
  for (const actionMessageIds of mountedActionMessageBatches(
    input.actionMessageIds,
  )) {
    const recovery = await drainStoreConversationRecovery({
      afterSequence: throughSequence,
      fetchPage: async (afterSequence) => {
        const page = await input.fetchPage(actionMessageIds, afterSequence)
        input.onPage?.(page)
        return page
      },
      sequenceOf: input.sequenceOf,
    })
    messages.push(...recovery.messages)
    throughSequence = Math.max(throughSequence, recovery.throughSequence)
  }
  return { messages, throughSequence }
}
