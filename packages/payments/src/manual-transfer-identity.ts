import { createHash } from "node:crypto"

export type ManualTransferIdentity = {
  tenantId: string
  currencyCode: string
  receivingAccountId: string
  receivingAccountNumber: string
  namespace: string
  rawReference: string
}

/** Only merchant/bank-validated identifiers enter this function; never OCR/narration. */
export function manualTransferIdentity(input: ManualTransferIdentity) {
  const normalizedReference = input.rawReference.trim()
  if (
    !input.tenantId ||
    input.tenantId.length > 128 ||
    !input.receivingAccountId ||
    input.receivingAccountId.length > 128 ||
    !/^\d{10}$/.test(input.receivingAccountNumber) ||
    !/^[A-Z]{3}$/.test(input.currencyCode) ||
    input.namespace !== "nibss_session_id" ||
    !normalizedReference ||
    normalizedReference.length > 160 ||
    (input.namespace === "nibss_session_id" &&
      !/^\d{30}$/.test(normalizedReference))
  )
    throw new Error("Enter a validated bank transfer identity.")
  // NIBSS session IDs identify one transfer across receiving-account aliases.
  // Bank-local IDs need a canonical bank-code namespace before admission; reject them.
  // The server-validated receiving account number is an audited physical rail fact,
  // deliberately excluded from the NIBSS unique key so changing destination cannot reuse cash.
  const identityDigest = createHash("sha256")
    .update(
      JSON.stringify([
        input.tenantId,
        input.currencyCode,
        input.namespace,
        normalizedReference,
      ]),
    )
    .digest("hex")
  return { ...input, normalizedReference, identityDigest }
}
