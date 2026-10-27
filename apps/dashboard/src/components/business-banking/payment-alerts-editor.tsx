"use client"
import { Button, Checkbox, RadioGroup, RadioGroupItem, cn } from "@ewatrade/ui"
import {
  ALERT_CHANNELS,
  type AlertBlocker,
  type AlertChannel,
  type AlertDraft,
  type AlertProblem,
  type AlertSettings,
  type AlertsConflict,
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
import {
  Add01Icon,
  Alert02Icon,
  Cancel01Icon,
  CheckmarkCircle02Icon,
  LockIcon,
  PencilEdit02Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import Link from "next/link"
import { type ReactNode, useId, useState } from "react"

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
  const headingId = useId()
  const heading = (
    <div className="grid gap-0.5" id={headingId}>
      <b className="text-sm font-medium">Payment alerts</b>
      <span className="text-sm text-muted-foreground">
        Who hears when a customer reports a transfer to this account.
      </span>
    </div>
  )
  if (isPending)
    return (
      <section aria-labelledby={headingId} className="grid gap-3">
        {heading}
        <output className="text-sm text-muted-foreground">
          Checking who can get alerts…
        </output>
      </section>
    )
  if (error || !settings || !draft)
    return (
      <section aria-labelledby={headingId} className="grid gap-3">
        {heading}
        <Note tone="bad">
          {error ?? "Payment alerts couldn't load."}{" "}
          <Button type="button" variant="link" size="sm" onClick={onRetry}>
            Try again
          </Button>
        </Note>
      </section>
    )
  const isNew = settings.accountId === null
  const changed = alertsConflict(settings, draft)
  const review = changed ? (
    <ConflictReview
      conflict={changed}
      tried={problem === "settings_changed"}
      disabled={disabled}
      onKeep={() => onDraft(keepMyChoices(settings, draft))}
      onUseSaved={onUseSaved}
    />
  ) : null
  if (!draft.setUp && alertsOffPlan(settings.eligibility))
    return (
      <section aria-labelledby={headingId} className="grid gap-3">
        {heading}
        {review}
        <Note tone="info">
          Payment alerts aren't on your plan. New reports still show in Payments
          to check and the bell.{" "}
          <Link href="/settings/billing" className="underline">
            See plans
          </Link>
        </Note>
      </section>
    )
  if (!draft.setUp)
    return (
      <section aria-labelledby={headingId} className="grid gap-3">
        {heading}
        {review}
        <p className="text-sm text-muted-foreground">
          Not set up. New reports show in Payments to check and the bell.
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="justify-self-start"
          disabled={disabled}
          onClick={() => onDraft({ ...draft, setUp: true })}
        >
          <HugeiconsIcon icon={Add01Icon} data-icon="inline-start" />
          Set up payment alerts
        </Button>
      </section>
    )
  if (isNew && alertsOffPlan(settings.eligibility))
    return (
      <section aria-labelledby={headingId} className="grid gap-3">
        {heading}
        <Note tone="info">
          Payment alerts aren't on your plan. New reports still show in Payments
          to check and the bell.{" "}
          <Link href="/settings/billing" className="underline">
            See plans
          </Link>
        </Note>
      </section>
    )
  return (
    <section aria-labelledby={headingId} className="grid gap-4">
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
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="justify-self-start"
          disabled={disabled}
          onClick={() => onDraft({ ...draft, setUp: false })}
        >
          Don't set up now
        </Button>
      ) : null}
      <p className="text-xs text-muted-foreground">
        An alert doesn't record the payment. Whoever gets it checks the bank,
        then confirms in EwaTrade. Payments to check and the bell still show
        every report.
      </p>
    </section>
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
  const [picking, setPicking] = useState(false)
  const pickerId = useId()
  const channelLabelId = useId()
  const chosen = draft.recipientUserIds
  const set = (change: Partial<AlertDraft>) => onDraft({ ...draft, ...change })
  const remove = (userId: string) =>
    set({ recipientUserIds: chosen.filter((id) => id !== userId) })
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
      <div className="grid gap-2">
        <span className="text-sm font-medium">Send to</span>
        {chosen.length ? (
          <ul aria-label="Chosen people" className="grid gap-2">
            {chosen.map((userId) => {
              const recipient = settings.recipients.find(
                (row) => row.userId === userId,
              )
              const off =
                !recipient?.canReview ||
                (channel !== null && !canReach(recipient, channel))
              return (
                <li
                  key={userId}
                  className={cn(
                    "flex items-center gap-3 rounded-lg border px-3 py-2 text-sm",
                    off && "border-destructive/40 bg-destructive/5",
                  )}
                >
                  <span className="grid min-w-0 flex-1">
                    <b className="truncate font-medium">
                      {recipient?.name ?? "Someone who left"}
                    </b>
                    <small className="truncate text-xs text-muted-foreground">
                      {recipient
                        ? recipientRole(recipient)
                        : "Can't check payments"}
                      {recipient?.canReview && off && channel
                        ? channel === "email"
                          ? " · no verified email"
                          : " · no verified phone"
                        : ""}
                    </small>
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    disabled={disabled}
                    aria-label={`Remove ${recipient?.name ?? "this person"}`}
                    onClick={() => remove(userId)}
                  >
                    <HugeiconsIcon icon={Cancel01Icon} className="size-4" />
                  </Button>
                </li>
              )
            })}
          </ul>
        ) : null}
        {suggested ? (
          <p className="text-xs text-muted-foreground">
            Suggested: you, as the owner. Change it any time.
          </p>
        ) : null}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="justify-self-start"
          disabled={disabled}
          aria-expanded={picking}
          aria-controls={pickerId}
          onClick={() => setPicking(!picking)}
        >
          <HugeiconsIcon
            icon={chosen.length ? PencilEdit02Icon : Add01Icon}
            data-icon="inline-start"
          />
          {chosen.length ? "Change people" : "Choose people"}
        </Button>
        {picking ? (
          <fieldset
            id={pickerId}
            className="grid gap-1 rounded-lg border p-2"
            aria-label="People who can check payments"
          >
            {settings.recipients.map((recipient) => {
              const where = destination(recipient, channel ?? "email")
              return (
                <label
                  key={recipient.userId}
                  htmlFor={`${pickerId}-${recipient.userId}`}
                  className={cn(
                    "flex items-center gap-3 rounded-md px-2 py-2 text-sm",
                    recipient.canReview
                      ? "cursor-pointer hover:bg-muted/50"
                      : "opacity-60",
                  )}
                >
                  <Checkbox
                    id={`${pickerId}-${recipient.userId}`}
                    checked={chosen.includes(recipient.userId)}
                    disabled={disabled || !recipient.canReview}
                    onCheckedChange={(checked) =>
                      set({
                        recipientUserIds: checked
                          ? [...chosen, recipient.userId]
                          : chosen.filter((id) => id !== recipient.userId),
                      })
                    }
                  />
                  <span className="grid min-w-0 flex-1">
                    <b className="truncate font-medium">{recipient.name}</b>
                    <small className="truncate text-xs text-muted-foreground">
                      {recipientRole(recipient)}
                    </small>
                  </span>
                  <span
                    className={cn(
                      "flex shrink-0 items-center gap-1 text-xs",
                      where.tone === "ok" &&
                        "text-emerald-700 dark:text-emerald-400",
                      where.tone === "warn" &&
                        "text-amber-700 dark:text-amber-400",
                      where.tone === "none" && "text-muted-foreground",
                    )}
                  >
                    <HugeiconsIcon
                      icon={
                        where.tone === "ok"
                          ? CheckmarkCircle02Icon
                          : where.tone === "warn"
                            ? Alert02Icon
                            : LockIcon
                      }
                      className="size-3.5"
                      aria-hidden
                    />
                    {where.text}
                  </span>
                </label>
              )
            })}
            <div className="flex items-center justify-between gap-3 px-2 pt-1">
              <span className="text-xs text-muted-foreground">
                Only staff who can already check payments here. Choosing someone
                gives them no new access.
              </span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setPicking(false)}
              >
                Done
              </Button>
            </div>
          </fieldset>
        ) : null}
        {problem === "choose_people" && problemText ? (
          <p role="alert" className="text-sm text-destructive">
            {problemText}
          </p>
        ) : null}
      </div>
      <div className="grid gap-2">
        <span className="text-sm font-medium" id={channelLabelId}>
          Send alerts by
        </span>
        <RadioGroup
          aria-labelledby={channelLabelId}
          value={
            channel && channelOpen(settings.eligibility, channel) ? channel : ""
          }
          onValueChange={(value) => set({ channel: value as AlertChannel })}
          className="grid gap-2 sm:grid-cols-2"
        >
          {ALERT_CHANNELS.map((option) => {
            const open = channelOpen(settings.eligibility, option)
            const line = eligibilityLine(settings.eligibility, option)
            const ready = chosen.filter((id) => {
              const recipient = settings.recipients.find(
                (row) => row.userId === id,
              )
              return recipient?.canReview && canReach(recipient, option)
            }).length
            return (
              <label
                key={option}
                htmlFor={`${channelLabelId}-${option}`}
                className={cn(
                  "grid gap-1 rounded-lg border p-3 text-sm",
                  open ? "cursor-pointer" : "opacity-70",
                  open && channel === option && "border-foreground",
                )}
              >
                <span className="flex items-start gap-2">
                  <RadioGroupItem
                    id={`${channelLabelId}-${option}`}
                    value={option}
                    disabled={disabled || !open}
                    className="mt-0.5"
                  />
                  <span className="grid gap-0.5">
                    <b className="font-medium">{channelName(option)}</b>
                    <small className="text-xs text-muted-foreground">
                      {CHANNEL_HINTS[option]}
                      {open && chosen.length
                        ? ` · ${ready} of ${chosen.length} can get it`
                        : ""}
                    </small>
                  </span>
                </span>
                <small className="pl-6 text-xs text-muted-foreground">
                  {line.text}{" "}
                  {line.action === "plans" ? (
                    <Link href="/settings/billing" className="underline">
                      See plans
                    </Link>
                  ) : line.action === "retry" ? (
                    <button
                      type="button"
                      className="underline"
                      onClick={onRetry}
                    >
                      Try again
                    </button>
                  ) : null}
                </small>
              </label>
            )
          })}
        </RadioGroup>
        {chosen.length > 1 ? (
          <p className="text-xs text-muted-foreground">
            Each report uses one alert per person: {chosen.length} here.
          </p>
        ) : null}
        {previous && channel ? (
          <p className="text-xs text-muted-foreground">
            Previous choice: {channelName(previous)}. Alerts stay on{" "}
            {channelName(channel)} until you choose {channelName(previous)}{" "}
            again.
          </p>
        ) : null}
        {problem === "choose_channel" && problemText ? (
          <p role="alert" className="text-sm text-destructive">
            {problemText}
          </p>
        ) : null}
      </div>
      {closed && channel ? (
        closed.kind === "stuck" ? (
          <Note tone="bad" role="alert">
            <b>
              {channelName(channel)} alerts can't be used right now, and{" "}
              {names(closed.blockers)}{" "}
              {cantGet(closed.other, closed.blockers.length)}, so{" "}
              {channelName(closed.other)} can't take over.
            </b>{" "}
            New reports still show in Payments to check and the bell. EwaTrade
            never sends both.
            <BlockerActions
              blockers={closed.blockers}
              channel={closed.other}
              disabled={disabled}
              onRemove={remove}
            />
          </Note>
        ) : (
          <Note tone="bad" role="alert">
            {channelName(channel)} alerts can't be used right now. Choose{" "}
            {closed.other
              ? channelName(closed.other)
              : "another channel when one is available"}
            . EwaTrade never sends both.
          </Note>
        )
      ) : null}
      {blockers.length && channel ? (
        <Note tone="bad" role="alert">
          <b>
            {names(blockers)} can't get {channelName(channel)} alerts.
          </b>{" "}
          {blockers.length > 1
            ? cantGetReason(channel, true)
            : `${blockers[0]?.firstName} ${cantGetReason(channel, false, blockers[0]?.reason)}`}{" "}
          EwaTrade won't send{" "}
          {channel === "whatsapp" ? "an email" : "a WhatsApp"} instead.
          <BlockerActions
            blockers={blockers}
            channel={channel}
            disabled={disabled}
            onRemove={remove}
            switchTo={other}
            onSwitch={(next) => set({ channel: next })}
          />
        </Note>
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
    <span className="mt-2 grid gap-2">
      <span className="flex flex-wrap gap-2">
        {blockers.map((blocker) => (
          <Button
            key={blocker.userId}
            type="button"
            size="sm"
            variant="outline"
            disabled={disabled}
            onClick={() => onRemove(blocker.userId)}
          >
            Remove {blocker.firstName}
          </Button>
        ))}
        {switchTo && onSwitch ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={disabled}
            onClick={() => onSwitch(switchTo)}
          >
            Use {channelName(switchTo)} instead
          </Button>
        ) : null}
      </span>
      {first ? (
        <small className="text-xs">
          {first.firstName}{" "}
          {channel === "whatsapp"
            ? "verifies their phone number under Phone sign-in in the EwaTrade app"
            : "verifies an email in their account"}
          , signed in as themselves.
        </small>
      ) : null}
    </span>
  )
}

