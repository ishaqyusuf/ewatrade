/** Runtime access remains gated by an explicit launch flag and signing key. */
export function generalAssistantAvailability(
  environment: Readonly<Record<string, string | undefined>>,
) {
  const flagEnabled = environment.ASSISTANT_GENERAL_ENABLED === "true"
  const enabled =
    flagEnabled &&
    (environment.ASSISTANT_APPROVAL_SIGNING_KEY?.length ?? 0) >= 32
  return {
    flagEnabled,
    enabled,
    reason: enabled
      ? ("available" as const)
      : flagEnabled
        ? ("signing_unavailable" as const)
        : ("flag_off" as const),
  }
}
