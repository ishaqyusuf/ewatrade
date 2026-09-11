export type CustomerVoiceStartAttempt = {
  generation: number
  scopeKey: string
}

export function isCustomerVoiceStartCurrent(
  attempt: CustomerVoiceStartAttempt,
  current: {
    appState: string
    enabled: boolean
    generation: number
    scopeKey: string
  },
) {
  return (
    current.appState === "active" &&
    current.enabled &&
    current.generation === attempt.generation &&
    current.scopeKey === attempt.scopeKey
  )
}
