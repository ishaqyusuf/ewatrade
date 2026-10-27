import type {
  PaymentNotificationChannel,
  PaymentNotificationChannelEligibility,
  PaymentReportNotificationEligibility,
} from "./payment-report-notification-policy"

/**
 * Payment alerts per bank account (Workshop Banking 02 v9, a541f574): who hears when a customer
 * reports a transfer, by ONE channel for everyone chosen. Pure rules shared by the add/edit
 * form, the account summary and plan-change notices. The server revalidates every save; these
 * rules only keep the form honest and fail closed.
 */
export type AlertChannel = PaymentNotificationChannel

export type AlertRecipient = {
  userId: string
  name: string
  role: string
  canReview: boolean
  /** Masked display values, null when missing. */
  email: string | null
  phone: string | null
  emailVerified: boolean
  phoneVerified: boolean
}

export type AlertSettings = {
  accountId: string | null
  revision: number
  recipientUserIds: string[]
  /** The saved choice. */
  channel: AlertChannel | null
  /** What new alerts actually use now; null when paused. */
  effectiveChannel: AlertChannel | null
  recipients: AlertRecipient[]
  eligibility: PaymentReportNotificationEligibility
}

/** As the accounts list sends it; channels are narrowed when shown. */
export type AccountAlertsSummary = {
  revision: number
  recipientNames: string[]
  channel: string | null
  effectiveChannel: string | null
}

export type AlertDraft = {
  /** False for an existing account without alerts until someone sets them up. */
  setUp: boolean
  recipientUserIds: string[]
  channel: AlertChannel | null
  /**
   * The settings revision this draft started from. A background refresh never moves it: only
   * the person's explicit "Keep my choices" does, so a save can't overwrite settings they
   * haven't seen.
   */
  baseRevision: number
}

export const ALERT_CHANNELS = ["email", "whatsapp"] as const

/** A channel from the server, or null for anything this client doesn't know (fails closed). */
export function alertChannel(
  value: string | null | undefined,
): AlertChannel | null {
  return value === "email" || value === "whatsapp" ? value : null
}

/** The settings read as the form uses it. */
export function alertSettingsFrom(
  raw: Omit<AlertSettings, "channel" | "effectiveChannel"> & {
    channel: string | null
    effectiveChannel: string | null
  },
): AlertSettings {
  return {
    ...raw,
    channel: alertChannel(raw.channel),
    effectiveChannel: alertChannel(raw.effectiveChannel),
  }
}

const ROLE_LABELS: Record<string, string> = {
  OWNER: "Owner",
  ADMIN: "Admin",
  MANAGER: "Manager",
  CASHIER: "Cashier",
  OPERATOR: "Operator",
  SUPPORT: "Support",
  MEMBER: "Member",
}

export function recipientRole(recipient: AlertRecipient) {
  const role = ROLE_LABELS[recipient.role] ?? recipient.role
  return recipient.canReview ? role : `${role} · can't check payments`
}

export function channelName(channel: AlertChannel) {
  return channel === "email" ? "Email" : "WhatsApp"
}

export function otherChannel(channel: AlertChannel): AlertChannel {
  return channel === "email" ? "whatsapp" : "email"
}

/** Only a fresh "available" answer can be chosen; loading, unknown and errors fail closed. */
export function channelOpen(
  eligibility: PaymentReportNotificationEligibility | null | undefined,
  channel: AlertChannel,
) {
  return eligibility?.channels[channel]?.available === true
}

export function canReach(recipient: AlertRecipient, channel: AlertChannel) {
  return channel === "email"
    ? recipient.emailVerified && recipient.email !== null
    : recipient.phoneVerified && recipient.phone !== null
}

/** Someone chosen who can't get this channel, or who can no longer check payments. */
export type AlertBlocker = {
  userId: string
  name: string
  firstName: string
  reason: "no_email" | "no_whatsapp" | "no_access"
}

function person(recipients: AlertRecipient[], userId: string) {
  return recipients.find((recipient) => recipient.userId === userId)
}

function firstName(name: string) {
  return name.trim().split(/\s+/)[0] || name
}

export function blockersFor(
  recipients: AlertRecipient[],
  userIds: string[],
  channel: AlertChannel,
): AlertBlocker[] {
  return userIds.flatMap((userId): AlertBlocker[] => {
    const recipient = person(recipients, userId)
    if (!recipient?.canReview) {
      const name = recipient?.name ?? "Someone"
      return [{ userId, name, firstName: firstName(name), reason: "no_access" }]
    }
    if (canReach(recipient, channel)) return []
    return [
      {
        userId,
        name: recipient.name,
        firstName: firstName(recipient.name),
        reason: channel === "email" ? "no_email" : "no_whatsapp",
      },
    ]
  })
}

