import { ActionButton } from "@/components/mobile/action-button"
import { StatusBanner } from "@/components/mobile/status-banner"
import { useOperationalModeStore } from "@/store/operationalModeStore"
import { type Href, useRouter } from "expo-router"
import type { useMobileFinanceCommand } from "./use-mobile-finance-command"

export type MobileFinanceCommand = ReturnType<typeof useMobileFinanceCommand>
const labels: Record<string, string> = {
  recordExpense: "expense",
  payBill: "expense payment",
  reverseBillPayment: "payment correction",
  voidExpense: "expense cancellation",
  recordMoney: "money movement",
  reverseMoney: "money correction",
  recordCashCount: "physical cash count",
  adjustCashCount: "investigated cash adjustment",
  cashAdjustmentReversal: "cash adjustment reversal",
}

export function FinanceCommandFeedback({
  command,
  onRecorded,
  onRejected,
  onReviewCashCount,
}: {
  command: MobileFinanceCommand
  onRecorded: () => void
  onRejected?: () => void
  onReviewCashCount?: (countId: string) => boolean
}) {
  const router = useRouter()
  const cashCountId = ["adjustCashCount", "cashAdjustmentReversal"].includes(
    command.retained?.command.operation ?? "",
  )
    ? command.retained?.command.recoveryMetadata?.countId
    : undefined
  const offline = useOperationalModeStore((s) => s.isOfflineMode)
  async function acknowledge() {
    const result = await command.acknowledge()
    if (result === "RECORDED") onRecorded()
    if (result === "REJECTED") onRejected?.()
  }
  return (
    <>
      {offline ? (
        <StatusBanner
          title="Offline"
          message="Reconnect to record or confirm financial submissions."
          tone="warning"
        />
      ) : null}
      {command.error ? (
        <StatusBanner
          title="Submission needs attention"
          message={command.error}
          tone="destructive"
        />
      ) : null}
      {command.notice ? <StatusBanner message={command.notice} /> : null}
      {!command.ready && !command.pending ? (
        <ActionButton
          variant="outline"
          onPress={() => void command.inspect(true)}
        >
          Check saved submission status
        </ActionButton>
      ) : null}
      {command.retained ? (
        <StatusBanner
          title="Earlier submission needs confirmation"
          message={`Your earlier ${labels[command.retained.command.operation] ?? "financial submission"} needs confirmation. Check its result or re-enter its exact original details.`}
          actionLabel="Check saved result"
          onActionPress={() => void acknowledge()}
          tone="warning"
        />
      ) : null}
      {cashCountId ? (
        <ActionButton
          variant="outline"
          disabled={command.pending}
          onPress={() => {
            if (!onReviewCashCount?.(cashCountId))
              router.push({
                pathname: "/finance-count/[countId]",
                params: { countId: cashCountId },
              } as Href)
          }}
        >
          Review saved cash action history
        </ActionButton>
      ) : null}
    </>
  )
}
