import { isValidStoreLink } from "@ewatrade/utils/store-link"
import { z } from "zod"

export const signupChatDetails = z
  .object({
    businessName: z.string().trim().min(1).max(120),
    name: z.string().trim().min(1).max(120),
    email: z.string().trim().toLowerCase().pipe(z.email()),
    requestedSlug: z
      .string()
      .refine(isValidStoreLink, "Choose a valid, available store link"),
    ageBand: z.enum(["AGE_13_TO_15", "AGE_16_TO_17", "ADULT"]),
  })
  .strict()
export type SignupChatDetails = z.infer<typeof signupChatDetails>
export const SIGNUP_CHAT_MESSAGE = "ewatrade.signup-chat.completed"

/** Presentation signal only; the dashboard still authenticates every subsequent request. */
export function isSignupChatCompletion(
  event: { origin: string; source: unknown; data: unknown },
  expectedOrigin: string,
  frameWindow: unknown,
) {
  if (
    event.origin !== expectedOrigin ||
    !frameWindow ||
    event.source !== frameWindow
  )
    return false
  return z
    .object({ type: z.literal(SIGNUP_CHAT_MESSAGE) })
    .strict()
    .safeParse(event.data).success
}

export const signupChatProgress = z
  .object({
    type: z.literal("ewatrade.signup-chat.progress"),
    action: z.enum([
      "review",
      "code_sent",
      "confirm",
      "created",
      "error",
      "edit",
      "open_dashboard",
    ]),
  })
  .strict()
export const signupChatStatus = z
  .object({
    type: z.literal("ewatrade.signup-chat.status"),
    pending: z.boolean(),
  })
  .strict()

export const signupChatDismiss = z
  .object({ type: z.literal("ewatrade.signup-chat.dismiss") })
  .strict()
