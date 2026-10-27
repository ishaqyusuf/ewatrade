import { ActionButton } from "@/components/mobile/action-button"
import { RowDivider } from "@/components/mobile/green-till/kit"
import { InfoNote } from "@/components/mobile/payment-links/payment-link-parts"
import { StatusBanner } from "@/components/mobile/status-banner"
import { Icon } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Skeleton } from "@/components/ui/skeleton"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { cn } from "@/lib/utils"
import {
  ALERT_CHANNELS,
  type AlertBlocker,
  type AlertChannel,
  type AlertDraft,
  type AlertProblem,
  type AlertSettings,
  alertsConflict,
  alertsOffPlan,
  anyoneCanReceive,
  blockersFor,
  canReach,
  canSkipSetup,
  channelName,
  channelOpen,
  closedChannelAdvice,
  destination,
  eligibilityLine,
  keepMyChoices,
  previousChoice,
  recipientRole,
  switchOffer,
} from "@ewatrade/utils/payment-alerts-view"
import { type Href, useRouter } from "expo-router"
import { useState } from "react"

const CHANNEL_HINTS: Record<AlertChannel, string> = {
  email: "To each person's verified email",
  whatsapp: "To each person's verified phone on WhatsApp",
}

const PROBLEM_TEXT: Partial<Record<AlertProblem, string>> = {
  choose_people: "Choose at least one person.",
  choose_channel: "Choose Email or WhatsApp.",
  nobody_can_receive: "Choose at least one person before you save.",
  settings_changed: "Keep your choices or use the saved settings first.",
}

const PLANS_ROUTE = "/subscription-modal" as Href
/** Where the signed-in person verifies their own phone (no assistant connection needed). */
const PHONE_ROUTE = "/account-phone" as Href

/**
 * "Payment alerts" inside Add / Edit bank details (Banking 02 v9): who hears when a customer
 * reports a transfer to this account, by one channel for everyone chosen. Only staff who can
 * already check payments, at the contact they verified; choosing someone grants nothing.
 */
export function PaymentAlertsEditor({
  settings,
  isPending,
  error,
  draft,
  onDraft,
  onUseSaved,
  problem,
  disabled,
  onRetry,
}: {
  settings: AlertSettings | undefined
  isPending: boolean
  error: string | null
  draft: AlertDraft | null
  onDraft: (draft: AlertDraft) => void
  /** Drop this draft and follow the saved settings again. */
  onUseSaved: () => void
  /** Shown once the person has tried to save. */
  problem: AlertProblem | null
  disabled: boolean
  onRetry: () => void
}) {
  const router = useRouter()
  const heading = (
    <View className="gap-1">
      <Text
        accessibilityRole="header"
        className="text-sm font-bold text-foreground"
      >
        Payment alerts
      </Text>
      <Text className="text-xs text-muted-foreground">
        Who hears when a customer reports a transfer to this account.
      </Text>
    </View>
  )
  if (isPending)
    return (
      <View className="gap-3">
        {heading}
        <Skeleton className="h-14 rounded-[14px]" />
        <Text
          accessibilityLiveRegion="polite"
          className="text-xs text-muted-foreground"
        >
          Checking who can get alerts…
        </Text>
      </View>
    )
  if (error || !settings || !draft)
    return (
      <View className="gap-3">
        {heading}
        <StatusBanner
          icon="AlertCircle"
          message={error ?? "Payment alerts couldn't load."}
          tone="destructive"
          actionDisabled={disabled}
          actionLabel="Try again"
          onActionPress={onRetry}
        />
      </View>
    )
  const isNew = settings.accountId === null
  const changed = alertsConflict(settings, draft)
  // Someone saved these alerts while this form was open: both are shown, nothing is chosen for you.
  const review = changed ? (
    <View className="gap-2">
      <StatusBanner
        icon="TriangleAlert"
        title="Payment alerts for this account changed while you were editing."
        message={`Saved now: ${changed.saved}\nYour choices: ${changed.mine}`}
        tone="warning"
        actionDisabled={disabled}
        actionLabel="Keep my choices"
        onActionPress={() => onDraft(keepMyChoices(settings, draft))}
        linkLabel="Use saved settings"
        onLinkPress={onUseSaved}
      />
      {problem === "settings_changed" ? (
        <Text
          accessibilityLiveRegion="polite"
          className="text-sm text-destructive"
        >
          {PROBLEM_TEXT.settings_changed}
        </Text>
      ) : null}
    </View>
  ) : null
  if (!draft.setUp && alertsOffPlan(settings.eligibility))
    return (
      <View className="gap-3">
        {heading}
        {review}
        <StatusBanner
          icon="Info"
          message="Payment alerts aren't on your plan. New reports still show in Payments to check and the bell."
          tone="muted"
          linkLabel="See plans"
          onLinkPress={() => router.push(PLANS_ROUTE)}
        />
      </View>
    )
  if (!draft.setUp)
    return (
      <View className="gap-3">
        {heading}
        {review}
        <Text className="text-sm text-muted-foreground">
          Not set up. New reports show in Payments to check and the bell.
        </Text>
        <View className="flex-row">
          <ActionButton
            disabled={disabled}
            icon="Plus"
            size="sm"
            variant="outline"
            onPress={() => onDraft({ ...draft, setUp: true })}
          >
            Set up payment alerts
          </ActionButton>
        </View>
      </View>
    )
  if (isNew && alertsOffPlan(settings.eligibility))
    return (
      <View className="gap-3">
        {heading}
        <StatusBanner
          icon="Info"
          message="Payment alerts aren't on your plan. New reports still show in Payments to check and the bell."
          tone="muted"
          linkLabel="See plans"
          onLinkPress={() => router.push(PLANS_ROUTE)}
        />
      </View>
    )
  return (
    <View className="gap-4">
      {heading}
      {review}
      {anyoneCanReceive(settings.recipients) ? (
        <AlertsForm
          settings={settings}
          draft={draft}
          onDraft={onDraft}
          problem={problem}
          disabled={disabled}
          onRetry={onRetry}
        />
      ) : (
        <NobodyCanReceive settings={settings} tried={problem !== null} />
      )}
      {canSkipSetup(settings) ? (
        <View className="flex-row">
          <ActionButton
            disabled={disabled}
            size="sm"
            variant="ghost"
            onPress={() => onDraft({ ...draft, setUp: false })}
          >
            Don't set up now
          </ActionButton>
        </View>
      ) : null}
      <InfoNote>
        An alert doesn't record the payment. Whoever gets it checks the bank,
        then confirms in EwaTrade. Payments to check and the bell still show
        every report.
      </InfoNote>
    </View>
  )
}

