export type StartupSplashProps =
  | { state?: "normal" | "busy"; onRetry?: never }
  | { state: "error" | "offline"; onRetry: () => void }

// Only native transport failures justify the offline copy. Server errors must
// retain the access-check failure state rather than falsely claiming no access.
export function startupAccessFailureState(error: { message: string }) {
  return /network request failed|failed to fetch|networkerror/i.test(
    error.message,
  )
    ? ("offline" as const)
    : ("error" as const)
}
