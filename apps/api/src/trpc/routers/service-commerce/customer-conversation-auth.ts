import {
  ServiceCommerceCustomerActionError,
  StoreConversationError,
  StoreConversationNotificationError,
  StoreConversationWhatsAppBridgeError,
} from "@ewatrade/db/queries"
import { StoreConversationActionHandoffError } from "@ewatrade/service-commerce/server"
import { TRPCError } from "@trpc/server"
import { z } from "zod"

const credentialSchema = z.string().trim().min(32).max(512)
const installationSchema = z.string().trim().min(32).max(191)

export function customerCredential(
  value: string | null | undefined,
  options: { optional: true },
): string | null
export function customerCredential(
  value: string | null | undefined,
  options?: { optional?: false },
): string
export function customerCredential(
  value: string | null | undefined,
  options?: { optional?: boolean },
): string | null {
  if (options?.optional && !value) return null
  const parsed = credentialSchema.safeParse(value)
  if (!parsed.success) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Open the Store link to continue.",
    })
  }
  return parsed.data
}

export function customerInstallation(value: string | null | undefined) {
  const parsed = installationSchema.safeParse(value)
  if (!parsed.success) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "This app installation could not be verified.",
    })
  }
  return parsed.data
}

export function mapCustomerConversationError(error: unknown): never {
  if (error instanceof StoreConversationWhatsAppBridgeError) {
    throw new TRPCError({
      code:
        error.code === "FORBIDDEN"
          ? "FORBIDDEN"
          : error.code === "NOT_FOUND" || error.code === "EXPIRED"
            ? "NOT_FOUND"
            : error.code === "NOT_READY"
              ? "PRECONDITION_FAILED"
              : "CONFLICT",
      message: error.message,
    })
  }
  if (error instanceof StoreConversationActionHandoffError) {
    throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: error.message })
  }
  if (error instanceof StoreConversationNotificationError) {
    throw new TRPCError({
      code:
        error.code === "RATE_LIMITED"
          ? "TOO_MANY_REQUESTS"
          : error.code === "FORBIDDEN"
            ? "FORBIDDEN"
            : error.code === "NOT_FOUND"
              ? "NOT_FOUND"
              : error.code === "NOT_READY"
                ? "PRECONDITION_FAILED"
                : "CONFLICT",
      message: error.message,
    })
  }
  if (error instanceof StoreConversationError) {
    throw new TRPCError({
      code:
        error.code === "GUEST_CREDENTIAL_EXPIRED"
          ? "UNAUTHORIZED"
          : error.code === "FORBIDDEN"
            ? "FORBIDDEN"
            : error.code === "NOT_FOUND"
              ? "NOT_FOUND"
              : error.code === "NOT_READY" || error.code === "STORE_UNAVAILABLE"
                ? "PRECONDITION_FAILED"
                : "CONFLICT",
      message: error.message,
    })
  }
  if (error instanceof ServiceCommerceCustomerActionError) {
    throw new TRPCError({
      code:
        error.code === "ACTION_FORBIDDEN"
          ? "FORBIDDEN"
          : error.code === "ACTION_NOT_FOUND" || error.code === "ACTION_EXPIRED"
            ? "NOT_FOUND"
            : error.code === "ACTION_BLOCKED"
              ? "PRECONDITION_FAILED"
              : "CONFLICT",
      message: error.message,
    })
  }
  throw error
}