function AlertsForm({
  settings,
  draft,
  onDraft,
  problem,
  disabled,
  onRetry,
}: {
  settings: AlertSettings
  draft: AlertDraft
  onDraft: (draft: AlertDraft) => void
  problem: AlertProblem | null
  disabled: boolean
  onRetry: () => void
}) {
  const router = useRouter()
  const [picking, setPicking] = useState(false)
  const chosen = draft.recipientUserIds
  const set = (change: Partial<AlertDraft>) => onDraft({ ...draft, ...change })
  const remove = (userId: string) =>
    set({ recipientUserIds: chosen.filter((id) => id !== userId) })
  const toggle = (userId: string) =>
    set({
      recipientUserIds: chosen.includes(userId)
        ? chosen.filter((id) => id !== userId)
        : [...chosen, userId],
    })
  const channel = draft.channel
  const blockers =
    channel && channelOpen(settings.eligibility, channel)
      ? blockersFor(settings.recipients, chosen, channel)
      : []
  const closed = closedChannelAdvice(settings, draft)
  const other = switchOffer(settings, draft)
  const previous = previousChoice(settings, draft)
  const suggested =
    settings.accountId === null &&
    chosen.length === 1 &&
    settings.recipientUserIds.length === 1 &&
    chosen[0] === settings.recipientUserIds[0]
  const problemText = problem ? PROBLEM_TEXT[problem] : undefined
  return (
    <>
      <View className="gap-2">
        <Text className="text-sm font-bold text-foreground">Send to</Text>
        {chosen.length ? (
          <View
            accessibilityLabel="Chosen people"
            className="overflow-hidden rounded-[20px] bg-card shadow-sm"
          >
            {chosen.map((userId, index) => {
              const recipient = settings.recipients.find(
                (row) => row.userId === userId,
              )
              const off =
                !recipient?.canReview ||
                (channel !== null && !canReach(recipient, channel))
              const name = recipient?.name ?? "Someone who left"
              return (
                <View
                  key={userId}
                  className="min-h-[58px] flex-row items-center gap-3 py-2 pl-3.5 pr-1.5"
                >
                  <View className="min-w-0 flex-1">
                    <Text
                      className="text-sm font-bold text-foreground"
                      numberOfLines={1}
                    >
                      {name}
                    </Text>
                    <Text
                      className={cn(
                        "text-xs",
                        off ? "text-destructive" : "text-muted-foreground",
                      )}
                    >
                      {recipient
                        ? recipientRole(recipient)
                        : "Can't check payments"}
                      {recipient?.canReview && off && channel
                        ? channel === "email"
                          ? " · no verified email"
                          : " · no verified phone"
                        : ""}
                    </Text>
                  </View>
                  <Pressable
                    accessibilityLabel={`Remove ${recipient?.name ?? "this person"}`}
                    accessibilityRole="button"
                    accessibilityState={{ disabled }}
                    className="size-11 items-center justify-center rounded-full"
                    disabled={disabled}
                    haptic
                    onPress={() => remove(userId)}
                  >
                    <Icon
                      className="size-[18px] text-muted-foreground"
                      name="X"
                    />
                  </Pressable>
                  {index === chosen.length - 1 ? null : <RowDivider />}
                </View>
              )
            })}
          </View>
        ) : null}
        {suggested ? (
          <Text className="text-xs text-muted-foreground">
            Suggested: you, as the owner. Change it any time.
          </Text>
        ) : null}
        <View className="flex-row">
          <ActionButton
            accessibilityState={{ expanded: picking, disabled }}
            disabled={disabled}
            icon={chosen.length ? "Pencil" : "Plus"}
            size="sm"
            variant="outline"
            onPress={() => setPicking(!picking)}
          >
            {chosen.length ? "Change people" : "Choose people"}
          </ActionButton>
        </View>
        {picking ? (
          <View className="gap-2">
            <View
              accessibilityLabel="People who can check payments"
              className="overflow-hidden rounded-[20px] bg-card shadow-sm"
            >
              {settings.recipients.map((recipient, index) => {
                const where = destination(recipient, channel ?? "email")
                const checked = chosen.includes(recipient.userId)
                const locked = disabled || !recipient.canReview
                return (
                  <Pressable
                    key={recipient.userId}
                    accessibilityLabel={`${recipient.name}. ${recipientRole(recipient)}. ${where.text}`}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked, disabled: locked }}
                    className={cn(
                      "min-h-[62px] flex-row items-center gap-3 px-3.5 py-3",
                      !recipient.canReview && "opacity-60",
                    )}
                    disabled={locked}
                    haptic="selection"
                    onPress={() => toggle(recipient.userId)}
                  >
                    <Icon
                      className={cn(
                        "size-[20px]",
                        checked ? "text-primary" : "text-muted-foreground",
                      )}
                      name={checked ? "CheckSquare" : "Square"}
                    />
                    <View className="min-w-0 flex-1 gap-0.5">
                      <Text
                        className="text-sm font-bold text-foreground"
                        numberOfLines={1}
                      >
                        {recipient.name}
                      </Text>
                      <Text className="text-xs text-muted-foreground">
                        {recipientRole(recipient)}
                      </Text>
                      <View className="flex-row items-center gap-1">
                        <Icon
                          className={cn(
                            "size-[13px]",
                            where.tone === "ok"
                              ? "text-tint-mint-foreground"
                              : where.tone === "warn"
                                ? "text-tint-amber-foreground"
                                : "text-muted-foreground",
                          )}
                          name={
                            where.tone === "ok"
                              ? "CircleCheck"
                              : where.tone === "warn"
                                ? "TriangleAlert"
                                : "Lock"
                          }
                        />
                        <Text
                          className={cn(
                            "min-w-0 flex-1 text-xs",
                            where.tone === "ok"
                              ? "text-tint-mint-foreground"
                              : where.tone === "warn"
                                ? "text-tint-amber-foreground"
                                : "text-muted-foreground",
                          )}
                        >
                          {where.text}
                        </Text>
                      </View>
                    </View>
                    {index === settings.recipients.length - 1 ? null : (
                      <RowDivider />
                    )}
                  </Pressable>
                )
              })}
            </View>
            <Text className="text-xs text-muted-foreground">
              Only staff who can already check payments here. Choosing someone
              gives them no new access.
            </Text>
            <View className="flex-row">
              <ActionButton
                size="sm"
                variant="outline"
                onPress={() => setPicking(false)}
              >
                Done
              </ActionButton>
            </View>
          </View>
        ) : null}
        {problem === "choose_people" && problemText ? (
          <Text
            accessibilityLiveRegion="polite"
            className="text-sm text-destructive"
          >
            {problemText}
          </Text>
        ) : null}
      </View>
      <View accessibilityRole="radiogroup" className="gap-2">
        <Text className="text-sm font-bold text-foreground">
          Send alerts by
        </Text>
        {ALERT_CHANNELS.map((option) => {
          const open = channelOpen(settings.eligibility, option)
          const selected = open && channel === option
          const line = eligibilityLine(settings.eligibility, option)
          const ready = chosen.filter((id) => {
            const recipient = settings.recipients.find(
              (row) => row.userId === id,
            )
            return recipient?.canReview && canReach(recipient, option)
          }).length
          const hint = `${CHANNEL_HINTS[option]}${open && chosen.length ? ` · ${ready} of ${chosen.length} can get it` : ""}`
          return (
            <View key={option} className="gap-1">
              <Pressable
                accessibilityLabel={`${channelName(option)}. ${hint}. ${line.text}`}
                accessibilityRole="radio"
                accessibilityState={{
                  checked: selected,
                  disabled: disabled || !open,
                }}
                // Same border width picked or not: Android blanks a label when it drops.
                className={cn(
                  "min-h-12 flex-row items-start gap-3 rounded-[14px] border px-4 py-3",
                  selected
                    ? "border-primary bg-tint-mint"
                    : "border-border bg-card",
                  !open && "opacity-70",
                )}
                disabled={disabled || !open}
                haptic="selection"
                onPress={() => set({ channel: option })}
              >
                <Icon
                  className={cn(
                    "mt-0.5 size-[20px]",
                    selected ? "text-primary" : "text-muted-foreground",
                  )}
                  name={selected ? "CircleCheck" : "Square"}
                />
                <View className="min-w-0 flex-1 gap-0.5">
                  <Text className="text-sm font-bold text-foreground">
                    {channelName(option)}
                  </Text>
                  <Text className="text-xs text-muted-foreground">{hint}</Text>
                  <Text className="text-xs text-muted-foreground">
                    {line.text}
                  </Text>
                </View>
              </Pressable>
              {line.action ? (
                <View className="flex-row">
                  <Pressable
                    accessibilityLabel={
                      line.action === "plans"
                        ? `See plans for ${channelName(option)} alerts`
                        : "Check your plan again"
                    }
                    accessibilityRole="button"
                    className="min-h-9 justify-center px-1"
                    haptic
                    hitSlop={6}
                    onPress={() =>
                      line.action === "plans"
                        ? router.push(PLANS_ROUTE)
                        : onRetry()
                    }
                  >
                    <Text className="text-xs font-extrabold text-primary">
                      {line.action === "plans" ? "See plans" : "Try again"}
                    </Text>
                  </Pressable>
                </View>
              ) : null}
            </View>
          )
        })}
        {chosen.length > 1 ? (
          <Text className="text-xs text-muted-foreground">
            {`Each report uses one alert per person: ${chosen.length} here.`}
          </Text>
        ) : null}
        {previous && channel ? (
          <Text className="text-xs text-muted-foreground">
            {`Previous choice: ${channelName(previous)}. Alerts stay on ${channelName(channel)} until you choose ${channelName(previous)} again.`}
          </Text>
        ) : null}
        {problem === "choose_channel" && problemText ? (
          <Text
            accessibilityLiveRegion="polite"
            className="text-sm text-destructive"
          >
            {problemText}
          </Text>
        ) : null}
      </View>
      {closed && channel ? (
        closed.kind === "stuck" ? (
          <StatusBanner
            icon="TriangleAlert"
            title={`${channelName(channel)} alerts can't be used right now, and ${names(closed.blockers)} ${cantGet(closed.other, closed.blockers.length)}, so ${channelName(closed.other)} can't take over.`}
            message="New reports still show in Payments to check and the bell. EwaTrade never sends both."
            tone="destructive"
          >
            <BlockerActions
              blockers={closed.blockers}
              channel={closed.other}
              disabled={disabled}
              onRemove={remove}
            />
          </StatusBanner>
        ) : (
          <StatusBanner
            icon="TriangleAlert"
            message={`${channelName(channel)} alerts can't be used right now. Choose ${closed.other ? channelName(closed.other) : "another channel when one is available"}. EwaTrade never sends both.`}
            tone="destructive"
          />
        )
      ) : null}
      {blockers.length && channel ? (
        <StatusBanner
          icon="TriangleAlert"
          title={`${names(blockers)} can't get ${channelName(channel)} alerts.`}
          message={`${
            blockers.length > 1
              ? cantGetReason(channel, true)
              : `${blockers[0]?.firstName} ${cantGetReason(channel, false, blockers[0]?.reason)}`
          } EwaTrade won't send ${channel === "whatsapp" ? "an email" : "a WhatsApp"} instead.`}
          tone="destructive"
        >
          <BlockerActions
            blockers={blockers}
            channel={channel}
            disabled={disabled}
            onRemove={remove}
            switchTo={other}
            onSwitch={(next) => set({ channel: next })}
          />
        </StatusBanner>
      ) : null}
    </>
  )
}

