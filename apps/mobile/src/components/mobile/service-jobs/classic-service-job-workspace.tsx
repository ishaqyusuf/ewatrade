import { Icon, type IconKeys } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useColorScheme, useColors } from "@/hooks/use-color"
import { GREEN_TILL_THEME, type GreenTillTint } from "@/lib/green-till-theme"
import { formatMinorMoney } from "@ewatrade/utils"
import { useEffect, useRef } from "react"
import { Text as NativeText } from "react-native"
import { ActionButton } from "../action-button"
import { workDueLabel } from "../appearances/classic/service-jobs"
import { HeroCard } from "../green-till/hero-card"
import { StatusBanner } from "../status-banner"
import { useSetServiceChromeHeader } from "./service-chrome-context"
import { textLabel } from "./service-jobs-model"
import { ServiceWorkLines } from "./service-work-lines"
import { overdueWork } from "./service-work-summary"
import type { ServiceJobsModel } from "./use-service-jobs"

const TRACK = ["Received", "Working", "Ready", "Collected"] as const

/** How far along the Received → Working → Ready → Collected track a job is. */
function trackStep(summary: string, handedOff: boolean) {
  if (handedOff || summary === "completed") return 4
  if (summary === "ready_for_handoff") return 3
  if (["in_progress", "partially_ready", "blocked"].includes(summary)) return 2
  return 1
}

function dueLine(due: Date | string, late: boolean) {
  const label = workDueLabel(due) ?? ""
  const today = /^\d{2}:\d{2}$/.test(label)
  if (late) return `Overdue · was due ${today ? `today ${label}` : label}`
  return `Due ${today ? `today ${label}` : label}`
}

