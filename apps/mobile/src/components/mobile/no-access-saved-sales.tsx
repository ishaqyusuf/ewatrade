import { ActionButton } from "@/components/mobile/action-button"
import { StatusBanner } from "@/components/mobile/status-banner"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import {
  type RecoverySendResult,
  useOfflineRecovery,
} from "@/hooks/use-offline-recovery"
import { offlineCommandScopeKey } from "@/lib/offline-command-scope"
import { useOfflineCommandStore } from "@/store/offlineCommandStore"
import { useState } from "react"

const shortId = (id: string) => (id.length > 6 ? `…${id.slice(-6)}` : id)

function refused(error: unknown) {
  const code = (error as { data?: { code?: string } } | null)?.data?.code
  return code === "FORBIDDEN" || code === "UNAUTHORIZED"
}

function resultMessage(result: RecoverySendResult) {
  const { outcome } = result
  if (outcome.status === "applied") {
    const parts = [
      result.held ? `${result.held} held for owner review` : null,
      result.approved ? `${result.approved} approved` : null,
      result.rejected ? `${result.rejected} rejected` : null,
    ].filter(Boolean)
    return {
      tone: "success" as const,
      text: parts.length
        ? `${parts.join(" · ")}. Held sales aren't recorded until your owner approves them.`
        : "Sent. Your owner will review them.",
    }
  }
  if (outcome.status === "failed")
    return refused(outcome.error)
      ? {
          tone: "warning" as const,
          text: "These sales can't be sent from this account. They stay saved on this phone; ask your owner to help recover them.",
        }
      : {
          tone: "destructive" as const,
          text: "Couldn't send. Check your connection and try again. Nothing was lost.",
        }
  if (outcome.status === "retired")
    return result.sent
      ? {
          tone: "warning" as const,
          text: "These were sent, but your sign-in changed before the reply arrived, so the result isn't confirmed here. They stay saved on this phone; open this screen again later to check.",
        }
      : {
          tone: "warning" as const,
          text: "Your sign-in changed, so nothing was sent.",
        }
  if (outcome.status === "empty")
    return { tone: "success" as const, text: "Nothing left to send." }
  return null
}

/**
 * For staff whose access was paused or suspended: sales recorded on this
 * phone before that stay saved, and can be sent for owner review one saved
 * partition at a time, only when the person chooses to. Sending grants no
 * business access and nothing is recorded until an owner approves.
 */
export function NoAccessSavedSales() {
  // Re-read partitions whenever the local queue changes.
  useOfflineCommandStore((state) => state.commands)
  const partitions = useOfflineCommandStore.getState().recoveryPartitions()
  const recovery = useOfflineRecovery()
  const [results, setResults] = useState<Record<string, RecoverySendResult>>({})
  if (!partitions.length) return null
  return (
    <View className="gap-3 rounded-[20px] bg-card p-4">
      <Text
        accessibilityRole="header"
        className="text-base font-extrabold text-foreground"
      >
        Sales saved on this phone
      </Text>
      <Text className="text-sm [-rn-line-height:22] text-muted-foreground">
        You recorded these while you still had access. You can send them to your
        owner to review. Nothing is recorded until they approve, and sending
        doesn't give you access again.
      </Text>
      {partitions.map((partition) => {
        const key = offlineCommandScopeKey(partition.scope)
        const result = results[key]
        const message = result ? resultMessage(result) : null
        return (
          <View className="gap-2 border-t border-border pt-3" key={key}>
            <Text className="text-sm font-bold text-foreground">
              {partition.commandCount}{" "}
              {partition.commandCount === 1 ? "sale" : "sales"} · Store{" "}
              {shortId(partition.scope.storeId)}
            </Text>
            {message ? (
              <StatusBanner message={message.text} tone={message.tone} />
            ) : null}
            <ActionButton
              disabled={recovery.sending !== null}
              isLoading={recovery.sending === key}
              loadingLabel="Sending for review"
              onPress={async () => {
                const sent = await recovery.send(key, partition.scope)
                setResults((current) => ({ ...current, [key]: sent }))
              }}
              variant="outline"
            >
              Send to owner for review
            </ActionButton>
          </View>
        )
      })}
    </View>
  )
}
