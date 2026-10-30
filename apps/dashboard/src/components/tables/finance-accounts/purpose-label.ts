/** Plain label for a money account's purpose; Overview and the accounts table share it. */
export function moneyAccountPurposeLabel(purpose: string, mobileMoney = false) {
  return purpose === "CLEARING"
    ? "Card and POS money on its way"
    : purpose === "CASH"
      ? "Cash"
      : mobileMoney
        ? "Mobile money"
        : "Bank"
}
