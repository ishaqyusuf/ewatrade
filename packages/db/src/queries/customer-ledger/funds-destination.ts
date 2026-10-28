import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
} from "node:crypto"
import { FinanceError } from "../finance/rules"

export type CustomerRefundDestination = {
  bankCode?: string
  /** Human bank label for manual returns; never inferred into a routing code. */
  bankName?: string
  accountNumber: string
  accountName: string
}
export type FundsDestinationScope = {
  tenantId: string
  accountId: string
  creditEntryId: string
}

function keyFromSecret(secret: string) {
  const key = Buffer.from(secret, "base64")
  if (key.length !== 32 || key.toString("base64") !== secret)
    throw new FinanceError(
      "FORBIDDEN",
      "Customer refund destination encryption is not configured.",
    )
  return key
}
function associatedData(scope: FundsDestinationScope) {
  return Buffer.from(
    JSON.stringify([
      "customer-refund-destination:v1",
      scope.tenantId,
      scope.accountId,
      scope.creditEntryId,
    ]),
  )
}
export function validateCustomerRefundDestination(
  value: CustomerRefundDestination,
) {
  const bankCode = value.bankCode?.trim() || undefined
  const bankName = value.bankName?.trim() || undefined
  // Keep legacy code-only JSON key order/shape exactly, including its fingerprint.
  const destination = {
    ...(bankCode ? { bankCode } : {}),
    ...(bankName ? { bankName } : {}),
    accountNumber: value.accountNumber.trim(),
    accountName: value.accountName.trim(),
  }
  if (
    (!bankCode && !bankName) ||
    (bankCode !== undefined && !/^[A-Za-z0-9_-]{1,32}$/.test(bankCode)) ||
    (bankName !== undefined &&
      (bankName.length < 2 ||
        bankName.length > 120 ||
        Array.from(bankName).some(
          (character) =>
            character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
        ))) ||
    !/^[A-Za-z0-9]{6,34}$/.test(destination.accountNumber) ||
    destination.accountName.length < 2 ||
    destination.accountName.length > 160 ||
    Array.from(destination.accountName).some(
      (character) =>
        character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
    )
  )
    throw new FinanceError(
      "INVALID_JOURNAL",
      "Enter a valid bank, account number and account name.",
    )
  return destination
}

/** Dedicated server key; source-bound AEAD prevents copying destinations across customers. */
export function encryptCustomerRefundDestination(
  value: CustomerRefundDestination,
  scope: FundsDestinationScope,
  secret: string,
) {
  const key = keyFromSecret(secret)
  const destination = validateCustomerRefundDestination(value)
  const aad = associatedData(scope)
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", key, iv)
  cipher.setAAD(aad)
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(destination), "utf8"),
    cipher.final(),
  ])
  return {
    destinationCiphertext: [
      "v1",
      iv.toString("base64url"),
      cipher.getAuthTag().toString("base64url"),
      encrypted.toString("base64url"),
    ].join("."),
    destinationFingerprint: createHmac("sha256", key)
      .update(aad)
      .update(JSON.stringify(destination))
      .digest("hex"),
  }
}

/** Only authorized finance detail reads may call this; never include its result in public data. */
export function decryptCustomerRefundDestination(
  envelope: string,
  scope: FundsDestinationScope,
  secret: string,
): CustomerRefundDestination {
  try {
    const key = keyFromSecret(secret)
    const [version, nonce, tag, encrypted, extra] = envelope.split(".")
    if (
      version !== "v1" ||
      !nonce ||
      !tag ||
      !encrypted ||
      extra ||
      envelope.length > 2048
    )
      throw new Error("Invalid envelope")
    const iv = Buffer.from(nonce, "base64url")
    const authTag = Buffer.from(tag, "base64url")
    if (iv.length !== 12 || authTag.length !== 16)
      throw new Error("Invalid envelope")
    const decipher = createDecipheriv("aes-256-gcm", key, iv)
    decipher.setAAD(associatedData(scope))
    decipher.setAuthTag(authTag)
    const value: unknown = JSON.parse(
      Buffer.concat([
        decipher.update(Buffer.from(encrypted, "base64url")),
        decipher.final(),
      ]).toString("utf8"),
    )
    if (
      !value ||
      typeof value !== "object" ||
      ("bankCode" in value && typeof value.bankCode !== "string") ||
      ("bankName" in value && typeof value.bankName !== "string") ||
      !("accountNumber" in value) ||
      typeof value.accountNumber !== "string" ||
      !("accountName" in value) ||
      typeof value.accountName !== "string"
    )
      throw new Error("Invalid destination")
    return validateCustomerRefundDestination({
      ...("bankCode" in value && typeof value.bankCode === "string"
        ? { bankCode: value.bankCode }
        : {}),
      ...("bankName" in value && typeof value.bankName === "string"
        ? { bankName: value.bankName }
        : {}),
      accountNumber: value.accountNumber,
      accountName: value.accountName,
    })
  } catch {
    throw new FinanceError(
      "CONFLICT",
      "The saved refund destination cannot be verified. Review its details again.",
    )
  }
}
