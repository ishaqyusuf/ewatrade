/** Scheduling the UI never enables an incomplete general runtime. */
export function generalAssistantAvailability(
  environment: Readonly<Record<string, string | undefined>>,
) {
  return {
    flagEnabled: environment.ASSISTANT_GENERAL_ENABLED === "true",
    enabled: false,
    reason:
      environment.ASSISTANT_GENERAL_ENABLED === "true"
        ? ("runtime_pending" as const)
        : ("flag_off" as const),
  }
}
