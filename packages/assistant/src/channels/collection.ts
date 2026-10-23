import { catalogFreeLineDescriptionError } from "@ewatrade/utils/catalog-free-lines"
import type { SimpleExpense } from "../general/simple-expense"
import type { SimpleMoneyIn } from "../general/simple-money-in"
import type { SimpleSale } from "../general/simple-sale"
import type { SimpleTransfer } from "../general/simple-transfer"

type CollectableDraft =
  | SimpleExpense
  | SimpleMoneyIn
  | SimpleSale
  | SimpleTransfer

/** Rendering only: these existing partial drafts keep their canonical preparation and validation. */
export function whatsAppDraftCollectionReply(draft: CollectableDraft) {
  const missing: string[] = []
  if (draft.action === "sale_record") {
    if (draft.receivedMinor === undefined)
      missing.push("Amount already received for this sale.")
    if (!draft.moneyAccountId && !(draft.createAccount && draft.accountName))
      missing.push(
        draft.accountName
          ? `Choose the receiving account matching “${draft.accountName}”, or say if a new account is needed.`
          : "Receiving account name.",
      )
    if (
      (draft.customerName && !draft.customerId && !draft.customerChoice) ||
      (draft.customerChoice === "new" && !draft.customerName)
    )
      missing.push(
        draft.customerName
          ? `Which customer matches “${draft.customerName}”—an existing customer or a new one?`
          : "Name of the new customer.",
      )
    if (draft.partial && draft.totalMinor === undefined)
      missing.push("Full sale total, including the amount already received.")
    if (
      catalogFreeLineDescriptionError({
        kind: "quick_sale",
        description: draft.description,
      })
    )
      missing.push("What was sold (up to 200 characters).")
  } else {
    if (draft.amountMinor === undefined) missing.push("Amount.")
    if (draft.action === "money_in_record") {
      if (!draft.moneyAccountId && !(draft.createAccount && draft.accountName))
        missing.push(
          draft.accountName
            ? `Choose the account matching “${draft.accountName}”, or say if a new account is needed.`
            : "Account name to record the owner funds in.",
        )
    } else if (draft.action === "money_transfer_simple") {
      if (!draft.fromMoneyAccountId)
        missing.push(
          draft.fromAccountName
            ? `Which existing source account matches “${draft.fromAccountName}”?`
            : "Source account name.",
        )
      if (!draft.toMoneyAccountId && !draft.newToAccount)
        missing.push(
          draft.toAccountName
            ? `Choose the destination matching “${draft.toAccountName}”, or say if a new account is needed.`
            : "Destination account name.",
        )
    } else {
      if (!draft.description) missing.push("What the expense was for.")
      if (draft.paid === undefined)
        missing.push("Whether it has already been paid or is still unpaid.")
      if (draft.paid !== false && !draft.moneyAccountId)
        missing.push(
          draft.accountName
            ? `Which paying account matches “${draft.accountName}”?`
            : `${draft.paid === undefined ? "If already paid, the" : "The"} paying account name.`,
        )
      if (!draft.expenseCategoryId || !draft.bookId)
        missing.push(
          draft.categoryName
            ? `Which expense category matches “${draft.categoryName}”?`
            : "Expense category, if none matches the purpose already supplied.",
        )
    }
  }
  return missing.length
    ? `Send the remaining details together:\n\n${missing.map((question, index) => `${index + 1}. ${question}`).join("\n")}\n\nYou can answer naturally in one message. Optional details can wait.`
    : "Draft ready for review."
}