/** At least one person who can check payments has a verified email or a verified phone. */
export function anyoneCanReceive(recipients: AlertRecipient[]) {
  return recipients.some(
    (recipient) =>
      recipient.canReview &&
      (canReach(recipient, "email") || canReach(recipient, "whatsapp")),
  )
}

/**
 * "Email verified · a•••@mamaada.ng", "WhatsApp · verified phone ••0142", or why not. A phone
 * counts once it is verified on the person's account; no assistant connection is needed.
 */
export function destination(recipient: AlertRecipient, channel: AlertChannel) {
  if (!recipient.canReview)
    return { tone: "none" as const, text: "Can't check payments" }
  if (canReach(recipient, channel))
    return {
      tone: "ok" as const,
      text:
        channel === "email"
          ? `Email verified · ${recipient.email}`
          : `WhatsApp · verified phone ${recipient.phone}`,
    }
  return {
    tone: "warn" as const,
    text: channel === "email" ? "No verified email" : "No verified phone",
  }
}

function resetsOn(eligibility: PaymentReportNotificationEligibility) {
  return new Intl.DateTimeFormat("en-NG", {
    day: "numeric",
    month: "short",
    timeZone: eligibility.period.timeZone,
  }).format(new Date(eligibility.period.resetsAt))
}

function count(value: number) {
  return value.toLocaleString("en-NG")
}

/** The plan line under each channel: allowance, or why it can't be chosen. */
export function eligibilityLine(
  eligibility: PaymentReportNotificationEligibility | null | undefined,
  channel: AlertChannel,
  loading = false,
): { text: string; action: "plans" | "retry" | null } {
  if (loading || !eligibility)
    return loading
      ? { text: "Checking your plan…", action: null }
      : { text: "Can't check your plan right now.", action: "retry" }
  const state: PaymentNotificationChannelEligibility | undefined =
    eligibility.channels[channel]
  if (!state)
    return { text: "Can't check your plan right now.", action: "retry" }
  if (state.reason === "available") {
    if (state.budget.kind === "unlimited")
      return { text: "No monthly limit on your plan", action: null }
    if (state.budget.kind === "limited" && state.remaining !== null)
      return {
        text: `${count(state.remaining)} of ${count(state.budget.limit)} left this month`,
        action: null,
      }
    return { text: "Can't check your plan right now.", action: "retry" }
  }
  if (state.reason === "plan_disabled")
    return { text: "Not on your plan.", action: "plans" }
  if (state.reason === "quota_exhausted")
    return {
      text:
        state.budget.kind === "limited"
          ? `All ${count(state.budget.limit)} used this month. Resets ${resetsOn(eligibility)}.`
          : `None left this month. Resets ${resetsOn(eligibility)}.`,
      action: "plans",
    }
  return { text: "Can't check your plan right now.", action: "retry" }
}

/** No channel can be offered on the plan at all (not a temporary error). */
export function alertsOffPlan(
  eligibility: PaymentReportNotificationEligibility | null | undefined,
) {
  return (
    !!eligibility &&
    ALERT_CHANNELS.every((channel) => {
      const reason = eligibility.channels[channel]?.reason
      return reason === "plan_disabled" || reason === "policy_missing"
    })
  )
}

/**
 * The form's starting point. An existing account opens on the channel its alerts use now
 * (with the saved one shown as the previous choice); a paused account keeps its saved channel
 * so the block is visible. A new account starts with alerts off: adding a bank never waits on
 * alerts. If someone sets them up, the owner is suggested and no channel is chosen for them.
 */
export function initialDraft(settings: AlertSettings): AlertDraft {
  const recipientUserIds = [...settings.recipientUserIds]
  const baseRevision = settings.revision
  if (settings.accountId) {
    const channel = settings.effectiveChannel ?? settings.channel
    return { setUp: channel !== null, recipientUserIds, channel, baseRevision }
  }
  return { setUp: false, recipientUserIds, channel: null, baseRevision }
}

/**
 * "Don't set up now" is offered only while nothing is saved (a new account, or an existing one
 * that never had alerts). Saved alerts, running or paused, stay until someone fixes them.
 */
export function canSkipSetup(settings: AlertSettings) {
  return (
    settings.accountId === null ||
    (settings.channel === null && settings.effectiveChannel === null)
  )
}

function sameChoices(left: AlertDraft, right: AlertDraft) {
  return (
    left.setUp === right.setUp &&
    left.channel === right.channel &&
    sameIds(left.recipientUserIds, right.recipientUserIds)
  )
}

/** Both sides of a settings conflict, in words. */
export type AlertsConflict = { saved: string; mine: string }