/** Someone saved these alerts while this form was open: both are shown, nothing is chosen for you. */
function ConflictReview({
  conflict,
  tried,
  disabled,
  onKeep,
  onUseSaved,
}: {
  conflict: AlertsConflict
  tried: boolean
  disabled: boolean
  onKeep: () => void
  onUseSaved: () => void
}) {
  return (
    <Note tone="warn" role="alert">
      <b>Payment alerts for this account changed while you were editing.</b>
      <span className="mt-1 block">Saved now: {conflict.saved}</span>
      <span className="block">Your choices: {conflict.mine}</span>
      <span className="mt-2 flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={disabled}
          onClick={onKeep}
        >
          Keep my choices
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={disabled}
          onClick={onUseSaved}
        >
          Use saved settings
        </Button>
      </span>
      {tried ? (
        <span className="mt-2 block text-destructive">
          {PROBLEM_TEXT.settings_changed}
        </span>
      ) : null}
    </Note>
  )
}

function NobodyCanReceive({
  settings,
  tried,
}: {
  settings: AlertSettings
  tried: boolean
}) {
  return (
    <Note tone="warn">
      <b>No one can get payment alerts yet.</b>
      {settings.recipients.map((recipient) => (
        <span key={recipient.userId} className="block">
          {recipient.name}
          {recipient.canReview
            ? " has no verified email or verified phone."
            : " can't check payments."}
        </span>
      ))}
      <span className="mt-2 block">
        A phone is verified under Phone sign-in in the EwaTrade app, signed in
        as that person.
      </span>
      <span className="mt-2 flex flex-wrap gap-2">
        <Button size="sm" variant="outline" render={<Link href="/staff" />}>
          Staff access
        </Button>
      </span>
      {tried ? (
        <span role="alert" className="mt-2 block text-destructive">
          {PROBLEM_TEXT.nobody_can_receive}
        </span>
      ) : null}
    </Note>
  )
}

function Note({
  tone,
  role,
  children,
}: {
  tone: "bad" | "warn" | "info"
  role?: "alert"
  children: ReactNode
}) {
  return (
    <div
      role={role}
      className={cn(
        "rounded-lg border px-3 py-2 text-sm",
        tone === "bad" && "border-destructive/40 bg-destructive/5",
        tone === "warn" && "border-amber-500/30 bg-amber-500/5",
        tone === "info" && "border-border bg-muted/40",
      )}
    >
      {children}
    </div>
  )
}
