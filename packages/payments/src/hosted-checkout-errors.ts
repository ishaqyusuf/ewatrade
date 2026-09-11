export type HostedCheckoutProviderErrorCode =
  | "DEFINITE_FAILURE"
  | "OUTCOME_UNKNOWN"

export class HostedCheckoutProviderError extends Error {
  constructor(
    readonly code: HostedCheckoutProviderErrorCode,
    message: string,
  ) {
    super(message)
    this.name = "HostedCheckoutProviderError"
  }
}
