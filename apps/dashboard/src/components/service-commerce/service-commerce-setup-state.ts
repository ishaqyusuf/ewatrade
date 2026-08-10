export type ServiceCommerceSetupViewState =
  | "error"
  | "loading"
  | "read_only"
  | "ready"

export function serviceCommerceSetupViewState(input: {
  canManage: boolean
  hasData: boolean
  hasError: boolean
  isLoading: boolean
}): ServiceCommerceSetupViewState {
  if (input.isLoading) return "loading"
  if (input.hasError || !input.hasData) return "error"
  return input.canManage ? "ready" : "read_only"
}
