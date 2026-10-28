import type { AccountView } from "./customer"
import type { ReceiptView } from "./receipt"

/** Domain-owned routes the storefront app renders inside this template's shell. */
export type StorefrontRoute =
  | { kind: "page" }
  | { kind: "checkout" }
  | { kind: "receipt"; receipt: ReceiptView }
  | { kind: "account"; account: AccountView }
