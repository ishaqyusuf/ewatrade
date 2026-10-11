/** The business chat needs its approval signing key; nothing else gates it. */
export function generalAssistantAvailability(
  environment: Readonly<Record<string, string | undefined>>,
) {
  const enabled =
    (environment.ASSISTANT_APPROVAL_SIGNING_KEY?.length ?? 0) >= 32
  return {
    enabled,
    reason: enabled ? ("available" as const) : ("signing_unavailable" as const),
  }
}
