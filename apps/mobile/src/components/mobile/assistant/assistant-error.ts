export function assistantError(
  error: unknown,
  purpose: "SETUP" | "GENERAL" = "SETUP",
) {
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
    message:
      purpose === "GENERAL"
        ? allowance
          ? "This month's assistant allowance is used up. You can still review and confirm saved drafts."
          : code === "REQUEST_REPLAYED"
            ? "That message was already sent. Check reply status and refresh the thread."
            : "This action could not finish. Check your saved thread and refresh before trying again."
        : allowance
          ? "You’ve used this business’s setup assistant allowance. Your setup list is still here to review and finish."
          : code === "REQUEST_REPLAYED"
            ? "That message was already sent. Refresh to see the reply."
            : "Not sent. Your setup list is safe. Try again or add it yourself.",
  }
}
