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
      <View className="gap-2 py-3">
        <View className="gap-0.5">
          <Text className="text-base [-rn-line-height:22] font-bold text-foreground">
            {title}
          </Text>
          <Text className="text-base [-rn-line-height:22] text-muted-foreground">
            {scope}
          </Text>
        </View>
        <Text className="text-2xl font-extrabold tracking-tight text-foreground">
          {value}
        </Text>
        {children}
        <Text className="text-base [-rn-line-height:22] text-muted-foreground">
          {asOf}
        </Text>
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
  media,
}: {
  title: string
  summary: string
  /** A picture beside the summary, e.g. a product draft's photo. */
  media?: ReactNode
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
        <Text className="text-base [-rn-line-height:22] font-bold text-foreground">
          {title}
        </Text>
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
      {summary || media ? (
        <View className="flex-row gap-3">
          {media}
          {summary ? (
            <Text className="flex-1 text-base [-rn-line-height:22] text-foreground">
              {summary}
            </Text>
          ) : null}
        </View>
      ) : null}
      {state === "pending" ? (
        <>
          <Text className="text-base [-rn-line-height:22] text-muted-foreground">
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
  media,
  unavailable,
  onOpen,
}: {
  title: string
  detail: string
  /** A photo of what was saved, beside the text. */
  media?: ReactNode
  /** Why the saved record has no native screen; replaces Open. */
  unavailable?: string
  onOpen?: () => void
}) {
  return (
    <View className="gap-3 rounded-[18px] bg-tint-mint p-3">
      <View className="flex-row items-center gap-3">
        {media}
        <View className="min-w-0 flex-1 gap-1">
          <Text className="text-base [-rn-line-height:22] font-bold text-tint-mint-foreground">
            {title}
          </Text>
          <Text className="text-base [-rn-line-height:22] text-tint-mint-foreground">
            {detail}
          </Text>
        </View>
      </View>
      {unavailable ? (
        <Text className="text-base [-rn-line-height:22] text-tint-mint-foreground">
          {unavailable}
        </Text>
      ) : onOpen ? (
        <ActionButton variant="outline" onPress={onOpen}>
          Open record
        </ActionButton>
      ) : null}
    </View>
  )
}
/** A saved action this app cannot show; its record is kept, never dropped. */
export function UnavailableProposalCard({
  row,
}: {
  row: {
    status: string
    reason:
      | "payload_unavailable"
      | "version_unavailable"
      | "receipt_unavailable"
      | "client_unavailable"
  }
}) {
  return (
    <View
      accessibilityRole="summary"
      className="gap-1 rounded-[18px] border border-border bg-card p-3"
    >
      <Text className="text-base [-rn-line-height:22] font-bold text-foreground">
        Saved action unavailable here
      </Text>
      <Text className="text-base [-rn-line-height:22] text-muted-foreground">
        Saved status: {row.status.toLowerCase()}
      </Text>
      <Text className="text-base [-rn-line-height:22] text-foreground">
        {row.reason === "client_unavailable"
          ? "Review, edit or confirm this action on the dashboard."
          : row.reason === "receipt_unavailable"
            ? "Its saved receipt can't be shown in this app version."
            : "It uses a format this app version can't show."}{" "}
        Its record has been kept.
      </Text>
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
      <Text className="text-base [-rn-line-height:22] font-bold text-tint-amber-foreground">
        {title}
      </Text>
      <Text className="text-base [-rn-line-height:22] text-tint-amber-foreground">
        {reason}
      </Text>
      {alternative && onAlternative ? (
        <ActionButton variant="outline" onPress={onAlternative}>
          {alternative}
        </ActionButton>
      ) : null}
    </View>
  )
}
