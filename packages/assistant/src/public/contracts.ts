import { z } from "zod"

export const publicAssistantInput = z
  .object({
    messages: z
      .array(
        z
          .object({
            role: z.enum(["user", "assistant"]),
            content: z.string().trim().min(1).max(2000),
          })
          .strict()
          .refine(
            (message) =>
              message.role !== "user" || message.content.length <= 1000,
            "Keep questions under 1,000 characters",
          ),
      )
      .min(1)
      .max(6),
  })
  .strict()
  .refine(
    (value) => value.messages.at(-1)?.role === "user",
    "End with your question",
  )
export const publicAssistantReply = z
  .object({
    reply: z.string().trim().min(1).max(2000),
    startRegistration: z.boolean(),
  })
  .strict()
export type PublicAssistantReply = z.infer<typeof publicAssistantReply>
export type PublicAssistantInput = z.infer<typeof publicAssistantInput>

/** Codes, contacts and credentials belong to deterministic registration, never model history. */
export function containsRegistrationProof(
  text: string,
  credentialsNeedValue = false,
) {
  const proofValue =
    /\b\d{6}\b|\b\d{3}[\s-]\d{3}\b|[^\s@]+@[^\s@]+\.[^\s@]+|\+?\d[\d ()-]{8,}\d|\b(?:password|passcode|otp|verification code|access[_ -]?token|api[_ -]?key)\s*[:=]\s*\S+/i
  const credentialWords =
    /\b(?:password|passcode|otp|verification code|access[_ -]?token|api[_ -]?key)\b/i
  return (
    proofValue.test(text) ||
    (!credentialsNeedValue && credentialWords.test(text))
  )
}
