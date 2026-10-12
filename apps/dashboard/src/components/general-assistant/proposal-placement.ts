/**
 * Which reply each draft card belongs under. A draft is created while the
 * assistant answers one message, so it belongs to the latest user message
 * sent before it and shows after that turn's last message. Messages without
 * a saved time (still streaming) count as just after the one before them;
 * drafts without a time (older API) stay at the end of the chat.
 */
export function placeProposals<P extends { createdAt?: string }>(
  messages: ReadonlyArray<{ id: string; role: string }>,
  times: ReadonlyMap<string, number>,
  proposals: readonly P[],
) {
  const turns: Array<{ time: number; endId: string }> = []
  let last = Number.NEGATIVE_INFINITY
  for (const message of messages) {
    last = times.get(message.id) ?? last + 1
    if (message.role === "user") turns.push({ time: last, endId: message.id })
    else {
      const turn = turns.at(-1)
      if (turn) turn.endId = message.id
    }
  }
  const after = new Map<string, P[]>()
  const rest: P[] = []
  for (const proposal of proposals) {
    const time = proposal.createdAt
      ? Date.parse(proposal.createdAt)
      : Number.NaN
    const turn = Number.isNaN(time)
      ? undefined
      : turns.findLast((candidate) => candidate.time <= time)
    if (!turn) rest.push(proposal)
    else after.set(turn.endId, [...(after.get(turn.endId) ?? []), proposal])
  }
  return { after, rest }
}
