const maxBytes = 48 * 1024
const encoder = new TextEncoder()

/** Includes envelope bytes and UTF-8; skip oversized items so none blocks a queue. */
export function boundedBatch<T extends { eventId: string }>(
  queue: T[],
  envelope: {
    sentAt: string
    sdk: { name: "@ishaqyusuf/logly-core"; version: string }
  },
) {
  const events: T[] = []
  const dropped = new Set<string>()
  for (const event of queue) {
    if (
      encoder.encode(JSON.stringify({ ...envelope, events: [event] }))
        .byteLength > maxBytes
    ) {
      dropped.add(event.eventId)
      continue
    }
    if (
      events.length === 25 ||
      encoder.encode(
        JSON.stringify({ ...envelope, events: [...events, event] }),
      ).byteLength > maxBytes
    )
      break
    events.push(event)
  }
  return { batch: { ...envelope, events }, dropped }
}
