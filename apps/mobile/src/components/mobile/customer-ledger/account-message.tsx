import { ActionButton } from "@/components/mobile/action-button"
import { StatusBanner } from "@/components/mobile/status-banner"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { Textarea } from "@/components/ui/textarea"
import { useOperationalModeStore } from "@/store/operationalModeStore"
import { useTRPC } from "@/trpc/client"
import {
  getCustomerMessageEvent,
  renderCustomerMessageTemplate,
} from "@ewatrade/customer-messages/client"
import { formatFinanceMoney } from "@ewatrade/utils/finance-money"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useState } from "react"
import { Linking, ScrollView, View } from "react-native"

export type AccountMessageKind = "remind" | "summary"
const eventKeys = {
  remind: "customer.balance_reminder",
  summary: "customer.account_summary",
} as const

/** Saved wording when there is some; otherwise the starter wording, filled in. */
function suggestedText(
  eventKey: (typeof eventKeys)[AccountMessageKind],
  saved: string | null,
  variables: Record<string, string | undefined>,
) {
  if (saved) return saved
  try {
    return renderCustomerMessageTemplate(
      eventKey,
      getCustomerMessageEvent(eventKey).starterBody,
      variables,
    )
  } catch {
    return ""
  }
}

/**
 * Workshop Mobile Quality v19, screen 18 v2 direction 01: a balance reminder
 * or account summary for one saved customer. Open WhatsApp only opens a chat
 * with the text ready; EwaTrade sends nothing.
 */
