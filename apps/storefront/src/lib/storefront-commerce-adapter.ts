import {
  checkStorefrontBag,
  declineStorefrontQuote,
  linkStorefrontReceipt,
  linkVerifiedStorefrontHistory,
  logoutStorefrontCustomer,
  replyToStorefrontRequest,
  requestStorefrontLoginCode,
  submitStorefrontOrder,
  submitStorefrontService,
  verifyStorefrontLoginCode,
  withdrawStorefrontRequest,
} from "@/app/storefront-commerce-actions"
import type { StorefrontCommerceAdapter } from "@ewatrade/storefront-templates/commerce-studio"

/** Server actions only; each re-derives Host scope and session before any effect. */
export const commerceAdapter = {
  mode: "live",
  checkBag: checkStorefrontBag,
  submitOrder: submitStorefrontOrder,
  submitService: submitStorefrontService,
  reply: replyToStorefrontRequest,
  withdraw: withdrawStorefrontRequest,
  declineQuote: declineStorefrontQuote,
  requestCode: requestStorefrontLoginCode,
  verifyCode: verifyStorefrontLoginCode,
  logout: logoutStorefrontCustomer,
  linkVerified: linkVerifiedStorefrontHistory,
  linkReceipt: linkStorefrontReceipt,
} as unknown as StorefrontCommerceAdapter
