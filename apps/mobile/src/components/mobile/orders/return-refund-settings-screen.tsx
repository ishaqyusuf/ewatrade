import {
  ActionButton,
  StatusBanner,
  WorkflowModalScreen,
} from "@/components/mobile"
import {
  ListCard,
  RecordRow,
  SectionHeader,
} from "@/components/mobile/green-till/kit"
import { SettingsScreen } from "@/components/mobile/settings-screen"
import { Icon } from "@/components/ui/icon"
import { Skeleton } from "@/components/ui/skeleton"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useOperationalModeStore } from "@/store/operationalModeStore"
import { useTRPC } from "@/trpc/client"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useState } from "react"
import { ScrollView } from "react-native"
import {
  type OrderChangeMode,
  type OrderChangePolicy,
  REFUND_MODE_CHOICES,
  RETURN_MODE_CHOICES,
  orderChangePolicySummary,
  samePolicy,
} from "./order-change-policy-model"

function ModeChoices({
  choices,
  disabled,
  label,
  onChange,
  value,
}: {
  choices: typeof RETURN_MODE_CHOICES
  disabled: boolean
  label: string
  onChange: (mode: OrderChangeMode) => void
  value: OrderChangeMode
}) {
  return (
    <ListCard>
      {choices.map((choice) => {
        const selected = choice.mode === value
        return (
          <RecordRow
            accessibilityLabel={`${label}: ${choice.title}${selected ? ", selected" : ""}`}
            avatar={{ icon: choice.icon, tint: choice.tint }}
            key={choice.mode}
            meta={choice.sub}
            onPress={disabled ? undefined : () => onChange(choice.mode)}
            stackDetails
            status={
              selected ? (
                <Icon
                  className="size-[22px] text-primary"
                  name="CheckCircle2"
                />
              ) : (
                <View className="size-[20px] rounded-full border-2 border-border" />
              )
            }
            testID={`order-change-policy-${label.toLowerCase()}-${choice.mode.toLowerCase()}`}
            title={choice.title}
          />
        )
      })}
    </ListCard>
  )
}

/** Owner/Admin: how this store handles returns and refunds. */
export function ReturnRefundSettingsScreen() {
  const offline = useOperationalModeStore((s) => s.isOfflineMode)
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const policy = useQuery(
    trpc.orders.changePolicy.queryOptions(undefined, {
      enabled: !offline,
      retry: false,
    }),
  )
  const [draft, setDraft] = useState<OrderChangePolicy | null>(null)
  const [saved, setSaved] = useState(false)
  useEffect(() => {
    if (policy.data)
      setDraft({
        refundsMode: policy.data.refundsMode,
        returnsMode: policy.data.returnsMode,
      })
  }, [policy.data])
  const update = useMutation(
    trpc.orders.updateChangePolicy.mutationOptions({
      onSuccess: async () => {
        setSaved(true)
        await Promise.all([
          queryClient.invalidateQueries({
            queryKey: trpc.orders.changePolicy.queryKey(),
          }),
          queryClient.invalidateQueries({
            queryKey: trpc.orders.changeOptions.queryKey(),
          }),
        ])
      },
    }),
  )
  const canEdit = !offline && Boolean(policy.data?.canEdit) && !update.isPending
  const dirty =
    draft && policy.data
      ? !samePolicy(draft, {
          refundsMode: policy.data.refundsMode,
          returnsMode: policy.data.returnsMode,
        })
      : false
  const change = (patch: Partial<OrderChangePolicy>) => {
    if (!draft || !canEdit) return
    setSaved(false)
    update.reset()
    setDraft({ ...draft, ...patch })
  }

  return (
    <WorkflowModalScreen
      closeHref="/admin-home"
      closeLabel="Close Returns and refunds"
      title="Returns and refunds"
    >
      <ScrollView
        contentContainerClassName="gap-4 px-[18px] pb-10"
        showsVerticalScrollIndicator={false}
      >
        <SettingsScreen
          label={policy.data?.storeName ?? "This store"}
          loading={policy.isPending && !offline}
          title={
            draft ? orderChangePolicySummary(draft) : "Returns and refunds"
          }
          sub={
            offline
              ? "Reconnect to change these settings."
              : "Owners and admins never need approval."
          }
        />
        {policy.isError ? (
          <StatusBanner
            actionLabel={offline ? undefined : "Try again"}
            icon="AlertCircle"
            message={policy.error.message}
            onActionPress={() => void policy.refetch()}
            title="Could not load these settings"
            tone="destructive"
          />
        ) : null}
        {update.isError ? (
          <StatusBanner
            icon="AlertCircle"
            message={update.error.message}
            title="Settings were not saved"
            tone="destructive"
          />
        ) : null}
        {saved && !dirty ? (
          <StatusBanner
            icon="CheckCircle2"
            message="New returns and refunds at this store follow these settings."
            title="Saved"
            tone="success"
          />
        ) : null}
        {draft ? (
          <>
            <SectionHeader title="Returns" />
            <ModeChoices
              choices={RETURN_MODE_CHOICES}
              disabled={!canEdit}
              label="Returns"
              onChange={(returnsMode) => change({ returnsMode })}
              value={draft.returnsMode}
            />
            <SectionHeader title="Refunds" />
            <ModeChoices
              choices={REFUND_MODE_CHOICES}
              disabled={!canEdit}
              label="Refunds"
              onChange={(refundsMode) => change({ refundsMode })}
              value={draft.refundsMode}
            />
          </>
        ) : policy.isFetching ? (
          <Skeleton className="h-64 rounded-[20px]" />
        ) : null}
        <View className="mt-2 flex-row items-start gap-2">
          <Icon className="mt-0.5 size-sm text-primary" name="Info" />
          <Text className="min-w-0 flex-1 text-xs [-rn-line-height:22] text-muted-foreground">
            Requests show on your Home and on the order. An approval lasts until
            the end of the day, and only the person who asked can use it. A
            return that gives money back also follows the Refunds setting.
          </Text>
        </View>
        <View className="mt-3">
          <ActionButton
            disabled={!canEdit || !dirty}
            icon="Check"
            isLoading={update.isPending}
            loadingLabel="Saving"
            onPress={() => draft && update.mutate(draft)}
            testID="order-change-policy-save"
          >
            Save
          </ActionButton>
        </View>
      </ScrollView>
    </WorkflowModalScreen>
  )
}