export function ClassicServiceJobWorkspace({
  model,
  onLinesLayout,
  onPageChange,
}: {
  model: ServiceJobsModel
  onLinesLayout: (y: number) => void
  onPageChange: () => void
}) {
  const { colorScheme } = useColorScheme()
  const colors = useColors()
  const palette = GREEN_TILL_THEME[colorScheme]
  const job = model.selectedJob
  const setHeader = useSetServiceChromeHeader()
  const latest = useRef({
    back: () => {},
    history: () => {},
  })
  latest.current = {
    back: () => {
      model.setAmountPaid("")
      model.setPaymentReference("")
      model.setSelectedJobId(null)
    },
    history: () => model.openHistory("notes"),
  }
  const title = job?.orderNumber
  // The modal bar becomes "‹ ORD-013 🕘" while a job is open.
  useEffect(() => {
    if (!title) return
    setHeader({
      onBack: () => latest.current.back(),
      onHistory: () => latest.current.history(),
      title,
    })
    return () => setHeader(null)
  }, [setHeader, title])
  if (!job) return null
  const canAct = model.command.canAct()
  const late = overdueWork(job, Date.now())
  const handedOff = Boolean(job.handedOffAt)
  const ready = job.summary === "ready_for_handoff" && !handedOff
  const step = trackStep(job.summary, handedOff)
  const money = (minor: number) => formatMinorMoney(minor, job.currencyCode)
  const mine = model.profile?.id
    ? job.currentAssigneeUserId === model.profile.id
    : false
  return (
    <View className="gap-4">
      <HeroCard
        label={job.customerName || "Walk-in customer"}
        pill={{
          label:
            job.balanceDueMinor <= 0
              ? "Paid"
              : job.amountPaidMinor > 0
                ? "Part paid"
                : "Unpaid",
          tone: job.balanceDueMinor > 0 ? "draft" : "synced",
        }}
        title={
          job.balanceDueMinor > 0
            ? `${money(job.balanceDueMinor)} due`
            : handedOff
              ? "Collected"
              : "Paid in full"
        }
        sub={`${money(job.amountPaidMinor)} of ${money(job.orderTotalMinor)} paid`}
      >
        {job.dueCommitmentAt && !handedOff ? (
          <View className="mt-1.5 flex-row items-center gap-1.5">
            <Icon
              className="size-[14px]"
              color={late ? palette.heroDown : palette.heroMuted}
              name="Clock"
            />
            <NativeText
              style={{
                color: late ? palette.heroDown : palette.heroMuted,
                fontSize: 12.5,
                fontWeight: late ? "700" : "400",
              }}
            >
              {dueLine(job.dueCommitmentAt, late)}
            </NativeText>
          </View>
        ) : null}
        <View
          accessibilityLabel={`Progress: ${TRACK[step - 1]}`}
          className="mt-4 flex-row gap-1.5"
        >
          {TRACK.map((label, index) => (
            <View key={label} className="flex-1 gap-1.5">
              <View
                style={{
                  backgroundColor:
                    index < step ? palette.gold : palette.heroLine,
                  borderRadius: 2,
                  height: 4,
                }}
              />
              <NativeText
                style={{
                  color:
                    index < step ? palette.heroForeground : palette.heroMuted,
                  fontSize: 11,
                  fontWeight: "700",
                }}
              >
                {label}
              </NativeText>
            </View>
          ))}
        </View>
        {ready || (job.balanceDueMinor > 0 && !handedOff) ? (
          <View className="mt-4">
            <ActionButton
              tone="cream"
              icon={ready ? "Wallet" : "CreditCard"}
              disabled={!canAct}
              onPress={() =>
                model.openPaymentEditor(job, ready ? "handoff" : "payment")
              }
            >
              {ready
                ? job.balanceDueMinor > 0
                  ? "Collect balance and hand over"
                  : "Hand over"
                : "Record payment"}
            </ActionButton>
          </View>
        ) : null}
      </HeroCard>
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
      <InfoCard
        icon="UserPlus"
        tint="lilac"
        title={
          mine
            ? "Assigned to you"
            : job.currentAssigneeUserId
              ? "Assigned to a teammate"
              : "Not assigned yet"
        }
        detail={
          mine ? "You are working on this job" : "Take this job to work on it"
        }
        actionLabel={mine || !model.profile?.id ? undefined : "Assign to me"}
        actionDisabled={!canAct || model.assignMutation.isPending}
        onAction={() => model.assignToMe(job)}
      />
      <ServiceWorkLines
        key={job.id}
        job={job}
        disabled={!canAct}
        onTransition={model.transition}
        onLayout={onLinesLayout}
        onPageChange={onPageChange}
      />
      {model.canManage ? (
        <InfoCard
          icon="MessageCircle"
          tint="sky"
          title="Customer update"
          detail="WhatsApp or SMS · managers only"
          actionLabel="Send"
          actionDisabled={!model.command.canAct(true)}
          onAction={() => model.openTextEditor(job, "message")}
        />
      ) : null}
      <View className="gap-2">
        <View className="mt-1 flex-row items-baseline justify-between px-0.5">
          <Text
            accessibilityRole="header"
            className="text-base font-extrabold tracking-tight text-foreground"
          >
            Private record
          </Text>
          {job.notes.length || job.evidence.length ? (
            <Pressable
              accessibilityRole="button"
              className="min-h-9 justify-end"
              haptic
              hitSlop={8}
              onPress={() =>
                model.openHistory(job.notes.length ? "notes" : "evidence")
              }
            >
              <Text className="text-[13px] font-bold text-primary">
                See all
              </Text>
            </Pressable>
          ) : null}
        </View>
        {job.notes.length || job.evidence.length ? (
          <View className="gap-2.5 rounded-[20px] bg-card p-3 shadow-sm">
            {job.notes.slice(-2).map((entry) => (
              <View key={entry.id} className="rounded-xl bg-muted px-3 py-2.5">
                <Text className="text-[13px] text-foreground">
                  {entry.body}
                </Text>
                <Text className="mt-0.5 text-[11px] text-muted-foreground">
                  {new Date(entry.createdAt).toLocaleTimeString("en-GB", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </Text>
              </View>
            ))}
            {job.evidence.length ? (
              <View className="flex-row flex-wrap gap-2">
                {job.evidence.slice(-4).map((entry) => (
                  <Pressable
                    key={entry.id}
                    accessibilityRole="button"
                    className="min-h-8 flex-row items-center gap-1.5 rounded-lg bg-muted px-2.5 active:opacity-80"
                    haptic
                    onPress={() => model.openHistory("evidence")}
                  >
                    <Icon
                      className="size-[13px]"
                      color={
                        entry.uploadStatus === "FAILED"
                          ? colors.destructive
                          : colors.mutedForeground
                      }
                      name={entry.mediaType === "VIDEO" ? "Video" : "Camera"}
                    />
                    <Text className="text-xs font-bold text-foreground">
                      {entry.label || textLabel(entry.purpose)} ·{" "}
                      {textLabel(entry.uploadStatus)}
                    </Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
          </View>
        ) : null}
        <View className="flex-row gap-2">
          <RecordTile
            icon="Camera"
            label="Photo"
            tint="sky"
            disabled={!canAct || model.captureBusy}
            onPress={() => void model.captureEvidence(job, "photo")}
          />
          <RecordTile
            icon="Video"
            label="Video"
            tint="sky"
            disabled={!canAct || model.captureBusy}
            onPress={() => void model.captureEvidence(job, "video")}
          />
          <RecordTile
            icon="FileText"
            label="Note"
            tint="mint"
            disabled={!canAct}
            onPress={() => model.openTextEditor(job, "note")}
          />
        </View>
        <Text className="px-0.5 text-xs text-muted-foreground">
          Notes and evidence stay private unless a manager publishes reviewed
          evidence.
        </Text>
      </View>
    </View>
  )
}

function TintTile({ icon, tint }: { icon: IconKeys; tint: GreenTillTint }) {
  const { colorScheme } = useColorScheme()
  const palette = GREEN_TILL_THEME[colorScheme]
  return (
    <View
      style={{
        alignItems: "center",
        backgroundColor: palette[tint],
        borderRadius: 11,
        height: 34,
        justifyContent: "center",
        width: 34,
      }}
    >
      <Icon
        className="size-[17px]"
        color={palette[`${tint}Foreground`]}
        name={icon}
      />
    </View>
  )
}

function InfoCard({
  icon,
  tint,
  title,
  detail,
  actionLabel,
  actionDisabled,
  onAction,
}: {
  icon: IconKeys
  tint: GreenTillTint
  title: string
  detail: string
  actionLabel?: string
  actionDisabled?: boolean
  onAction: () => void
}) {
  return (
    <View className="min-h-[62px] flex-row items-center gap-3 rounded-[20px] bg-card px-3.5 py-3 shadow-sm">
      <TintTile icon={icon} tint={tint} />
      <View className="min-w-0 flex-1">
        <Text className="text-sm font-bold text-foreground">{title}</Text>
        <Text className="text-xs text-muted-foreground">{detail}</Text>
      </View>
      {actionLabel ? (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: actionDisabled }}
          className="min-h-11 justify-center px-1"
          disabled={actionDisabled}
          haptic
          hitSlop={6}
          onPress={onAction}
        >
          <Text
            className={
              actionDisabled
                ? "text-[13px] font-bold text-muted-foreground"
                : "text-[13px] font-bold text-primary"
            }
          >
            {actionLabel}
          </Text>
        </Pressable>
      ) : null}
    </View>
  )
}

function RecordTile({
  icon,
  label,
  tint,
  disabled,
  onPress,
}: {
  icon: IconKeys
  label: string
  tint: GreenTillTint
  disabled?: boolean
  onPress: () => void
}) {
  return (
    <View
      className={
        disabled
          ? "flex-1 rounded-[18px] bg-card opacity-50 shadow-sm"
          : "flex-1 rounded-[18px] bg-card shadow-sm"
      }
    >
      <Pressable
        accessibilityLabel={`Add ${label.toLowerCase()}`}
        accessibilityRole="button"
        accessibilityState={{ disabled }}
        className="items-center gap-1.5 rounded-[18px] py-3.5 active:opacity-80"
        disabled={disabled}
        haptic
        onPress={onPress}
        transition
      >
        <TintTile icon={icon} tint={tint} />
        <Text className="text-[13px] font-bold text-foreground">{label}</Text>
      </Pressable>
    </View>
  )
}
