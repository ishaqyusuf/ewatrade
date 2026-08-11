"use server"

import { createHash } from "node:crypto"

import { trpc } from "@/trpc/server"

export type CustomerActionState =
  | { kind: "idle"; message: null }
  | { href: string | null; kind: "completed"; message: string }
  | { kind: "error"; message: string }

function operationId(token: string) {
  return `customer-action:${createHash("sha256").update(token).digest("hex")}`
}

function quoteHref(sourceKind: string, token: string) {
  if (sourceKind === "prescription") {
    return `/prescription-quote/${encodeURIComponent(token)}`
  }
  if (sourceKind === "commerce_inquiry") {
    return `/commerce-inquiry-quote/${encodeURIComponent(token)}`
  }
  return `/service-quote/${encodeURIComponent(token)}`
}

export async function submitCustomerAction(
  _previous: CustomerActionState,
  data: FormData,
): Promise<CustomerActionState> {
  const capabilityToken = String(data.get("capabilityToken") ?? "").trim()
  const confirmed = String(data.get("confirmed") ?? "") === "yes"
  if (!capabilityToken) {
    return { kind: "error", message: "This customer action is unavailable." }
  }
  try {
    const result = await trpc.serviceCommerce.executeCustomerAction.mutate({
      capabilityToken,
      clientOperationId: operationId(capabilityToken),
      confirmed,
    })
    const href =
      result.kind === "booking"
        ? `/booking/${encodeURIComponent(capabilityToken)}`
        : result.kind === "support"
          ? `/r/${encodeURIComponent(capabilityToken)}`
          : result.kind === "request_recorded"
            ? null
            : quoteHref(result.sourceKind, capabilityToken)
    return {
      href,
      kind: "completed",
      message:
        result.kind === "request_recorded"
          ? "Your quotation request was recorded. The business can now review it."
          : "This action is current. Continue to the next secure step.",
    }
  } catch {
    return {
      kind: "error",
      message:
        "This action is no longer current. Ask the business for an updated link.",
    }
  }
}
