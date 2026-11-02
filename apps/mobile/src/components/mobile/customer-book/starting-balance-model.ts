import { parseFinanceMoney } from "@ewatrade/utils/finance-money"

export type StartingBalanceChoice = "none" | "owes" | "credit"

/** A positive amount in minor units, or the words to fix it. */
export function startingBalanceMinor(
  choice: StartingBalanceChoice,
  amount: string,
): { minor: string | null; error?: string } {
  if (choice === "none") return { minor: null }
  try {
    return { minor: parseFinanceMoney(amount.replace(/,/g, "")) }
  } catch {
    return {
      minor: null,
      error:
        choice === "owes"
          ? "Enter how much they owe, like 5000."
          : "Enter how much they paid ahead, like 5000.",
    }
  }
}
