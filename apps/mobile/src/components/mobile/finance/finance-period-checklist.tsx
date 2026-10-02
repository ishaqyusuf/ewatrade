import { StatusBanner } from "@/components/mobile/status-banner"
import { Text } from "@/components/ui/text"
import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import { formatFinanceMoney } from "@ewatrade/utils/finance-money"
import { View } from "react-native"

type Checklist = RouterOutputs["finance"]["periodCloseChecklist"]

function gapLabel(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((word) => word[0]?.toUpperCase() + word.slice(1))
    .join(" ")
}

export function FinancePeriodChecklist({
  checklist,
}: {
  checklist: Checklist
}) {
  const blocked = checklist.checks.filter(
    (check) => check.status === "BLOCKED",
  ).length
  const reviewRequired = checklist.checks.filter(
    (check) => check.status === "REVIEW_REQUIRED",
  ).length
  const canProceed = checklist.dateLockEligible && blocked === 0
  return (
    <View className="gap-4 rounded-2xl border border-border bg-card p-4">
      <View className="gap-1">
        <Text className="text-base font-semibold">
          Operational close checklist
        </Text>
        <Text className="text-xs text-muted-foreground">
          {new Date(checklist.from).toISOString().slice(0, 10)}–
          {new Date(checklist.through).toISOString().slice(0, 10)} UTC ·{" "}
          {checklist.currencyCode} · snapshot {checklist.snapshotSequence}
        </Text>
      </View>
      <StatusBanner
        title={
          canProceed
            ? reviewRequired
              ? `${reviewRequired} review${reviewRequired === 1 ? "" : "s"} still required`
              : "Checklist checks pass"
            : checklist.dateLockEligible
              ? "Resolve blocking checks before locking dates"
              : "This cutoff is not eligible for a date lock"
        }
        message={`Date-lock eligible: ${checklist.dateLockEligible ? "yes" : "no"}. Operationally reconciled: no. Report coverage: ${checklist.completeness.toLowerCase().replaceAll("_", " ")}.`}
        tone={canProceed ? "warning" : "destructive"}
      />
      <View className="gap-3">
        {checklist.checks.map((check) => (
          <View key={check.id} className="gap-1 border-b border-border pb-3">
            <View className="flex-row items-start justify-between gap-2">
              <Text className="min-w-0 flex-1 font-semibold">
                {check.label}
              </Text>
              <Text
                className={
                  check.status === "PASS"
                    ? "text-xs font-bold text-success"
                    : check.status === "BLOCKED"
                      ? "text-xs font-bold text-destructive"
                      : "text-xs font-bold text-warn"
                }
              >
                {check.status.replaceAll("_", " ")}
              </Text>
            </View>
            <Text className="text-sm text-muted-foreground">
              {check.id === "POSTED_TRIAL_BALANCE"
                ? `Posted debits ${formatFinanceMoney(checklist.trialBalance.debitMinor, checklist.currencyCode)} · credits ${formatFinanceMoney(checklist.trialBalance.creditMinor, checklist.currencyCode)}.`
                : check.explanation}
            </Text>
          </View>
        ))}
      </View>
      <View className="gap-2">
        <Text className="font-semibold">Cash at the exact cutoff</Text>
        {checklist.cash.length ? (
          checklist.cash.map((row) => (
            <View
              key={row.accountId}
              className="flex-row flex-wrap items-center justify-between gap-1"
            >
              <Text className="flex-1">{row.name}</Text>
              <Text className="text-xs text-muted-foreground">
                Posted{" "}
                {formatFinanceMoney(
                  row.closingBalanceMinor,
                  checklist.currencyCode,
                )}
                {row.observedBalanceMinor === null
                  ? " · no count"
                  : ` · counted ${formatFinanceMoney(row.observedBalanceMinor, checklist.currencyCode)}`}
                {` · ${row.status.replaceAll("_", " ")}`}
              </Text>
            </View>
          ))
        ) : (
          <Text className="text-sm text-muted-foreground">
            No posted cash accounts were returned for this Book.
          </Text>
        )}
        {!checklist.cashCountCoverageComplete ? (
          <Text className="text-sm text-destructive">
            Cash-count coverage is incomplete; this bounded list does not
            include every cutoff count.
          </Text>
        ) : null}
      </View>
      {checklist.coverageGaps.length ? (
        <View className="gap-1">
          <Text className="font-semibold">Known report coverage gaps</Text>
          <Text className="text-sm text-muted-foreground">
            {checklist.coverageGaps.map(gapLabel).join(" · ")}
          </Text>
        </View>
      ) : null}
      {checklist.checks.some((check) => check.id === "YEAR_END_EARNINGS") ? (
        <Text className="text-sm text-muted-foreground">
          Closing dates does not transfer earnings. Year-end retained earnings
          remains a separate workflow.
        </Text>
      ) : null}
      {canProceed && reviewRequired ? (
        <Text className="text-sm text-muted-foreground">
          These reviews remain open. Locking dates does not mark them complete
          or waive them.
        </Text>
      ) : null}
    </View>
  )
}
