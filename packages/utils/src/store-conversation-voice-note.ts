export function formatStoreConversationVoiceElapsed(elapsedMs: number) {
  const seconds = Math.min(60, Math.floor(Math.max(0, elapsedMs) / 1_000))
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`
}
