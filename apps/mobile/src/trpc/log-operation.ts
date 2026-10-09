/** Missing operation paths fail closed so authentication data never reaches logs. */
export function shouldLogMobileTrpcOperation(
  options: { direction: "up" | "down"; path?: unknown; result?: unknown },
  environment: string | undefined,
) {
  return (
    typeof options.path === "string" &&
    !options.path.startsWith("auth.") &&
    (environment === "development" ||
      (options.direction === "down" && options.result instanceof Error))
  )
}
