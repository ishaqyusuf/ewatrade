import {
  StoreConversationTextSafetyError,
  type StoreConversationTextSafetyProvider,
  getConfiguredStoreConversationTextSafetyProvider,
  requireStoreConversationTextSafety,
} from "@ewatrade/service-commerce/server"
import { StoreConversationError } from "./store-conversations-core"

/** Shared write boundary for API, Storefront and provider-ingested text. */
export async function assertStoreConversationTextScreened(
  text: string,
  provider: StoreConversationTextSafetyProvider | null = getConfiguredStoreConversationTextSafetyProvider(),
) {
  try {
    await requireStoreConversationTextSafety(text, provider)
  } catch (error) {
    if (error instanceof StoreConversationTextSafetyError)
      throw new StoreConversationError("NOT_READY", error.message)
    throw error
  }
}
