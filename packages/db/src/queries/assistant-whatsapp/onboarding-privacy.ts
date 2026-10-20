import type { Prisma } from "../../../generated/prisma/client"

/** Private, ephemeral WhatsApp proof/dialogue records only; unrelated Store setup survives. */
export function assistantWhatsAppOnboardingPrivateWhere(
  userId: string,
): Prisma.OnboardingSessionWhereInput {
  return {
    userId,
    OR: ["wa-flow_", "wa-receipt_", "wa-proof_", "wa-app-link_"].map(
      (prefix) => ({ token: { startsWith: prefix } }),
    ),
  }
}
