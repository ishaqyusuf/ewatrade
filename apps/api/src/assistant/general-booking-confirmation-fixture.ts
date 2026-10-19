import { Prisma as PrismaValues } from "@ewatrade/db/browser"
import {
  field,
  matches,
} from "../../../../packages/db/src/queries/test-helpers/booking-availability"
import { generalBookingDraftFixture } from "../../../../packages/db/src/queries/test-helpers/general-booking-draft"
import { proposalDigest } from "./proposal-security"

/** Inert persisted-state stand-in. Actual draft/review/native functions run unchanged.
 * No database transaction/SQL isolation or rollback is simulated by these delegates.
 */
export function bookingConfirmationFixture() {
  const base = generalBookingDraftFixture()
  const transitions: unknown[] = []
  const control = {
    loseStatus: "",
    beforeTransition: (_status: string) => {},
    afterTransition: (_status: string) => {},
  }
  const tx = new Proxy(base.canonical.tx, {
    get(target, key) {
      if (key === "assistantConversation") return base.tx.assistantConversation
      if (key === "assistantActionProposal")
        return {
          findFirst: base.tx.assistantActionProposal.findFirst,
          findUnique: base.tx.assistantActionProposal.findUnique,
          create: base.tx.assistantActionProposal.create,
          updateMany: async (args: unknown) => {
            const data = field(args, "data")
            const status = field(data, "status")
            if (typeof status !== "string")
              throw Error("Expected a confirmation status transition")
            transitions.push(structuredClone(args))
            control.beforeTransition(status)
            const where = field(args, "where")
            const row = base.rows.find((candidate) => {
              const jsonKeys = ["payload", "executedResult"]
              const ordinary = Object.fromEntries(
                Object.entries(Object(where)).filter(
                  ([name]) => !jsonKeys.includes(name),
                ),
              )
              if (
                !matches(
                  { ...candidate, conversation: base.conversation },
                  ordinary,
                )
              )
                return false
              return jsonKeys.every((name) => {
                const expected = field(field(where, name), "equals")
                const actual = field(candidate, name)
                return expected === PrismaValues.AnyNull
                  ? actual === null
                  : expected !== undefined &&
                      proposalDigest(expected) === proposalDigest(actual)
              })
            })
            if (!row || status === control.loseStatus) return { count: 0 }
            Object.assign(row, structuredClone(data), {
              updatedAt: new Date(
                Math.max(Date.now(), row.updatedAt.getTime() + 1),
              ),
            })
            control.afterTransition(status)
            return { count: 1 }
          },
        }
      if (key === "$transaction") throw Error("No nested transaction")
      return Reflect.get(target, key)
    },
  })
  const scope = {
    actorUserId: base.scope.actorUserId,
    tenantId: base.scope.tenantId,
    storeId: base.scope.storeId,
  }
  return {
    ...base,
    tx,
    scope,
    conversationScope: base.scope,
    transitions,
    decisions: control,
  }
}
