// Coordinator diagnostics for the exported pure F04 contract. No database or provider.
import {
  decideBeneficiaryVerification,
  decidePayoutReview,
} from "../../../payments/src/payout-intent"

const input = {
  beneficiary: {
    id: "review-payee",
    version: 1,
    status: "VERIFIED" as const,
    accountName: "QA Payee",
    accountSuffix: "6789",
    bankName: "QA Bank",
    currencyCode: "NGN",
  },
  debitAccount: {
    id: "review-account",
    name: "QA balance",
    currencyCode: "NGN",
  },
  amountMinor: 1000,
  feeMinor: 50,
  currencyCode: "NGN",
  source: { purpose: "supplier_bill", id: "review-bill" },
  actor: { role: "OWNER" },
  payoutsStopped: false,
}
const control = decidePayoutReview(input)
if (!control.ok || control.review.totalDebitMinor !== 1050)
  throw new Error("Valid payout control failed")
const maximum = decidePayoutReview({
  ...input,
  amountMinor: Number.MAX_SAFE_INTEGER,
  feeMinor: 2,
})
console.log(
  JSON.stringify({
    probe: "safe inputs produce an unsafe total",
    result: maximum,
    totalIsSafeInteger:
      maximum.ok && Number.isSafeInteger(maximum.review.totalDebitMinor),
  }),
)
const entered = { bankCode: "058", accountNumber: "0123456789" }
const validPayee = decideBeneficiaryVerification({
  entered,
  resolved: { ...entered, accountName: "QA Payee" },
  confirmedName: "QA Payee",
})
if (!validPayee.ok) throw new Error("Valid payee control failed")
console.log(
  JSON.stringify({
    probe: "empty resolved account name confirmed as empty",
    result: decideBeneficiaryVerification({
      entered,
      resolved: { ...entered, accountName: "" },
      confirmedName: "",
    }),
  }),
)