export function AccountMessageScreen({
  accountId,
  initialKind,
}: {
  accountId: string
  initialKind: AccountMessageKind
}) {
  const trpc = useTRPC()
  const client = useQueryClient()
  const offline = useOperationalModeStore((s) => s.isOfflineMode)
  const [kind, setKind] = useState(initialKind)
  const eventKey = eventKeys[kind]
  const query = useQuery(
    trpc.customerLedger.accountMessagePreview.queryOptions(
      { accountId, eventKey },
      { retry: false, enabled: !offline, staleTime: 60_000 },
    ),
  )
  const prepare = useMutation(
    trpc.customerLedger.accountMessageOpen.mutationOptions({ retry: false }),
  )
  const preview = query.data
  const suggested = preview
    ? suggestedText(eventKey, preview.message, preview.variables)
    : ""
  const [text, setText] = useState("")
  const [status, setStatus] = useState<string | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  useEffect(() => {
    setText(suggested)
    setStatus(null)
    setProblem(null)
  }, [suggested])

  if (offline)
    return (
      <StatusBanner tone="warning" message="Reconnect to prepare a message." />
    )
  if (query.isPending)
    return <Text className="px-4">Preparing the message…</Text>
  if (query.isError || !preview)
    return (
      <StatusBanner
        message={query.error?.message ?? "Couldn’t prepare this message."}
        tone="destructive"
        actionLabel="Try again"
        onActionPress={() => void query.refetch()}
      />
    )
  const whole = (value: string) =>
    formatFinanceMoney(value, preview.amounts.currencyCode).replace(/\.00$/, "")
  const paidAhead = BigInt(preview.amounts.availableCreditMinor)
  const blocked =
    preview.state === "no_phone" ||
    preview.state === "invalid_phone" ||
    preview.state === "ineligible"

  async function open() {
    if (!preview || prepare.isPending) return
    setProblem(null)
    setStatus(null)
    try {
      const result = await prepare.mutateAsync({
        accountId,
        eventKey,
        previewVersion: preview.previewVersion,
        body: text,
      })
      if (result.state === "ready" && result.waUrl) {
        await Linking.openURL(result.waUrl).then(
          () =>
            setStatus(
              "WhatsApp opened. It’s sent only when you press Send there.",
            ),
          () =>
            setProblem(
              "WhatsApp couldn’t be opened on this phone. Copy the message instead.",
            ),
        )
        return
      }
      setProblem(
        "What they owe changed since this message was prepared. Check it again; your text is kept.",
      )
      await client.invalidateQueries(
        trpc.customerLedger.accountMessagePreview.pathFilter(),
      )
    } catch (failure) {
      setProblem(
        failure instanceof Error
          ? failure.message
          : "WhatsApp couldn’t be opened.",
      )
    }
  }

  return (
    <ScrollView
      contentContainerStyle={{
        gap: 14,
        paddingBottom: 32,
        paddingHorizontal: 16,
      }}
      keyboardShouldPersistTaps="handled"
    >
      <View
        accessibilityRole="tablist"
        className="flex-row rounded-[14px] bg-card p-1 shadow-sm"
      >
        {(
          [
            ["remind", "Reminder"],
            ["summary", "Summary"],
          ] as const
        ).map(([value, label]) => (
          <Pressable
            key={value}
            accessibilityRole="tab"
            accessibilityState={{ selected: kind === value }}
            className={
              kind === value
                ? "min-h-11 flex-1 items-center justify-center rounded-[11px] bg-accent"
                : "min-h-11 flex-1 items-center justify-center rounded-[11px]"
            }
            haptic
            onPress={() => setKind(value)}
          >
            <Text
              className={
                kind === value
                  ? "text-sm font-bold text-accent-foreground"
                  : "text-sm font-bold text-muted-foreground"
              }
            >
              {label}
            </Text>
          </Pressable>
        ))}
      </View>
      <View>
        <Text className="text-base font-bold text-foreground">
          {preview.recipient.name}
        </Text>
        <Text className="text-sm text-muted-foreground">
          {preview.recipient.phoneDisplay
            ? `WhatsApp ${preview.recipient.phoneDisplay}`
            : "No phone number"}
        </Text>
      </View>
      <View className="flex-row rounded-2xl bg-card px-1 py-2.5 shadow-sm">
        {[
          ["Owes you", whole(preview.amounts.totalOwedMinor)],
          [
            "Owed since",
            preview.amounts.oldestOwedAt
              ? new Date(preview.amounts.oldestOwedAt).toLocaleDateString(
                  "en-GB",
                  { day: "numeric", month: "short" },
                )
              : "—",
          ],
          [
            "Paid ahead",
            whole(paidAhead > BigInt(0) ? paidAhead.toString() : "0"),
          ],
        ].map(([label, value]) => (
          <View key={label} className="flex-1 items-center">
            <Text className="text-xs font-bold text-muted-foreground">
              {label}
            </Text>
            <Text className="text-sm font-bold tabular-nums text-foreground">
              {value}
            </Text>
          </View>
        ))}
      </View>
      {blocked ? (
        <StatusBanner
          message={preview.reason ?? "This message can’t be sent."}
        />
      ) : (
        <View className="gap-1.5">
          <Text className="text-xs font-extrabold text-muted-foreground">
            Message
          </Text>
          <Textarea
            accessibilityLabel="Message"
            editable={!prepare.isPending}
            maxLength={1500}
            onChangeText={setText}
            value={text}
          />
          <Text className="text-xs text-muted-foreground">
            {preview.message
              ? "From your saved wording. Changes here are for this message only."
              : "Starter wording. Save your own in WhatsApp messages settings."}
          </Text>
        </View>
      )}
      {problem ? <StatusBanner message={problem} tone="destructive" /> : null}
      <Text className="text-sm text-muted-foreground">
        {status ??
          "Opens WhatsApp with the message ready. Nothing is sent until you press Send there."}
      </Text>
      <ActionButton
        icon="WhatsApp"
        disabled={
          blocked ||
          !preview.canComposeOneOff ||
          !text.trim() ||
          prepare.isPending
        }
        isLoading={prepare.isPending}
        loadingLabel="Opening WhatsApp"
        onPress={() => void open()}
      >
        Open WhatsApp
      </ActionButton>
    </ScrollView>
  )
}
