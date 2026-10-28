import { z } from "zod"
import type { StorefrontOrderLineIssue } from "./orders"
import type { PublicStockState } from "./resources"

/**
 * Host-supplied commerce boundary. The storefront app passes server actions; Studio
 * previews pass `previewCommerceAdapter`, which never writes. Every result is plain
 * serializable data and the server re-derives all authority.
 */
export type CommerceFailure = {
  ok: false
  message: string
  field?: string
  fields?: Record<string, string>
  issues?: StorefrontOrderLineIssue[]
  retryAfterSeconds?: number
}
export type CommerceResult<T = Record<never, never>> =
  | ({ ok: true } & T)
  | CommerceFailure

export type BagCheckLine = {
  offeringId: string
  available: boolean
  priceMinor: number | null
  stock: PublicStockState
  enough: boolean
}

export type StorefrontCommerceAdapter = {
  mode: "live" | "preview"
  checkBag(lines: BagLine[]): Promise<CommerceResult<{ lines: BagCheckLine[] }>>
  submitOrder(input: unknown): Promise<CommerceResult<{ receiptPath: string }>>
  submitService(input: {
    request: unknown
    extras: unknown
  }): Promise<CommerceResult<{ receiptPath: string }>>
  reply(input: {
    token: string
    kind: "order" | "service"
    reply: unknown
  }): Promise<CommerceResult>
  withdraw(input: {
    token: string
    kind: "order" | "service"
    expectedRevision: number
  }): Promise<CommerceResult>
  declineQuote(input: {
    token: string
    versionId: string
    reason: string
    clientMessageId: string
  }): Promise<CommerceResult>
  requestCode(identifier: {
    channel: "email" | "whatsapp"
    identifier: string
  }): Promise<
    CommerceResult<{
      challengeId: string
      destination: string
      resendAfterSeconds: number
      testCode?: string
    }>
  >
  verifyCode(input: {
    challengeId: string
    code: string
  }): Promise<CommerceResult>
  logout(): Promise<CommerceResult>
  linkVerified(): Promise<CommerceResult<{ linked: number }>>
  linkReceipt(token: string): Promise<CommerceResult>
  /** After WhatsApp OTP: open one of the verified number's own requests by reference. */
  findRequest(input: {
    reference: string
  }): Promise<CommerceResult<{ receiptPath: string }>>
}

/** Non-personal bag line. Prices are display hints; the server is authority. */
export const bagLineSchema = z
  .object({
    itemId: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/),
    offeringId: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/),
    quantity: z.string().regex(/^\d{1,4}(?:\.\d{1,6})?$/),
    priceMinor: z.number().int().nonnegative().nullable(),
    currencyCode: z.string().min(3).max(3),
    itemName: z.string().max(160),
    optionName: z.string().max(160),
    unitLabel: z.string().max(40).nullable(),
    scale: z.number().int().min(0).max(6),
    photoUrl: z.string().max(2048).nullable(),
    illustrationId: z.string().max(128),
  })
  .strict()
export type BagLine = z.infer<typeof bagLineSchema>