function names(blockers: AlertBlocker[]) {
  return blockers.map((blocker) => blocker.name).join(", ")
}

function cantGet(channel: AlertChannel, count: number) {
  if (channel === "email")
    return count > 1 ? "have no verified email" : "has no verified email"
  return count > 1 ? "have no verified phone" : "has no verified phone"
}

function cantGetReason(
  channel: AlertChannel,
  plural: boolean,
  reason?: AlertBlocker["reason"],
) {
  if (reason === "no_access") return "can no longer check payments."
  if (plural)
    return channel === "whatsapp"
      ? "They have no verified phone."
      : "They have no verified email."
  return channel === "whatsapp"
    ? "has no verified phone."
    : "has no verified email."
}

/** Remove the people who can't get it, switch when everyone can get the other channel, or how to fix it. */
function BlockerActions({
  blockers,
  channel,
  disabled,
  onRemove,
  switchTo,
  onSwitch,
}: {
  blockers: AlertBlocker[]
  channel: AlertChannel
  disabled: boolean
  onRemove: (userId: string) => void
  switchTo?: AlertChannel | null
  onSwitch?: (channel: AlertChannel) => void
}) {
  const first = blockers.find((blocker) => blocker.reason !== "no_access")
  return (
    <View className="mt-2 gap-2">
      <View className="flex-row flex-wrap gap-2">
        {blockers.map((blocker) => (
          <NoteAction
            key={blocker.userId}
            accessibilityLabel={`Remove ${blocker.name}`}
            disabled={disabled}
            onPress={() => onRemove(blocker.userId)}
          >
            {`Remove ${blocker.firstName}`}
          </NoteAction>
        ))}
        {switchTo && onSwitch ? (
          <NoteAction disabled={disabled} onPress={() => onSwitch(switchTo)}>
            {`Use ${channelName(switchTo)} instead`}
          </NoteAction>
        ) : null}
      </View>
      {first ? (
        <Text className="text-xs text-tint-rose-foreground">
          {`${first.firstName} ${channel === "whatsapp" ? "verifies their phone number under Phone sign-in" : "verifies an email in their account"}, signed in as themselves.`}
        </Text>
      ) : null}
    </View>
  )
}

