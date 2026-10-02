import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto"
import { assertPrivateObjectServer } from "./object-storage"

export const EXPENSE_RECEIPT_DOWNLOAD_PURPOSE =
  "FINANCE_EXPENSE_RECEIPT_DOWNLOAD"
export const EXPENSE_RECEIPT_DOWNLOAD_VERSION = 1

export class ExpenseReceiptDownloadTokenError extends Error {
  constructor(
    readonly code:
      | "DOWNLOAD_NOT_CONFIGURED"
      | "INVALID_DOWNLOAD_TOKEN"
      | "INVALID_DOWNLOAD_SESSION",
  ) {
    super(
      code === "DOWNLOAD_NOT_CONFIGURED"
        ? "Private receipt download is not configured."
        : "Private receipt download authorization is invalid.",
    )
    this.name = "ExpenseReceiptDownloadTokenError"
  }
}

function nonceDigest(nonce: string) {
  return createHash("sha256").update(nonce, "utf8").digest("hex")
}

/** Current authenticated session ID only; never a public input or raw bearer token. */
export function expenseReceiptDownloadSessionDigest(sessionId: string) {
  assertPrivateObjectServer()
  if (
    typeof sessionId !== "string" ||
    !/^[a-zA-Z0-9_-]{1,256}$/.test(sessionId)
  )
    throw new ExpenseReceiptDownloadTokenError("INVALID_DOWNLOAD_SESSION")
  return createHash("sha256")
    .update(`${EXPENSE_RECEIPT_DOWNLOAD_PURPOSE}\n${sessionId}`, "utf8")
    .digest("hex")
}

/** Signature boundary only. Expiry, actor/session, source and one-use checks belong to persisted grants. */
export function createExpenseReceiptDownloadTokenCodec(secret: unknown) {
  assertPrivateObjectServer()
  if (typeof secret !== "string" || !/^[!-~]{32,1024}$/.test(secret))
    throw new ExpenseReceiptDownloadTokenError("DOWNLOAD_NOT_CONFIGURED")
  const key = Buffer.from(secret, "utf8")

  function signature(nonce: string) {
    return createHmac("sha256", key)
      .update(
        `${EXPENSE_RECEIPT_DOWNLOAD_PURPOSE}\nv${EXPENSE_RECEIPT_DOWNLOAD_VERSION}\n${nonce}`,
        "utf8",
      )
      .digest()
  }

  return {
    issue() {
      assertPrivateObjectServer()
      const nonce = randomBytes(32).toString("hex")
      return {
        token: `v1.${nonce}.${signature(nonce).toString("hex")}`,
        nonceDigest: nonceDigest(nonce),
        purpose: EXPENSE_RECEIPT_DOWNLOAD_PURPOSE,
        version: EXPENSE_RECEIPT_DOWNLOAD_VERSION,
      }
    },
    verifySignature(token: unknown) {
      assertPrivateObjectServer()
      const parsed =
        typeof token === "string" && token.length === 132
          ? /^v1\.([a-f0-9]{64})\.([a-f0-9]{64})$/.exec(token)
          : null
      if (!parsed || !parsed[1] || !parsed[2])
        throw new ExpenseReceiptDownloadTokenError("INVALID_DOWNLOAD_TOKEN")
      const expected = signature(parsed[1])
      const supplied = Buffer.from(parsed[2], "hex")
      if (!timingSafeEqual(expected, supplied))
        throw new ExpenseReceiptDownloadTokenError("INVALID_DOWNLOAD_TOKEN")
      return {
        nonceDigest: nonceDigest(parsed[1]),
        purpose: EXPENSE_RECEIPT_DOWNLOAD_PURPOSE,
        version: EXPENSE_RECEIPT_DOWNLOAD_VERSION,
      }
    },
  }
}
