type TokenAllowance = {
  remainingTokens: number
  tokenLimit?: number
  resetsAt: string
}

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
    timeZone: "UTC",
  })
  const remaining = allowance.remainingTokens.toLocaleString()
  // Old saved snapshots have no ceiling. Never invent one on the client.
  const balance =
    allowance.tokenLimit === undefined
      ? remaining
      : `${remaining} of ${allowance.tokenLimit.toLocaleString()}`
  return generalTokenBudgetUsed(allowance)
    ? `Token budget used · resets ${resets} (UTC)`
    : `${balance} tokens left · no reply cap · resets ${resets} (UTC)`
}
