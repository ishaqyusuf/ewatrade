"use client"
import { SettingsChoice } from "@/components/settings/settings-choice"
import { useSettingsAutosave } from "@/components/settings/use-settings-autosave"
import { useTRPC } from "@/trpc/client"
import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import { Button, toast } from "@ewatrade/ui"
import { useMutation, useQueryClient } from "@tanstack/react-query"

import {
  CONVERSATION_MODE_OPTIONS,
  type ConversationMode,
  conversationModeLabel,
} from "./channel-settings-labels"

type ConversationModeSettings =
  RouterOutputs["serviceCommerce"]["storeConversationChannelModeSettings"]

// The server keeps a reason for every change; settings pages save without asking.
const CHANGE_REASON = "Changed how customers reach the store in Settings"
const SAVED_KEY = "conversation-mode"

/** "How customers reach {store}": saves the moment the owner picks a mode. */
export function ConversationModeChoice({
  onShowDetails,
  settings,
  storeId,
}: {
  onShowDetails: () => void
  settings: ConversationModeSettings
  storeId: string
}) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const autosave = useSettingsAutosave()
  const updateMode = useMutation(
    trpc.serviceCommerce.updateStoreConversationChannelMode.mutationOptions({
      onSettled: () =>
        Promise.all([
          queryClient.invalidateQueries({
            queryKey:
              trpc.serviceCommerce.storeConversationChannelModeSettings.queryKey(
                { storeId },
              ),
          }),
          queryClient.invalidateQueries({
            queryKey: trpc.serviceCommerce.channelWorkspace.queryKey({
              storeId,
            }),
          }),
        ]),
    }),
  )

  const save = (
    desiredMode: ConversationMode,
    expectedRevision: number,
    previous?: ConversationMode,
  ) =>
    updateMode.mutate(
      {
        clientOperationId: crypto.randomUUID(),
        desiredMode,
        expectedRevision,
        reason: CHANGE_REASON,
        storeId,
      },
      {
        onError: (error) =>
          toast.error(
            error.data?.code === "CONFLICT"
              ? "This setting changed somewhere else. Refresh and try again."
              : error.message,
          ),
        onSuccess: (result) => {
          if (!previous) {
            toast("Change undone.")
            return
          }
          autosave.confirm(SAVED_KEY, "Saved.", () =>
            save(previous, result.revision),
          )
        },
      },
    )

  const shown = updateMode.isPending
    ? updateMode.variables.desiredMode
    : settings.desiredMode
  const effectiveDiffers =
    !updateMode.isPending && settings.effectiveMode !== settings.desiredMode

  return (
    <>
      <SettingsChoice<ConversationMode>
        disabled={updateMode.isPending}
        label="Customers can message you on"
        onChange={(value) =>
          save(value, settings.revision, settings.desiredMode)
        }
        options={CONVERSATION_MODE_OPTIONS}
        saved={autosave.saved(SAVED_KEY)}
        value={shown}
      />
      {effectiveDiffers ? (
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3">
          <p className="min-w-0 flex-[1_1_220px] text-sm text-muted-foreground">
            {settings.effectiveMode === "unavailable"
              ? "Customers can't message you yet because nothing is ready."
              : `Right now customers can only message you on ${conversationModeLabel(settings.effectiveMode)}.`}
          </p>
          <Button onClick={onShowDetails} size="sm" variant="outline">
            See why
          </Button>
        </div>
      ) : null}
    </>
  )
}