function choiceLine(
  settings: AlertSettings,
  choice: { setUp: boolean; channel: AlertChannel | null; ids: string[] },
  paused = false,
) {
  if (!choice.setUp) return "Not set up"
  const people = choice.ids.length
    ? choice.ids
        .map(
          (id) => person(settings.recipients, id)?.name ?? "someone who left",
        )
        .join(", ")
    : "nobody yet"
  const how = choice.channel ? channelName(choice.channel) : "No channel"
  return `${paused ? "Paused · " : ""}${how} to ${people}`
}

/**
 * Someone else saved this account's alerts after this draft started, and the draft says
 * something different. Both are shown until the person keeps theirs or takes the saved ones;
 * nothing is rebased or discarded on their behalf.
 */
export function alertsConflict(
  settings: AlertSettings,
  draft: AlertDraft,
): AlertsConflict | null {
  if (draft.baseRevision === settings.revision) return null
  const latest = initialDraft(settings)
  if (sameChoices(draft, latest)) return null
  return {
    saved: choiceLine(
      settings,
      {
        setUp: latest.setUp,
        channel: settings.channel,
        ids: latest.recipientUserIds,
      },
      latest.setUp && settings.effectiveChannel === null,
    ),
    mine: choiceLine(settings, {
      setUp: draft.setUp,
      channel: draft.channel,
      ids: draft.recipientUserIds,
    }),
  }
}

/** The person's explicit choice to save their draft over the settings they have now seen. */
export function keepMyChoices(
  settings: AlertSettings,
  draft: AlertDraft,
): AlertDraft {
  return { ...draft, baseRevision: settings.revision }
}

export type AlertProblem =
  | "checking_plan"
  | "settings_changed"
  | "nobody_can_receive"
  | "choose_people"
  | "choose_channel"
  | "channel_closed"
  | "missing_contacts"

/**
 * What the form sends with the bank details, or why it can't save yet. Nothing is sent, and
 * nothing blocks, when alerts aren't set up (whatever the plan or its loading state), haven't
 * changed, or (new account) aren't on the plan at all; the server then keeps the current
 * settings. Only once someone sets alerts up do people, contacts and the channel have to check out.
 */
export function alertsSubmission(input: {
  settings: AlertSettings | null
  draft: AlertDraft | null
  loading: boolean
}):
  | { send: false; problem: AlertProblem | null }
  | {
      send: true
      problem: AlertProblem | null
      payload: {
        recipientUserIds: string[]
        channel: AlertChannel
        expectedRevision: number
      }
    } {
  const { settings, draft } = input
  if (!draft?.setUp) return { send: false, problem: null }
  if (input.loading || !settings)
    return { send: false, problem: "checking_plan" }
  const isNew = settings.accountId === null
  if (isNew && alertsOffPlan(settings.eligibility))
    return { send: false, problem: null }
  // Settings changed under this draft: hold until the person reviews them.
  if (alertsConflict(settings, draft))
    return { send: false, problem: "settings_changed" }
  // Alerts that are running and untouched stay as they are. Paused alerts are never
  // "unchanged": the form keeps showing why until someone fixes them.
  if (
    !isNew &&
    settings.effectiveChannel !== null &&
    draft.channel === settings.effectiveChannel &&
    sameIds(draft.recipientUserIds, settings.recipientUserIds)
  )
    return { send: false, problem: null }
  const problem: AlertProblem | null = !anyoneCanReceive(settings.recipients)
    ? "nobody_can_receive"
    : !draft.recipientUserIds.length
      ? "choose_people"
      : !draft.channel
        ? "choose_channel"
        : !channelOpen(settings.eligibility, draft.channel)
          ? "channel_closed"
          : blockersFor(
                settings.recipients,
                draft.recipientUserIds,
                draft.channel,
              ).length
            ? "missing_contacts"
            : null
  if (!draft.channel) return { send: false, problem }
  return {
    send: true,
    problem,
    payload: {
      recipientUserIds: [...draft.recipientUserIds],
      channel: draft.channel,
      // The revision the draft started from. Past the conflict check it can only be older
      // when the draft already matches what is saved now, so nothing newer is overwritten.
      expectedRevision: sameChoices(draft, initialDraft(settings))
        ? settings.revision
        : draft.baseRevision,
    },
  }
}

function sameIds(left: string[], right: string[]) {
  return left.length === right.length && left.every((id) => right.includes(id))
}

/**
 * The chosen channel is closed. It points at the other one only when everyone chosen can get
 * it; otherwise it names who can't, because EwaTrade never sends both.
 */
