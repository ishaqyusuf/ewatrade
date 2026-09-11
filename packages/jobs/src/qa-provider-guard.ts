import { prisma } from "@ewatrade/db/client"
import {
  type QaLiveEffectOperation,
  evaluateQaProviderPolicy,
} from "@ewatrade/utils/qa-provider-policy"

export async function assertQaJobProviderAllowed(input: {
  adapter?: "live" | "test"
  operation: QaLiveEffectOperation | "email"
  qaEmailRouted?: boolean
  tenantId: string
}) {
  const tenant = await prisma.tenant.findUnique({
    select: { dataClassification: true },
    where: { id: input.tenantId },
  })
  if (!tenant) throw new Error("Tenant not found for provider operation.")

  const decision = evaluateQaProviderPolicy({
    adapter: input.adapter ?? "live",
    operation: input.operation,
    qaEmailRouted: input.qaEmailRouted,
    tenantDataClassification: tenant.dataClassification,
  })
  if (decision.allowed) return decision

  await prisma.qaAccessAuditEvent.create({
    data: {
      eventType: "provider_operation_blocked",
      metadata: { operation: input.operation, source: "job" },
      outcome: decision.code,
    },
  })
  throw Object.assign(new Error(decision.message), { code: decision.code })
}
