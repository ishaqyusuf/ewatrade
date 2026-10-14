import {
  CUSTOMER_MESSAGE_TEMPLATE_MAX_CHARACTERS,
  type CustomerMessageEventKey,
  customerMessageVariableLabels,
  renderCustomerMessageTemplate,
} from "@ewatrade/customer-messages/client"

export function messageVariableLabel(name: string) {
  return customerMessageVariableLabels[name] ?? name.replaceAll("_", " ")
}

export function messageLength(body: string) {
  return Array.from(body).length
}

export const MESSAGE_MAX_CHARACTERS = CUSTOMER_MESSAGE_TEMPLATE_MAX_CHARACTERS

/** Render with the shared validator; a problem is shown, never swallowed. */
export function tryRenderMessage(
  eventKey: CustomerMessageEventKey,
  body: string,
  variables: Record<string, string | undefined>,
): { text: string; problem: null } | { text: null; problem: string } {
  try {
    return {
      text: renderCustomerMessageTemplate(eventKey, body, variables),
      problem: null,
    }
  } catch (failure) {
    return {
      text: null,
      problem:
        failure instanceof Error ? failure.message : "Check this message.",
    }
  }
}

/** Insert `{name}` at the caret and return the next value and caret. */
export function insertVariable(
  value: string,
  name: string,
  selection: { start: number; end: number } | null,
) {
  const token = `{${name}}`
  const start = selection?.start ?? value.length
  const end = selection?.end ?? value.length
  const before = value.slice(0, start)
  const spaced = before && !/\s$/.test(before) ? `${before} ` : before
  const next = `${spaced}${token}${value.slice(end)}`
  return { value: next, caret: spaced.length + token.length }
}