export function closedChannelAdvice(
  settings: AlertSettings,
  draft: AlertDraft,
):
  | null
  | { kind: "stuck"; other: AlertChannel; blockers: AlertBlocker[] }
  | { kind: "switch"; other: AlertChannel | null } {
  if (!draft.channel || channelOpen(settings.eligibility, draft.channel))
    return null
  const other = otherChannel(draft.channel)
  if (!channelOpen(settings.eligibility, other))
    return { kind: "switch", other: null }
  const blockers = blockersFor(
    settings.recipients,
    draft.recipientUserIds,
    other,
  )
  return blockers.length
    ? { kind: "stuck", other, blockers }
    : { kind: "switch", other }
}

/** "Use WhatsApp instead" only when it's open and everyone chosen can get it. */
export function switchOffer(settings: AlertSettings, draft: AlertDraft) {
  if (!draft.channel) return null
  const other = otherChannel(draft.channel)
  return channelOpen(settings.eligibility, other) &&
    draft.recipientUserIds.length > 0 &&
    blockersFor(settings.recipients, draft.recipientUserIds, other).length === 0
    ? other
    : null
}

/** "Previous choice: WhatsApp" while alerts use another channel because it's closed. */
export function previousChoice(settings: AlertSettings, draft: AlertDraft) {
  const saved = settings.channel
  return saved &&
    draft.channel &&
    saved !== draft.channel &&
    !channelOpen(settings.eligibility, saved)
    ? saved
    : null
}

/** The read-only row on a bank account card. Null when alerts were never set up. */
export function accountAlertsRow(summary: AccountAlertsSummary | null) {
  const saved = alertChannel(summary?.channel)
  if (!summary || !saved) return null
  const effective = alertChannel(summary.effectiveChannel)
  return {
    icon: effective ?? ("paused" as const),
    label: effective ? channelName(effective) : "Paused · action needed",
    names: summary.recipientNames.join(", "),
    previous:
      effective !== saved ? `Previous choice: ${channelName(saved)}` : null,
  }
}

export type AlertDeliveryStatus =
  | "pending"
  | "sending"
  | "sent"
  | "failed"
  | "unknown"
  | "cancelled"

/**
 * One person's alert for a report, shown to staff who can see the review. No destination or
 * provider detail; an unconfirmed delivery is never presented as safe to send again.
 */
const DELIVERY_BADGES = {
  pending: { label: "Waiting to send", tone: "info" as const },
  sending: { label: "Sending", tone: "info" as const },
  sent: { label: "Sent", tone: "ok" as const },
  failed: { label: "Couldn't send", tone: "bad" as const },
  unknown: { label: "Delivery unconfirmed", tone: "warn" as const },
  cancelled: { label: "Not sent", tone: "none" as const },
}

/** While a retry the server accepted is being queued and the report re-read. */
export const retryingBadge = { label: "Trying again", tone: "info" as const }

/** A status this client doesn't know reads as unconfirmed, never as sent or safe to resend. */
export function deliveryBadge(status: AlertDeliveryStatus | (string & {})) {
  return (
    DELIVERY_BADGES[status as AlertDeliveryStatus] ?? DELIVERY_BADGES.unknown
  )
}

export type PlanChangeNotice = {
  id: string
  policyRevision: number
  createdAt: string
  title: string
  description: string
  kind:
    | "whatsapp_disabled"
    | "whatsapp_available"
    | "limits_changed"
    | "action_required"
  accountIds: string[]
  /** Set only when every account named is in the same book. */
  bookId: string | null
  readAt: string | null
}

export type NoticeReview =
  | { kind: "account"; accountId: string }
  | { kind: "accounts"; message: string }

/**
 * Where "Review settings" goes. Only a notice about one account in the book open here goes
 * straight to that account; anything else opens Money accounts with what to do, never a
 * guessed account or another book's account.
 */
export function noticeReview(
  notice: Pick<PlanChangeNotice, "accountIds" | "bookId">,
  currentBookId: string | null | undefined,
): NoticeReview {
  const sameBook = !!notice.bookId && notice.bookId === currentBookId
  const [only, ...rest] = notice.accountIds
  if (sameBook && only && !rest.length)
    return { kind: "account", accountId: only }
  if (sameBook && rest.length)
    return {
      kind: "accounts",
      message: `This affects ${notice.accountIds.length} bank accounts. Check payment alerts on each one in Money accounts.`,
    }
  return {
    kind: "accounts",
    message:
      "Check payment alerts on the bank accounts this affects in Money accounts.",
  }
}

/** Any kind this client doesn't know reads as plain information. */
export function noticeTone(kind: PlanChangeNotice["kind"] | (string & {})) {
  return kind === "action_required"
    ? ("bad" as const)
    : kind === "whatsapp_disabled"
      ? ("warn" as const)
      : ("info" as const)
}
