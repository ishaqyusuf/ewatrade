export type CustomerConversationListQaState =
  | "empty"
  | "populated"
  | "unavailable"

export function parseCustomerConversationListQaState(input: {
  development: boolean
  qaState?: string | string[] | null
}): CustomerConversationListQaState | null {
  if (!input.development || Array.isArray(input.qaState)) return null
  if (
    input.qaState === "empty" ||
    input.qaState === "populated" ||
    input.qaState === "unavailable"
  ) {
    return input.qaState
  }
  return null
}

export function isCustomerConversationListQaState(input: {
  development: boolean
  qaState?: string | string[] | null
}) {
  return parseCustomerConversationListQaState(input) !== null
}
