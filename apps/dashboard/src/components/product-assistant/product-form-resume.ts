import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import { productHandbackSnapshot } from "@ewatrade/assistant/product/contracts"

type ProductState = RouterOutputs["productAssistant"]["state"]
export type ProductFormVersion = { conversationId: string; revision: number }
export type ProductFormResumeState = Pick<
  ProductState,
  "conversation" | "snapshot" | "running" | "receipt"
> & {
  draft: Pick<ProductState["draft"], "revision"> & {
    entities: Pick<
      ProductState["draft"]["entities"][number],
      "key" | "payload"
    >[]
  }
}

export function productFormStateIsFresh(
  query: {
    isSuccess: boolean
    isError: boolean
    isFetching: boolean
    isPaused: boolean
    isFetchedAfterMount: boolean
  },
  capturedGeneration: number,
  currentGeneration: number,
) {
  return (
    query.isSuccess &&
    !query.isError &&
    !query.isFetching &&
    !query.isPaused &&
    query.isFetchedAfterMount &&
    capturedGeneration === currentGeneration
  )
}

/** Called only after a fresh owned RPC, initially or on explicit Back/reload. */
export function resumeProductForm(
  data: ProductFormResumeState,
  conversationId: string,
  storeId: string,
) {
  if (
    data.conversation.id !== conversationId ||
    data.snapshot.storeId !== storeId
  )
    throw Error("Select the original product chat and Store before continuing.")
  return {
    version: { conversationId, revision: data.draft.revision },
    snapshot: productHandbackSnapshot(
      data.snapshot,
      data.draft.entities.find((entity) => entity.key === "product")?.payload,
    ),
  }
}

/** A refreshed server revision must never bless older, locally edited fields. */
export function productFormExpectedRevision(
  version: ProductFormVersion | null,
  data: ProductFormResumeState | undefined,
  conversationId: string,
  storeId: string,
) {
  if (
    !version ||
    !data ||
    version.conversationId !== conversationId ||
    data.conversation.id !== conversationId ||
    data.snapshot.storeId !== storeId
  )
    throw Error("Wait for this saved product draft to load before continuing.")
  if (
    data.running ||
    data.receipt ||
    data.conversation.status !== "ACTIVE" ||
    data.draft.revision !== version.revision
  )
    throw Error(
      "The saved product draft changed or a reply is running. Your form edits are still here. Review the saved chat or explicitly reload its draft before continuing.",
    )
  return version.revision
}
