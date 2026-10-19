import {
  productCreationReady,
  productWorkflowContextSchema,
} from "@ewatrade/assistant/product/contracts"
import { setupProductPayloadSchema } from "@ewatrade/assistant/setup/contracts"
import type {
  AssistantScope,
  commitProductConversation,
} from "@ewatrade/db/assistant"
import { TRPCError } from "@trpc/server"
import { catalogCommandForSetupEntity } from "./setup-commit"

type Entity = Parameters<Parameters<typeof commitProductConversation>[3]>[0]
/** Canonical app and channel product preparation share exactly the same snapshot semantics. */
export function catalogCommandForProductConversation(
  scope: AssistantScope,
  entity: Entity,
  context: unknown,
) {
  const snapshot = productWorkflowContextSchema.parse(context).snapshot
  if (!productCreationReady(entity.payload, snapshot))
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        "Finish the missing details or use Back to form to create this product.",
    })
  const payload = setupProductPayloadSchema.parse(entity.payload)
  const command = catalogCommandForSetupEntity(entity.id, payload, {
    tenantId: scope.tenantId,
    storeId: scope.storeId,
    actorUserId: scope.userId,
  })
  return {
    ...command,
    category: command.category ?? (snapshot.category || undefined),
    ...(snapshot.photoAssetIds.length
      ? { photoAssetIds: snapshot.photoAssetIds, illustrationId: undefined }
      : { illustrationId: snapshot.illustrationId ?? command.illustrationId }),
  }
}
