import type { FinancePurchaseRecognitionStage } from "../../../generated/prisma/enums"
import { FinanceError } from "./rules"

export const PURCHASE_RECOGNITION_CONTROLS = {
  "1300": { kind: "ASSET", purpose: "INVENTORY", name: "Inventory" },
  "1310": {
    kind: "ASSET",
    purpose: "INVENTORY",
    name: "Owned goods in transit",
  },
  "1340": {
    kind: "ASSET",
    purpose: "OTHER",
    name: "Billed goods awaiting ownership",
  },
  "2000": { kind: "LIABILITY", purpose: "PAYABLE", name: "Supplier payable" },
  "2050": {
    kind: "LIABILITY",
    purpose: "OTHER",
    name: "Owned goods awaiting invoice",
  },
} as const

export type PurchaseRecognitionControlCode =
  keyof typeof PURCHASE_RECOGNITION_CONTROLS

export function purchaseRecognitionPosting(
  stage: FinancePurchaseRecognitionStage,
  prior: ReadonlySet<FinancePurchaseRecognitionStage>,
): {
  debit: PurchaseRecognitionControlCode
  credit: PurchaseRecognitionControlCode
} {
  if (prior.has(stage)) {
    throw new FinanceError(
      "CONFLICT",
      "This purchase fact has already been recognized.",
    )
  }
  if (stage === "INVOICE") {
    return {
      debit: prior.has("OWNERSHIP") || prior.has("RECEIPT") ? "2050" : "1340",
      credit: "2000",
    }
  }
  if (stage === "OWNERSHIP") {
    if (prior.has("RECEIPT")) {
      throw new FinanceError(
        "CONFLICT",
        "Received owned goods cannot be recognized in transit.",
      )
    }
    return { debit: "1310", credit: prior.has("INVOICE") ? "1340" : "2050" }
  }
  if (stage !== "RECEIPT") {
    throw new FinanceError(
      "INVALID_JOURNAL",
      "Choose a supported purchase fact.",
    )
  }
  return {
    debit: "1300",
    credit: prior.has("OWNERSHIP")
      ? "1310"
      : prior.has("INVOICE")
        ? "1340"
        : "2050",
  }
}

export function assertPurchaseRecognitionReversal(
  stage: FinancePurchaseRecognitionStage,
  sequence: bigint,
  activeSequences: bigint[],
) {
  if (stage === "RECEIPT") {
    throw new FinanceError(
      "CONFLICT",
      "Physical receipt corrections require the supplier return and credit source.",
    )
  }
  if (activeSequences.some((candidate) => candidate > sequence)) {
    throw new FinanceError(
      "CONFLICT",
      "Correct the dependent purchase fact first.",
    )
  }
}

export function purchaseRecognitionText(
  value: string,
  label: string,
  maximum: number,
) {
  if (typeof value !== "string" || !value.trim() || value.length > maximum) {
    throw new FinanceError("INVALID_JOURNAL", `Enter a valid ${label}.`)
  }
  return value.trim()
}
