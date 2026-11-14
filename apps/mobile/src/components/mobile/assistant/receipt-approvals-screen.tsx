import { StatusBanner, WorkflowModalScreen } from "@/components/mobile"
import { formatCommerceDateTime } from "@/components/mobile/commerce/commerce-model"
import { Skeleton } from "@/components/ui/skeleton"
import { useOperationalModeStore } from "@/store/operationalModeStore"
import { useTRPC } from "@/trpc/client"
import { useQuery } from "@tanstack/react-query"
import { useRouter } from "expo-router"
import { ScrollView } from "react-native"
import { ListCard, RecordRow } from "../green-till/kit"

/** Receipts staff sent from chat for an owner or admin to approve (19l). */
export function ReceiptApprovalsScreen() {
  const offline = useOperationalModeStore((s) => s.isOfflineMode)
  const trpc = useTRPC()
  const router = useRouter()
  const pending = useQuery(
    trpc.assistant.receiptApprovals.queryOptions(undefined, {
      enabled: !offline,
      refetchInterval: 30_000,
      retry: false,
    }),
  )
  const requests = pending.data ?? []
  return (
    <WorkflowModalScreen
      closeHref="/admin-home"
      closeLabel="Close receipts to approve"
      title="Receipts to approve"
    >
      <ScrollView
        contentContainerClassName="gap-4 px-[18px] pb-10"
        showsVerticalScrollIndicator={false}
      >
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
            message="Reconnect to see and approve receipts."
            tone="warning"
          />
        ) : pending.isPending ? (
          <Skeleton className="h-40 rounded-[20px]" />
        ) : !requests.length && !pending.isError ? (
          <StatusBanner
            icon="CheckCircle2"
            message="Nothing is waiting for you."
            title="All decided"
            tone="muted"
          />
        ) : null}
        {requests.length && !offline ? (
          <ListCard>
            {requests.map((request) => (
              <RecordRow
                key={request.id}
                avatar={{ icon: "Receipt", tint: "amber" }}
                meta={[
                  request.summary.split("\n")[0] ?? "",
                  formatCommerceDateTime(request.requestedAt),
                ].filter(Boolean)}
                onPress={() =>
                  router.push({
                    pathname: "/receipt-approval/[id]",
                    params: { id: request.id },
                  })
                }
                testID={`receipt-approval-${request.id}`}
                title={`${request.requestedBy} sent a ${request.kind}`}
              />
            ))}
          </ListCard>
        ) : null}
      </ScrollView>
    </WorkflowModalScreen>
  )
}
