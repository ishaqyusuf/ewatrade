"use server"

import { isPublicServiceUnavailable } from "@/lib/public-service-errors"
import { prisma } from "@ewatrade/db"
import {
  StoreConversationError,
  submitStorefrontServiceRequest,
} from "@ewatrade/db/queries"
import { storefrontServiceRequestSchema } from "@ewatrade/service-commerce"
import { headers } from "next/headers"

export type StorefrontRequestReceipt = Awaited<
  ReturnType<typeof submitStorefrontServiceRequest>
>
export type StorefrontRequestState =
  | { kind: "idle"; message?: never; fields?: never }
  | { kind: "error"; message: string; fields?: Record<string, string> }
  | { kind: "received"; receipt: StorefrontRequestReceipt }

export async function sendStorefrontServiceRequest(
  _previous: StorefrontRequestState,
  data: FormData,
): Promise<StorefrontRequestState> {
  const input = Object.fromEntries(
    [
      "clientRequestId",
      "formId",
      "itemId",
      "offeringId",
      "quantity",
      "customerName",
      "customerPhone",
      "details",
    ].map((key) => [
      key,
      typeof data.get(key) === "string" ? data.get(key) : "",
    ]),
  )
  let lines: unknown
  const rawLines = data.get("lines")
  if (typeof rawLines === "string" && rawLines) {
    if (rawLines.length > 8192)
      return {
        kind: "error",
        message: "Too many service options. Remove options and try again.",
      }
    try {
      lines = JSON.parse(rawLines)
    } catch {
      return {
        kind: "error",
        message: "Check your selected service options and try again.",
      }
    }
  }
  const parsed = storefrontServiceRequestSchema.safeParse({
    ...input,
    ...(lines !== undefined ? { lines } : {}),
  })
  if (!parsed.success)
    return {
      kind: "error",
      message: "Check the details below and try again.",
      fields: Object.fromEntries(
        parsed.error.issues.map((issue) => [
          String(issue.path[0]),
          issue.message,
        ]),
      ),
    }
  try {
    return {
      kind: "received",
      receipt: await submitStorefrontServiceRequest(
        prisma,
        parsed.data,
        (await headers()).get("host") ?? "",
      ),
    }
  } catch (error) {
    if (
      isPublicServiceUnavailable(error) ||
      error instanceof StoreConversationError
    )
      return {
        kind: "error",
        message:
          "We couldn’t send this request. The service may have changed. Refresh to check availability, or enquire with the business on WhatsApp.",
      }
    throw error
  }
}
