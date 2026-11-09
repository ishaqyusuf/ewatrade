import type {
  PublicAssistantInput,
  PublicAssistantReply,
} from "@ewatrade/assistant/public/contracts"

/** Anonymous visitors have no server-derived adult declaration. Keep registration
 * guidance provider-free; live AI belongs to the authenticated adult workspace. */
export async function answerPublicAssistant(
  input: PublicAssistantInput,
  signal: AbortSignal,
): Promise<PublicAssistantReply | null> {
  signal.throwIfAborted()
  const question = input.messages.at(-1)?.content ?? ""
  const registration =
    /\b(?:register|sign\s*up|create (?:an? )?(?:account|business)|get started)\b/i.test(
      question,
    )
  if (registration)
    return {
      reply:
        "Use the registration controls to enter your details, review the terms and verify your email. Eligible accounts can use business tools from age 13; live AI requires an account declared 18 or older.",
      startRegistration: true,
    }
  if (/\b(?:pric(?:e|es|ing)|plans?|cost|subscriptions?)\b/i.test(question))
    return {
      reply:
        "Monthly owner plans are Starter ₦5,000, Growth ₦15,000 and Pro ₦30,000 in Nigeria. Staff do not need separate owner subscriptions. Local prices may vary by currency and app store.",
      startRegistration: false,
    }
  if (
    /\b(?:features?|sales?|stock|orders?|what can|business)\b/i.test(question)
  )
    return {
      reply:
        "EwaTrade keeps sales, orders, stock, customer balances and business records together. You review supported changes before they are saved. Sign in with an account declared 18 or older to use live AI.",
      startRegistration: false,
    }
  return {
    reply:
      "I can help with EwaTrade features, plans or registration here. For live AI, sign in with an account declared 18 or older. You can still set up your business using the registration controls.",
    startRegistration: false,
  }
}
