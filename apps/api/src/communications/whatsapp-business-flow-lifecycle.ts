import { prisma } from "@ewatrade/db"
import { runInOwnSerializableTransaction } from "@ewatrade/db/own-transaction"
import { NATIVE_FLOW_KIND } from "../assistant/channel-flow-state"

/** Sender-owned cancellation invalidates unsubmitted forms; no draft or business effect. */
export function cancelWhatsAppBusinessFlows(address: {
  phoneNumberId: string
  senderId: string
}) {
  return runInOwnSerializableTransaction(prisma, async (tx) => {
    await tx.$queryRaw`SELECT id FROM "AssistantWhatsAppIdentity" WHERE "phoneNumberId"=${address.phoneNumberId} AND "senderId"=${address.senderId} FOR UPDATE`
    return tx.onboardingSession.deleteMany({
      where: {
        token: { startsWith: "wa-flow_native_" },
        completed: false,
        AND: [
          { formData: { path: ["kind"], equals: NATIVE_FLOW_KIND } },
          {
            formData: {
              path: ["phoneNumberId"],
              equals: address.phoneNumberId,
            },
          },
          { formData: { path: ["senderId"], equals: address.senderId } },
        ],
      },
    })
  })
}
