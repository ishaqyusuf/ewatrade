import { ASSISTANT_RUNTIME_CONFIGURATION_KEY } from "@ewatrade/ai/runtime-config"
import type { SetupDraftEntityWrite } from "@ewatrade/assistant/setup/tools"
import {
  type AssistantScope,
  beginAssistantRun,
  completeAssistantRun,
  isSetupActorStillAuthorized,
  listAssistantMessages,
  readAssistantConversation,
  readAssistantRun,
  readSetupDraft,
  removeSetupDraftEntities,
  reserveAssistantBudget,
  upsertSetupDraftEntities,
} from "@ewatrade/db/assistant"
import {
  listAssistantAttachments,
  readAssistantAttachmentsForConversation,
} from "@ewatrade/db/assistant-attachments"
import type { TRPCContext } from "../trpc/init"
import { loadSetupBusinessContext } from "./setup-context"

type Db = TRPCContext["db"]
type Tail<T extends unknown[]> = T extends [unknown, ...infer Rest] ? Rest : []
type Bound<F extends (...args: never[]) => unknown> = (
  ...args: Tail<Parameters<F>>
) => ReturnType<F>

/**
 * Everything the chat route reads or writes, bound to one database client and
 * the scope admitted for this request. Tests replace it with an in-memory fake.
 */
export type AssistantChatRepository = {
  readConversation: (
    conversationId: string,
  ) => ReturnType<typeof readAssistantConversation>
  beginRun: Bound<typeof beginAssistantRun>
  reserveBudget: Bound<typeof reserveAssistantBudget>
  completeRun: Bound<typeof completeAssistantRun>
  listMessages: Bound<typeof listAssistantMessages>
  readDraftEntities: (
    draftId: string,
  ) => Promise<Awaited<ReturnType<typeof readSetupDraft>>["entities"]>
  writeDraftEntities: (
    draftId: string,
    entities: SetupDraftEntityWrite[],
  ) => ReturnType<typeof upsertSetupDraftEntities>
  removeDraftEntities: (
    draftId: string,
    keys: string[],
  ) => ReturnType<typeof removeSetupDraftEntities>
  loadBusinessContext: () => ReturnType<typeof loadSetupBusinessContext>
  isActorStillAuthorized: (conversationId: string) => Promise<boolean>
  readRuntimeConfiguration: () => Promise<unknown>
  readRun: (runId: string) => ReturnType<typeof readAssistantRun>
  /** The actor's own attachments they are about to send. */
  readAttachmentsToSend: (
    attachmentIds: string[],
  ) => ReturnType<typeof listAssistantAttachments>
  /** Attachments already sent in this conversation, for model history. */
  readSentAttachments: (
    conversationId: string,
    attachmentIds: string[],
  ) => ReturnType<typeof readAssistantAttachmentsForConversation>
}

export function createAssistantChatRepository(
  db: Db,
  scope: AssistantScope,
): AssistantChatRepository {
  return {
    readConversation: (conversationId) =>
      readAssistantConversation(db, scope, conversationId),
    beginRun: (input) => beginAssistantRun(db, input),
    reserveBudget: (input) => reserveAssistantBudget(db, input),
    completeRun: (input) => completeAssistantRun(db, input),
    listMessages: (conversationId, options) =>
      listAssistantMessages(db, conversationId, options),
    readDraftEntities: async (draftId) =>
      (await readSetupDraft(db, draftId)).entities,
    writeDraftEntities: (draftId, entities) =>
      upsertSetupDraftEntities(db, { draftId, entities }),
    removeDraftEntities: (draftId, keys) =>
      removeSetupDraftEntities(db, { draftId, keys }),
    loadBusinessContext: () => loadSetupBusinessContext(db, scope),
    isActorStillAuthorized: (conversationId) =>
      isSetupActorStillAuthorized(db, scope, conversationId),
    readRuntimeConfiguration: async () =>
      (
        await db.systemConfiguration.findUnique({
          where: { key: ASSISTANT_RUNTIME_CONFIGURATION_KEY },
          select: { value: true },
        })
      )?.value,
    readRun: (runId) => readAssistantRun(db, scope, runId),
    readAttachmentsToSend: (attachmentIds) =>
      listAssistantAttachments(db, scope, attachmentIds),
    readSentAttachments: (conversationId, attachmentIds) =>
      readAssistantAttachmentsForConversation(db, {
        conversationId,
        attachmentIds,
      }),
  }
}
