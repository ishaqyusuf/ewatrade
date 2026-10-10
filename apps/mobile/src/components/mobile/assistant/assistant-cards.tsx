import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useLargeTextLayout } from "@/hooks/use-large-text-layout"
import type { ReactNode } from "react"
import { ActionButton } from "../action-button"
import { ListCard, StatusPill } from "../green-till/kit"
export function AssistantAnswerCard({
  title,
  value,
  scope,
  asOf,
  children,
}: {
  title: string
  value: string
  scope: string
  asOf: string
  children?: ReactNode
}) {
  return (
    <ListCard>
      <View className="gap-3 p-3">
        <Text className="text-sm font-bold text-foreground">{title}</Text>
        <Text className="text-2xl font-bold text-foreground">{value}</Text>
        <Text className="text-xs text-muted-foreground">
          {scope} · {asOf}
        </Text>
        {children}
      </View>
    </ListCard>
  )
}
/** Presentation only. A live caller must supply a server-authorized decision command. */
export function ProposalCard({
  title,
  summary,
  state,
  disabled,
  confirmDisabled = false,
  reason,
  onConfirm,
  onEdit,
  onCancel,
}: {
  title: string
  summary: string
  state:
    | "pending"
    | "confirmed"
    | "cancelled"
    | "expired"
    | "failed"
    | "executing"
  disabled: boolean
  confirmDisabled?: boolean
  reason?: string
  onConfirm: () => void
  onEdit: () => void
  onCancel: () => void
}) {
  const large = useLargeTextLayout()
  const actionClass = large ? "w-full" : "min-h-[44px] w-auto px-3"
  return (
    <View className="gap-3 rounded-[18px] border border-gold bg-card p-3">
      <View className="flex-row flex-wrap items-center justify-between gap-2">
        <Text className="text-sm font-bold text-foreground">{title}</Text>
        <StatusPill
          label={
            state === "pending"
              ? "Check and confirm"
              : state === "confirmed"
                ? "Confirmed"
                : state === "expired"
                  ? "Expired"
                  : state === "failed"
                    ? "Needs review"
                    : state === "executing"
                      ? "Checking result"
                      : "Cancelled"
          }
          tone={state === "confirmed" ? "ok" : "muted"}
        />
      </View>
      <Text className="text-sm text-foreground">{summary}</Text>
      {state === "pending" ? (
        <>
          <Text className="text-xs text-muted-foreground">
            {reason ?? "Nothing changes until you confirm."}
          </Text>
          <View className="flex-row flex-wrap gap-2">
            <ActionButton
              className={actionClass}
              disabled={disabled || confirmDisabled}
              onPress={onConfirm}
            >
              Confirm
            </ActionButton>
            <ActionButton
              className={actionClass}
              variant="outline"
              disabled={disabled}
              onPress={onEdit}
            >
              Edit
            </ActionButton>
            <ActionButton
              className={actionClass}
              variant="ghost"
              disabled={disabled}
              onPress={onCancel}
            >
              Cancel
            </ActionButton>
          </View>
        </>
      ) : null}
    </View>
  )
}
export function ResultCard({
  title,
  detail,
  onOpen,
}: { title: string; detail: string; onOpen?: () => void }) {
  return (
    <View className="gap-3 rounded-[18px] bg-tint-mint p-3">
      <Text className="text-sm font-bold text-tint-mint-foreground">
        {title}
      </Text>
      <Text className="text-xs text-tint-mint-foreground">{detail}</Text>
      {onOpen ? (
        <ActionButton variant="outline" onPress={onOpen}>
          Open record
        </ActionButton>
      ) : null}
    </View>
  )
}
export function RefusalCard({
  title,
  reason,
  alternative,
  onAlternative,
}: {
  title: string
  reason: string
  alternative?: string
  onAlternative?: () => void
}) {
  return (
    <View className="gap-3 rounded-[18px] bg-tint-amber p-3">
      <Text className="text-sm font-bold text-tint-amber-foreground">
        {title}
      </Text>
      <Text className="text-xs text-tint-amber-foreground">{reason}</Text>
      {alternative && onAlternative ? (
        <ActionButton variant="outline" onPress={onAlternative}>
          {alternative}
        </ActionButton>
      ) : null}
    </View>
  )
}
