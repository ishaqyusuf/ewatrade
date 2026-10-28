/** A scoped server refusal stays a refusal, with its reason and recovery path. */
export function reviewFailure(
  error: { code: string | null; message?: string } | null,
) {
  if (!error) return null
  const text = error.message?.trim() ?? ""
  const plain =
    text.length > 0 &&
    text.length <= 300 &&
    !/:\/\/|www\.|\b(?:bearer|token|secret|api[_ -]?key)\b/i.test(text) &&
    !Array.from(text).some((character) => {
      const code = character.charCodeAt(0)
      return code < 32 || code === 127
    })
  const fallback =
    error.code === "CONFLICT"
      ? "This payment was already reviewed, or it changed while you were checking."
      : error.code === "FORBIDDEN"
        ? "Your current access doesn’t allow this payment review. Recording customer funds also requires an owner or admin with Finance access."
        : "This couldn’t be saved. Try again."
  return {
    message: plain ? text : fallback,
    refresh: error.code === "CONFLICT",
  }
}
