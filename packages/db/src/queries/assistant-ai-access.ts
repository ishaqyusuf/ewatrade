export const LIVE_AI_ADULT_REQUIRED = "LIVE_AI_ADULT_REQUIRED"
export const LIVE_AI_ADULT_MESSAGE =
  "Live AI is available to accounts declared 18 or older. You can still use your business tools and saved history."

export class AssistantLiveAiAccessError extends Error {
  readonly code = LIVE_AI_ADULT_REQUIRED

  constructor() {
    super(LIVE_AI_ADULT_MESSAGE)
    this.name = "AssistantLiveAiAccessError"
  }
}

/** Narrow read contract also accepts the canonical Prisma client/transaction. */
type AccountAgeReader = {
  user: {
    findUnique(input: {
      where: { id: string }
      select: { ageBand: true }
    }): PromiseLike<{ ageBand: string | null } | null>
  }
}

/** Current account declaration only; never a client header or queued snapshot. */
export async function requireAdultLiveAiAccount(
  db: AccountAgeReader,
  actorUserId: string,
) {
  if (!actorUserId) throw new AssistantLiveAiAccessError()
  const account = await db.user.findUnique({
    where: { id: actorUserId },
    select: { ageBand: true },
  })
  if (account?.ageBand !== "ADULT") throw new AssistantLiveAiAccessError()
}
