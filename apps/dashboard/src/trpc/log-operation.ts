/** Missing operation identity fails closed so message content cannot reach logs. */
export function shouldLogDashboardTrpcOperation(
  options: { direction: "up" | "down"; path?: unknown; result?: unknown },
  environment: string | undefined,
) {
  return (
    typeof options.path === "string" &&
    !options.path.startsWith("customerMessages.") &&
    !options.path.startsWith("assistantChannels.") &&
    ![
      "assistant.reviewLink",
      "assistant.decideReviewLink",
      "assistant.editReviewLink",
    ].includes(options.path) &&
    (environment === "development" ||
      (options.direction === "down" && options.result instanceof Error))
  )
}
