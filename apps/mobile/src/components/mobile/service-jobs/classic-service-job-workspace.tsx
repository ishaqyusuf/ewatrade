import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { formatMinorMoney } from "@ewatrade/utils"
import { ActionButton } from "../action-button"
import { HeroCard } from "../green-till/hero-card"
import { QuickActionRow, StatusPill } from "../green-till/kit"
import { StatusBanner } from "../status-banner"
import { ServiceWorkLines } from "./service-work-lines"
import { overdueWork, workStatusLabel } from "./service-work-summary"
import type { ServiceJobsModel } from "./use-service-jobs"
export function ClassicServiceJobWorkspace({
  model,
  onLinesLayout,
  onPageChange,
}: {
  model: ServiceJobsModel
  onLinesLayout: (y: number) => void
  onPageChange: () => void
}) {
  const job = model.selectedJob
  if (!job) return null
  const canAct = model.command.canAct()
  const late = overdueWork(job, Date.now())
  const ready = job.summary === "ready_for_handoff" && !job.handedOffAt
  return (
    <View className="gap-4">
      <ActionButton
        variant="ghost"
        icon="ArrowLeft"
        onPress={() => {
          model.setAmountPaid("")
          model.setPaymentReference("")
          model.setSelectedJobId(null)
        }}
      >
        Work queue
      </ActionButton>
      <HeroCard
        label={`${job.customerName || "Walk-in customer"} · ${job.orderNumber}`}
        amount={formatMinorMoney(job.balanceDueMinor, job.currencyCode)}
        sub="Balance to collect"
        pill={{
          label: workStatusLabel(job.summary),
          tone: job.handedOffAt ? "synced" : "draft",
        }}
      >
        <View className="mt-4 flex-row flex-wrap gap-2">
          {["Received", "Working", "Ready", "Collected"].map((label) => (
            <StatusPill
              key={label}
              label={label}
              tone={workStatusLabel(job.summary) === label ? "ok" : "muted"}
            />
          ))}
        </View>
        {ready ? (
          <View className="mt-4">
            <ActionButton
              tone="cream"
              disabled={!canAct}
              onPress={() => model.openPaymentEditor(job, "handoff")}
            >
              {job.balanceDueMinor > 0
                ? "Collect balance and hand over"
                : "Mark collected"}
            </ActionButton>
          </View>
        ) : job.handedOffAt ? (
          <Text className="mt-4 text-hero-foreground">Collected</Text>
        ) : null}
      </HeroCard>
      {job.dueCommitmentAt ? (
        <StatusBanner
          tone={late ? "destructive" : "default"}
          title={late ? "Overdue" : "Due"}
          message={new Date(job.dueCommitmentAt).toLocaleString()}
        />
      ) : null}
      {job.summary === "blocked" ? (
        <StatusBanner
          tone="destructive"
          title="Work is blocked"
          message={
            job.exceptions.at(-1)?.description ??
            "Review the work lines before continuing."
          }
        />
      ) : null}
      <QuickActionRow
        actions={[
          ...(job.balanceDueMinor > 0
            ? [
                {
                  label: "Payment",
                  icon: "CreditCard" as const,
                  disabled: !canAct,
                  onPress: () => model.openPaymentEditor(job, "payment"),
                },
              ]
            : []),
          {
            label: "Note",
            icon: "FileText",
            disabled: !canAct,
            onPress: () => model.openTextEditor(job, "note"),
          },
          {
            label: "Evidence",
            icon: "Camera",
            disabled: !canAct,
            onPress: () => model.openEvidenceChooser(job),
          },
          ...(model.canManage
            ? [
                {
                  label: "Customer update",
                  icon: "MessageCircle" as const,
                  disabled: !model.command.canAct(true),
                  onPress: () => model.openTextEditor(job, "message"),
                },
              ]
            : []),
        ]}
      />
      {model.profile?.id && job.currentAssigneeUserId !== model.profile.id ? (
        <ActionButton
          variant="outline"
          disabled={!canAct}
          isLoading={model.assignMutation.isPending}
          onPress={() => model.assignToMe(job)}
        >
          Assign to me
        </ActionButton>
      ) : null}
      <ServiceWorkLines
        job={job}
        disabled={!canAct}
        onTransition={model.transition}
        onLayout={onLinesLayout}
        onPageChange={onPageChange}
      />
      <Text className="text-xs text-muted-foreground">
        Notes and evidence stay private unless a manager publishes reviewed
        evidence.
      </Text>
      {job.notes.slice(-3).map((entry) => (
        <View className="rounded-[20px] bg-card p-4" key={entry.id}>
          <Text>{entry.body}</Text>
        </View>
      ))}
      {job.notes.length ? (
        <ActionButton
          variant="outline"
          onPress={() => model.openHistory("notes")}
        >
          View all {job.notes.length} loaded notes
        </ActionButton>
      ) : null}
      {job.evidence.length ? (
        <ActionButton
          variant="outline"
          onPress={() => model.openHistory("evidence")}
        >
          View {job.evidence.length} loaded attachments
        </ActionButton>
      ) : null}
    </View>
  )
}
