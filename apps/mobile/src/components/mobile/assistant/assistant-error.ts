export function assistantError(error: unknown) {
  let code = "UNKNOWN"
  if (error instanceof Error) {
    try {
      const data = JSON.parse(error.message)
      if (typeof data.code === "string") code = data.code
    } catch {}
  }
  const allowance = code === "BUDGET_EXHAUSTED"
  return {
    allowance,
    replay: code === "REQUEST_REPLAYED",
    message: allowance
      ? "You’ve used this business’s setup assistant allowance. Your setup list is still here to review and finish."
      : code === "REQUEST_REPLAYED"
        ? "That message was already sent. Refresh to see the reply."
        : "Not sent. Your setup list is safe. Try again or add it yourself.",
  }
}
