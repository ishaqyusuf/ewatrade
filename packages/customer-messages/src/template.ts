import {
  type CustomerMessageEventKey,
  getCustomerMessageEvent,
  requiredVariablesByEvent,
} from "./customer-message-catalog"

export interface MessageTemplate {
  eventKey: CustomerMessageEventKey
  body: string
  enabled: boolean
  revision: number
  scopeKey: string
  source?: string
}

export const CUSTOMER_MESSAGE_TEMPLATE_MAX_CHARACTERS = 1_000

const variableTokenPattern = /\{([^{}]*)\}/g
const htmlTagPattern = /<\/?[a-z][^>]*>/i

function characterCount(value: string): number {
  return Array.from(value).length
}

function readTokens(eventKey: CustomerMessageEventKey, body: string): string[] {
  if (typeof body !== "string") {
    throw new Error("Message template must be text")
  }

  if (!body.trim()) {
    throw new Error("Message template cannot be empty")
  }

  if (characterCount(body) > CUSTOMER_MESSAGE_TEMPLATE_MAX_CHARACTERS) {
    throw new Error(
      `Message template cannot exceed ${CUSTOMER_MESSAGE_TEMPLATE_MAX_CHARACTERS} characters`,
    )
  }

  if (htmlTagPattern.test(body)) {
    throw new Error("HTML is not allowed in message templates")
  }

  const event = getCustomerMessageEvent(eventKey)
  const allowedVariables = new Set(event.variables)
  const tokens: string[] = []

  variableTokenPattern.lastIndex = 0
  for (const match of body.matchAll(variableTokenPattern)) {
    const token = match[1] ?? ""
    if (!/^[a-z][a-z0-9_]*$/.test(token)) {
      throw new Error(`Malformed message variable token: {${token}}`)
    }
    if (!allowedVariables.has(token)) {
      throw new Error(`Variable {${token}} is not allowed for ${eventKey}`)
    }
    tokens.push(token)
  }

  const tokenFreeBody = body.replace(variableTokenPattern, "")
  if (tokenFreeBody.includes("{") || tokenFreeBody.includes("}")) {
    throw new Error("Message template contains a malformed variable token")
  }

  return tokens
}

export function validateCustomerMessageTemplate(
  eventKey: CustomerMessageEventKey,
  body: string,
): void {
  readTokens(eventKey, body)
}

const optionalVariableFallbacks: Readonly<Record<string, string>> = {
  customer_name: "there",
  customer_first_name: "there",
  business_name: "our team",
  store_name: "our store",
  store_phone: "the store",
  order_date: "the order date",
  order_status: "your order",
  payment_date: "the payment date",
  payment_method: "your payment method",
}

export function renderCustomerMessageTemplate(
  eventKey: CustomerMessageEventKey,
  body: string,
  variables: Record<string, string | undefined>,
): string {
  readTokens(eventKey, body)
  const required = new Set(requiredVariablesByEvent[eventKey])

  return body.replace(variableTokenPattern, (_tokenText, name: string) => {
    const value = variables[name]
    if (value !== undefined && value.trim().length > 0) {
      return value
    }

    if (required.has(name)) {
      throw new Error(`Missing required message variable: ${name}`)
    }

    const fallback = optionalVariableFallbacks[name]
    if (fallback === undefined) {
      throw new Error(`No fallback is configured for message variable: ${name}`)
    }
    return fallback
  })
}
