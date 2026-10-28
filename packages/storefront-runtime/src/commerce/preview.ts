import type {
  CommerceFailure,
  StorefrontCommerceAdapter,
} from "@ewatrade/storefront-contracts/commerce"

const previewFailure: CommerceFailure = {
  ok: false,
  message: "This is a preview. Nothing is sent or saved.",
}
export const previewCommerceAdapter: StorefrontCommerceAdapter = {
  mode: "preview",
  checkBag: async (lines) => ({
    ok: true,
    lines: lines.map((line) => ({
      offeringId: line.offeringId,
      available: true,
      priceMinor: line.priceMinor,
      stock: "unknown",
      enough: true,
    })),
  }),
  submitOrder: async () => previewFailure,
  submitService: async () => previewFailure,
  reply: async () => previewFailure,
  withdraw: async () => previewFailure,
  declineQuote: async () => previewFailure,
  requestCode: async () => previewFailure,
  verifyCode: async () => previewFailure,
  logout: async () => previewFailure,
  linkVerified: async () => previewFailure,
  linkReceipt: async () => previewFailure,
  findRequest: async () => previewFailure,
}
