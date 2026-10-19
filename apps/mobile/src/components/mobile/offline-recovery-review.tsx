import { ActionButton } from "@/components/mobile/action-button"
import { FormField } from "@/components/mobile/form-field"
import { StatusPill } from "@/components/mobile/green-till/kit"
import { StatusBanner } from "@/components/mobile/status-banner"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import type { RecoveryDecisionOutcome } from "@/hooks/use-offline-replay"
import { formatMinorMoney } from "@ewatrade/utils"
import { useEffect, useRef, useState } from "react"
import {
  type OfflineConflictRow,
  recoveryDecisionAccess,
  recoveryReasonError,
  recoverySummary,
} from "./offline-recovery-review-model"

const when = (date: Date | null) =>
  date
    ? date.toLocaleString(undefined, {
        day: "numeric",
        month: "short",
        hour: "numeric",
        minute: "2-digit",
      })
    : "Unknown"

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row justify-between gap-3">
      <Text className="text-xs text-muted-foreground">{label}</Text>
      <Text className="flex-1 text-right text-xs font-bold text-foreground">
        {value}
      </Text>
    </View>
  )
}

/** What the server's receipt says now, in one coherent status. */
function receiptState(outcome: RecoveryDecisionOutcome | null) {
  switch (outcome) {
    case "applied":
    case "applied_refresh_failed":
      return {
        pill: {
          label: "Approved",
          tone: "ok" as const,
          icon: "Check" as const,
        },
        terminal: true,
        tone: "success" as const,
        message:
          "Approved. The sale is recorded. The staff member's access is unchanged.",
      }
    case "rejected":
    case "rejected_refresh_failed":
      return {
        pill: { label: "Rejected", tone: "muted" as const, icon: "X" as const },
        terminal: true,
        tone: "success" as const,
        message:
          "Rejected. Nothing was recorded. The staff member's access is unchanged.",
      }
    case "held":
      return {
        pill: {
          label: "Still held",
          tone: "warn" as const,
          icon: "Clock" as const,
        },
        terminal: false,
        tone: "warning" as const,
        message:
          "Still held. It couldn't be applied as it stands (stock, account or prices may have changed). Review it again, or reject it.",
      }
    case "failed":
      return {
        pill: {
          label: "Held for owner review",
          tone: "warn" as const,
          icon: "Clock" as const,
        },
        terminal: false,
        tone: "destructive" as const,
        message:
          "This decision wasn't recorded. The record stays held for another decision.",
      }
    default:
      return {
        pill: {
          label: "Held for owner review",
          tone: "warn" as const,
          icon: "Clock" as const,
        },
        terminal: false,
        tone: null,
        message: null,
      }
  }
}

/**
 * A sale recorded offline by staff who were paused or suspended before it
 * synced. Nothing changes until an Owner or Admin approves exactly this
 * draft with a reason; approval rechecks stock, account and prices, and
 * neither decision restores the staff member's access.
 */
