export type PrescriptionWorkspaceAccessState =
  | "error"
  | "forbidden"
  | "loading"
  | "ready"
  | "setup_required"

export function prescriptionWorkspaceAccessState(input: {
  canManageSetup: boolean
  hasError: boolean
  isDenied: boolean
  isLoading: boolean
}): PrescriptionWorkspaceAccessState {
  if (input.isLoading) return "loading"
  if (input.isDenied) {
    return input.canManageSetup ? "setup_required" : "forbidden"
  }
  return input.hasError ? "error" : "ready"
}
