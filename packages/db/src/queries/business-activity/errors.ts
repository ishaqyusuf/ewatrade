export class BusinessActivityError extends Error {
  constructor(
    readonly code: "FORBIDDEN" | "NOT_FOUND" | "BAD_REQUEST" | "CONFLICT",
    message: string,
  ) {
    super(message)
    this.name = "BusinessActivityError"
  }
}
