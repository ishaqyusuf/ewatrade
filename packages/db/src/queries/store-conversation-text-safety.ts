import {
  StoreConversationTextSafetyError,
  type StoreConversationTextSafetyProvider,
  getConfiguredStoreConversationTextSafetyProvider,
  requireStoreConversationTextSafety,
} from "@ewatrade/service-commerce/server"
import { StoreConversationError } from "./store-conversations-core"

declare const screenedStoreConversationTexts: unique symbol
/** Ephemeral exact-text evidence; never a serialized moderation bypass. */
export type ScreenedStoreConversationTexts = {
  readonly [screenedStoreConversationTexts]: true
}
const screenedTexts = new WeakMap<
  ScreenedStoreConversationTexts,
  ReadonlySet<string>
>()

/** Screen a private snapshot through the configured provider before a transaction. */
export async function prepareStoreConversationTextScreening(
  texts: readonly string[],
) {
  const snapshot = [...texts]
  for (const text of snapshot) await assertStoreConversationTextScreened(text)
  const proof = Object.freeze({}) as ScreenedStoreConversationTexts
  screenedTexts.set(proof, new Set(snapshot))
  return proof
}

/** Validate actual persisted presentation text synchronously, without provider I/O. */
export function assertPreparedStoreConversationTexts(
  proof: ScreenedStoreConversationTexts,
  texts: readonly string[],
) {
  const screened = screenedTexts.get(proof)
  if (!screened || texts.some((text) => !screened.has(text)))
    throw new StoreConversationError(
      "NOT_READY",
      "This quotation presentation requires fresh exact-text safety screening.",
    )
}

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
