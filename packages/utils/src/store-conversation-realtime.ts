export function mergeStoreConversationSequence<
  T extends {
    id: string
    sequence: number
  },
>(current: T[], incoming: T[]) {
  const byId = new Map(current.map((message) => [message.id, message]))
  for (const message of incoming) byId.set(message.id, message)
  return [...byId.values()].sort((left, right) =>
    left.sequence === right.sequence
      ? left.id.localeCompare(right.id)
      : left.sequence - right.sequence,
  )
}

export function mergeStoreConversationActionMessageUpdates<
  T extends {
    actionMessage?: unknown
    id: string
  },
  ActionMessage,
>(
  messages: T[],
  updates: Array<{ actionMessage: ActionMessage; messageId: string }>,
) {
  if (updates.length === 0) return messages
  const byMessageId = new Map(
    updates.map((update) => [update.messageId, update.actionMessage]),
  )
  return messages.map((message) => {
    const actionMessage = byMessageId.get(message.id)
    return actionMessage === undefined ? message : { ...message, actionMessage }
  })
}

export function latestStoreConversationSequence(
  messages: Array<{ sequence: number }>,
) {
  return messages.reduce(
    (latest, message) => Math.max(latest, message.sequence),
    0,
  )
}
