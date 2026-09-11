export function shouldSuggestQaAuthorization(input: {
  authorizationPresent: boolean
  clientEnabled: boolean
  isBusinessShell: boolean
}) {
  if (!input.clientEnabled || !input.isBusinessShell) return false
  return !input.authorizationPresent
}