export function OfflineRecoveryReviewCard({
  conflict,
  viewerRole,
  viewerId,
  disabled,
  onDecide,
}: {
  conflict: OfflineConflictRow
  viewerRole: string | undefined
  viewerId: string | undefined
  disabled: boolean
  onDecide: (input: {
    commandId: string
    decision: "approve" | "reject"
    reason: string
    envelope: NonNullable<OfflineConflictRow["recoveryEnvelope"]>
  }) => Promise<RecoveryDecisionOutcome>
}) {
  const summary = recoverySummary(conflict)
  const access = recoveryDecisionAccess({
    role: viewerRole,
    viewerId,
    authorId: summary.authorId,
  })
  const [reason, setReason] = useState("")
  const [reasonError, setReasonError] = useState<string | null>(null)
  const [outcome, setOutcome] = useState<RecoveryDecisionOutcome | null>(null)
  const [deciding, setDeciding] = useState(false)
  const state = receiptState(outcome === "retired" ? null : outcome)
  const refreshWarning =
    outcome === "applied_refresh_failed" ||
    outcome === "rejected_refresh_failed"
  const locked = disabled || deciding || state.terminal
  // What the card renders *now*; a retained handler checks these at tap time.
  const current = useRef({ access, state, summary, locked })
  current.current = { access, state, summary, locked }
  const mounted = useRef(true)
  const inFlight = useRef(false)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  const decide = async (decision: "approve" | "reject") => {
    const now = current.current
    if (
      !mounted.current ||
      inFlight.current ||
      now.locked ||
      now.state.terminal ||
      !now.access.canDecide ||
      !now.summary.decidable ||
      !now.summary.envelope ||
      (decision === "approve" && !now.summary.canApprove)
    )
      return
    const error = recoveryReasonError(reason)
    setReasonError(error)
    if (error) return
    inFlight.current = true
    setDeciding(true)
    try {
      setOutcome(
        await onDecide({
          commandId: conflict.id,
          decision,
          reason: reason.trim(),
          envelope: now.summary.envelope,
        }),
      )
    } finally {
      inFlight.current = false
      if (mounted.current) setDeciding(false)
    }
  }
  const money = (minor: number | null) =>
    minor === null
      ? "Price not recorded"
      : summary.currencyCode
        ? formatMinorMoney(minor, summary.currencyCode)
        : String(minor)
  return (
    <View className="gap-3">
      <View className="flex-row flex-wrap items-center gap-2">
        <StatusPill
          icon={state.pill.icon}
          label={state.pill.label}
          tone={state.pill.tone}
        />
        <Text className="text-xs font-semibold text-muted-foreground">
          Paused or suspended staff
        </Text>
      </View>
      <Text className="font-bold text-foreground">
        {summary.author ?? "Staff member"} ·{" "}
        {summary.store ?? "Store details missing"}
      </Text>
      {state.terminal ? null : (
        <Text className="text-sm text-muted-foreground">
          Recorded offline before this staff member's access changed, or the
          phone says so. Nothing has changed in your records yet.
        </Text>
      )}
      <View className="gap-1.5 rounded-2xl bg-muted p-3">
        {summary.lines.map((line, index) => (
          <View
            className="flex-row justify-between gap-3"
            key={`${index}-${line.label}`}
          >
            <View className="min-w-0 flex-1">
              <Text className="text-xs font-bold text-foreground">
                {line.quantity ? `${line.quantity} × ` : ""}
                {line.label}
              </Text>
              <Text className="text-xs text-muted-foreground">{line.kind}</Text>
            </View>
            <Text className="text-xs font-bold text-foreground">
              {money(line.amountMinor)}
            </Text>
          </View>
        ))}
        <View className="my-1 h-px bg-border" />
        {summary.customer ? (
          <Fact label="Customer" value={summary.customer} />
        ) : null}
        <Fact
          label="Payment"
          value={
            summary.payment
              ? `${money(summary.payment.amountMinor)} · ${summary.payment.method}${summary.payment.account ? ` → ${summary.payment.account}` : ""}`
              : "Payment pending"
          }
        />
        <Fact
          label="Stock"
          value={summary.fulfillNow ? "Hand over now" : "Not handed over yet"}
        />
        <Fact label="Phone" value={summary.device ?? "Unknown device"} />
        <Fact label="Phone says recorded" value={when(summary.claimedAt)} />
        <Fact label="Access changed" value={when(summary.accessChangedAt)} />
        <Fact label="Reached the server" value={when(summary.receivedAt)} />
      </View>
      <Text className="text-xs text-muted-foreground">
        The phone's time is a claim, not proof of when the sale happened.
        Catalog items show a short reference when their name isn't available.
      </Text>
      {state.message ? (
        <StatusBanner message={state.message} tone={state.tone} />
      ) : null}
      {refreshWarning ? (
        <Text className="text-xs text-muted-foreground">
          Some lists didn't refresh yet; this list may still show the old state
          for a moment.
        </Text>
      ) : null}
      {!summary.decidable ? (
        <StatusBanner
          icon="Lock"
          tone="warning"
          title="Needs assisted recovery"
          message="This record is missing details needed to decide it safely. It stays held and isn't lost. Contact support for assisted recovery."
        />
      ) : state.terminal ? null : !access.canDecide ? (
        <Text className="text-xs font-semibold text-muted-foreground">
          {access.reason}
        </Text>
      ) : (
        <View className="gap-2">
          {!summary.canApprove ? (
            <StatusBanner
              icon="TriangleAlert"
              tone="warning"
              message={
                summary.store
                  ? "This Store is no longer active, so this sale can't be approved. You can still reject it."
                  : "The original Store's details are missing, so this sale can't be approved here. You can still reject it, or contact support for assisted recovery."
              }
            />
          ) : null}
          <FormField
            editable={!locked}
            error={reasonError ?? undefined}
            label="Reason (required)"
            maxLength={500}
            multiline
            onChangeText={(value) => {
              setReason(value)
              if (reasonError) setReasonError(null)
            }}
            placeholder="Why approve or reject this sale?"
            value={reason}
            variant="filled"
          />
          <View className="flex-row gap-2">
            {summary.canApprove ? (
              <ActionButton
                className="flex-1"
                disabled={locked}
                isLoading={deciding}
                loadingLabel="Recording decision"
                onPress={() => void decide("approve")}
                variant="outline"
              >
                Approve this sale
              </ActionButton>
            ) : null}
            <ActionButton
              className="flex-1"
              disabled={locked}
              onPress={() => void decide("reject")}
              variant="destructive"
            >
              Reject
            </ActionButton>
          </View>
          <Text className="text-xs text-muted-foreground">
            Approving records exactly this sale after rechecking stock, account
            and prices. Rejecting records nothing. Neither restores access.
          </Text>
        </View>
      )}
    </View>
  )
}