/** A small action inside a tinted note, styled like StatusBanner's own action. */
function NoteAction({
  accessibilityLabel,
  children,
  disabled,
  onPress,
}: {
  accessibilityLabel?: string
  children: string
  disabled?: boolean
  onPress: () => void
}) {
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel ?? children}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      className={cn(
        "min-h-11 items-center justify-center rounded-xl bg-card px-3.5",
        disabled && "opacity-60",
      )}
      disabled={disabled}
      haptic
      onPress={onPress}
    >
      <Text className="text-sm font-bold text-tint-rose-foreground">
        {children}
      </Text>
    </Pressable>
  )
}

function NobodyCanReceive({
  settings,
  tried,
}: {
  settings: AlertSettings
  tried: boolean
}) {
  const router = useRouter()
  return (
    <View className="gap-2">
      <StatusBanner
        icon="Users"
        title="No one can get payment alerts yet."
        message={settings.recipients
          .map(
            (recipient) =>
              `${recipient.name}${recipient.canReview ? " has no verified email or verified phone." : " can't check payments."}`,
          )
          .join("\n")}
        tone="warning"
        actionLabel="Verify your phone"
        onActionPress={() => router.push(PHONE_ROUTE)}
      />
      {tried ? (
        <Text
          accessibilityLiveRegion="polite"
          className="text-sm text-destructive"
        >
          {PROBLEM_TEXT.nobody_can_receive}
        </Text>
      ) : null}
    </View>
  )
}
