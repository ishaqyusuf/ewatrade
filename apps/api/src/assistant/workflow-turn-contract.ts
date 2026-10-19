/** Transport-neutral refusals; no principal or approval authority is carried here. */
export class WorkflowTurnError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly resetAt?: Date,
  ) {
    super(message)
    this.name = "WorkflowTurnError"
  }
}
