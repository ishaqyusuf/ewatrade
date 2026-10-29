/** The existing fresh-read refusals that must erase an earlier private payload. */
export function isRejectedRead(error: unknown) {
  const data =
    error && typeof error === "object" && "data" in error ? error.data : null
  return Boolean(
    data &&
      typeof data === "object" &&
      "code" in data &&
      typeof data.code === "string" &&
      ["FORBIDDEN", "UNAUTHORIZED", "NOT_FOUND"].includes(data.code),
  )
}

/** Keep the observer active for focus/reopen/retry, without repeating a refusal. */
export function readPollInterval(error: unknown, milliseconds: number) {
  return isRejectedRead(error) ? false : milliseconds
}
