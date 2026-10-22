type TokenAllowance = { remainingTokens: number; resetsAt: string }

/** GENERAL admission depends only on tokens; reply counters are usage metadata. */
export function generalTokenBudgetUsed(
  allowance: Pick<TokenAllowance, "remainingTokens">,
) {
  return allowance.remainingTokens <= 0
}

export function generalTokenBudgetLine(allowance: TokenAllowance) {
  const resets = new Date(allowance.resetsAt).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  })
  return generalTokenBudgetUsed(allowance)
    ? `Token budget used · resets ${resets}`
    : `${allowance.remainingTokens.toLocaleString()} tokens left · no reply cap · resets ${resets}`
}
