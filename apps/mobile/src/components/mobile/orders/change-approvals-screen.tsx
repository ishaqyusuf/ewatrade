import {
  ActionButton,
  StatusBanner,
  WorkflowModalScreen,
} from "@/components/mobile"
import {
  commercialOrderHref,
  formatCommerceDateTime,
} from "@/components/mobile/commerce/commerce-model"
import { FormField } from "@/components/mobile/form-field"
import { Skeleton } from "@/components/ui/skeleton"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { formatOrderDetailMoney } from "@/lib/order-detail-dispatch-docket"
import { useOperationalModeStore } from "@/store/operationalModeStore"
import { useTRPC } from "@/trpc/client"
import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useRouter } from "expo-router"
import { useState } from "react"
import { ScrollView } from "react-native"

type Request = RouterOutputs["orders"]["pendingChangeApprovals"][number]

function RequestCard({
  busy,
  onDecide,
  onOpenOrder,
  request,
}: {
  busy: boolean
  onDecide: (decision: "approve" | "reject", note: string) => void
  onOpenOrder: () => void
  request: Request
}) {
  const [note, setNote] = useState("")
  return (
    <View
      className="gap-3 rounded-[20px] bg-card p-4 shadow-sm"
      testID={`change-approval-${request.id}`}
    >
      <View className="gap-1">
        <Text className="text-[15px] font-extrabold text-foreground">
          {request.requestedBy ?? "A team member"} asks to{" "}
          {request.kind === "return" ? "return items" : "give a refund"}
        </Text>
        <Text className="text-xs text-muted-foreground">
          {request.orderNumber}
          {request.customerName ? ` · ${request.customerName}` : ""} ·{" "}
          {formatCommerceDateTime(request.requestedAt)}
        </Text>
      </View>
      <Text className="text-sm text-foreground">{request.summary}</Text>
      {request.amountMinor > 0 ? (
        <Text className="text-sm font-bold tabular-nums text-foreground">
          {formatOrderDetailMoney(request.amountMinor, request.currencyCode)}
        </Text>
      ) : null}
      <Text className="text-xs leading-5 text-muted-foreground">
        Reason: {request.reason}
      </Text>
      <FormField
        label="Note"
        maxLength={500}
        onChangeText={setNote}
        placeholder="Optional"
        value={note}
      />
      <View className="flex-row gap-2">
        <ActionButton
          className="w-auto flex-1"
          disabled={busy}
          onPress={() => onDecide("reject", note)}
          testID={`change-approval-reject-${request.id}`}
          variant="outline"
        >
          Not approve
        </ActionButton>
        <ActionButton
          className="w-auto flex-1"
          disabled={busy}
          onPress={() => onDecide("approve", note)}
          testID={`change-approval-approve-${request.id}`}
          tone="gold"
        >
          Approve
        </ActionButton>
      </View>
      <ActionButton disabled={busy} onPress={onOpenOrder} variant="ghost">
        Open {request.orderNumber}
      </ActionButton>
    </View>
  )
}

/** Owner/Admin: return and refund requests waiting in this store. */
export function ChangeApprovalsScreen() {
  const offline = useOperationalModeStore((s) => s.isOfflineMode)
  const trpc = useTRPC()
  const router = useRouter()
  const queryClient = useQueryClient()
  const [notice, setNotice] = useState<string | null>(null)
  const pending = useQuery(
    trpc.orders.pendingChangeApprovals.queryOptions(undefined, {
      enabled: !offline,
      refetchInterval: 15_000,
      retry: false,
    }),
  )
  const decide = useMutation(
    trpc.orders.decideChangeApproval.mutationOptions({
      onSettled: () =>
        queryClient.invalidateQueries({
          queryKey: trpc.orders.pendingChangeApprovals.queryKey(),
        }),
    }),
  )
  const requests = pending.data ?? []
  return (
    <WorkflowModalScreen
      closeHref="/admin-home"
      closeLabel="Close approvals"
      title="Approvals"
    >
      <ScrollView
        contentContainerClassName="gap-4 px-[18px] pb-10"
        showsVerticalScrollIndicator={false}
      >
        <Text className="text-sm text-muted-foreground">
          Returns and refunds your team asked for today. Once you approve, the
          person who asked records it before the end of the day.
        </Text>
        {notice ? (
          <StatusBanner icon="CheckCircle2" message={notice} tone="success" />
        ) : null}
        {decide.isError ? (
          <StatusBanner
            icon="AlertCircle"
            message={decide.error.message}
            title="Not saved"
            tone="destructive"
          />
        ) : null}
        {pending.isError ? (
          <StatusBanner
            actionLabel="Try again"
            icon="AlertCircle"
            message={pending.error.message}
            onActionPress={() => void pending.refetch()}
            title="Could not load requests"
            tone="destructive"
          />
        ) : null}
        {offline ? (
          <StatusBanner
            icon="Wind"
            message="Reconnect to see and decide requests."
            tone="warning"
          />
        ) : pending.isPending ? (
          <Skeleton className="h-48 rounded-[20px]" />
        ) : !requests.length && !pending.isError ? (
          <StatusBanner
            icon="CheckCircle2"
            message="Nothing is waiting for you."
            title="All decided"
            tone="muted"
          />
        ) : null}
        {requests.map((request) => (
          <RequestCard
            busy={decide.isPending}
            key={request.id}
            onDecide={(decision, note) => {
              setNotice(null)
              decide.mutate(
                {
                  approvalId: request.id,
                  decision,
                  note: note.trim() || undefined,
                },
                {
                  onSuccess: () =>
                    setNotice(
                      decision === "approve"
                        ? `Approved. ${request.requestedBy ?? "They"} can record it now.`
                        : `Not approved. ${request.requestedBy ?? "They"} will see your note.`,
                    ),
                },
              )
            }}
            onOpenOrder={() =>
              router.push(commercialOrderHref(request.orderId))
            }
            request={request}
          />
        ))}
      </ScrollView>
    </WorkflowModalScreen>
  )
}
