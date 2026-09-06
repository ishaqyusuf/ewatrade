export function getBusinessHomeLedgerStepSemantics(input: {
  disabled: boolean
  hasAction: boolean
}) {
  const available = input.hasAction && !input.disabled

  return {
    accessibilityRole: available ? ("button" as const) : undefined,
    accessibilityState: input.disabled ? { disabled: true } : undefined,
    available,
  }
}
