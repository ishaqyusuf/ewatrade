import { expect, test } from "bun:test"
import {
  type AlertRecipient,
  type AlertSettings,
  accountAlertsRow,
  alertsConflict,
  alertsSubmission,
  canSkipSetup,
  closedChannelAdvice,
  deliveryBadge,
  destination,
  eligibilityLine,
  initialDraft,
  keepMyChoices,
  noticeReview,
  previousChoice,
  retryingBadge,
  switchOffer,
} from "./payment-alerts-view"
import type {
  PaymentNotificationChannelEligibility,
  PaymentReportNotificationEligibility,
} from "./payment-report-notification-policy"

const adaeze: AlertRecipient = {
  userId: "adaeze",
  name: "Adaeze Okafor",
  role: "Owner",
  canReview: true,
  email: "a•••@mamaada.ng",
  phone: "••0142",
  emailVerified: true,
  phoneVerified: true,
}
const kemi: AlertRecipient = {
  userId: "kemi",
  name: "Kemi Balogun",
  role: "Manager",
  canReview: true,
  email: "k•••@mamaada.ng",
  phone: null,
  emailVerified: true,
  phoneVerified: false,
}
const bisi: AlertRecipient = {
  userId: "bisi",
  name: "Bisi Musa",
  role: "Cashier",
  canReview: true,
  email: null,
  phone: "••7731",
  emailVerified: false,
  phoneVerified: true,
}
const sola: AlertRecipient = {
  userId: "sola",
  name: "Sola Ade",
  role: "Stock keeper",
  canReview: false,
  email: "s•••@mamaada.ng",
  phone: null,
  emailVerified: true,
  phoneVerified: false,
}

function channel(
  over: Partial<PaymentNotificationChannelEligibility> = {},
): PaymentNotificationChannelEligibility {
  return {
    available: true,
    enabled: true,
    budget: { kind: "limited", limit: 1000 },
    used: 312,
    reserved: 0,
    remaining: 688,
    reason: "available",
    ...over,
  }
}
const off = channel({
  available: false,
  enabled: false,
  remaining: 0,
  reason: "plan_disabled",
})
const unknown = channel({
  available: false,
  enabled: false,
  budget: { kind: "unknown", limit: null },
  used: null,
  reserved: null,
  remaining: null,
  reason: "unavailable",
})

function eligibility(
  email = channel(),
  whatsapp = channel({
    budget: { kind: "limited", limit: 300 },
    used: 140,
    remaining: 160,
  }),
): PaymentReportNotificationEligibility {
  return {
    schemaVersion: 1,
    scope: "payment_report",
    policyRevision: 4,
    planId: "growth",
    period: {
      startsAt: "2026-10-01T00:00:00.000Z",
      resetsAt: "2026-11-01T00:00:00.000Z",
      timeZone: "UTC",
    },
    channels: { email, whatsapp },
  }
}

function settings(over: Partial<AlertSettings> = {}): AlertSettings {
  return {
    accountId: "gtb",
    revision: 3,
    recipientUserIds: ["adaeze", "kemi"],
    channel: "email",
    effectiveChannel: "email",
    recipients: [adaeze, kemi, bisi, sola],
    eligibility: eligibility(),
    ...over,
  }
}

test("only a fresh available answer can be chosen; loading and errors fail closed", () => {
  expect(eligibilityLine(eligibility(), "email")).toEqual({
    text: "688 of 1,000 left this month",
    action: null,
  })
  expect(eligibilityLine(eligibility(), "email", true).text).toBe(
    "Checking your plan…",
  )
  expect(eligibilityLine(eligibility(channel(), off), "whatsapp")).toEqual({
    text: "Not on your plan.",
    action: "plans",
  })
  const spent = channel({
    available: false,
    budget: { kind: "limited", limit: 300 },
    used: 300,
    remaining: 0,
    reason: "quota_exhausted",
  })
  expect(eligibilityLine(eligibility(channel(), spent), "whatsapp").text).toBe(
    "All 300 used this month. Resets 1 Nov.",
  )
  expect(eligibilityLine(eligibility(unknown, unknown), "email").action).toBe(
    "retry",
  )
  const draft = {
    setUp: true,
    recipientUserIds: ["adaeze"],
    channel: "email" as const,
    baseRevision: 3,
  }
  expect(
    alertsSubmission({
      settings: settings({ eligibility: eligibility(unknown, unknown) }),
      draft,
      loading: false,
    }).problem,
  ).toBe("channel_closed")
  expect(alertsSubmission({ settings: null, draft, loading: true })).toEqual({
    send: false,
    problem: "checking_plan",
  })
})

test("one channel for everyone: a person who can't get it blocks Save, with no split group", () => {
  const draft = {
    setUp: true,
    recipientUserIds: ["adaeze", "kemi"],
    channel: "whatsapp" as const,
    baseRevision: 3,
  }
  const result = alertsSubmission({
    settings: settings(),
    draft,
    loading: false,
  })
  expect(result.problem).toBe("missing_contacts")
  // Everyone can get Email, so the form may offer it; it never sends both.
  expect(switchOffer(settings(), draft)).toBe("email")
  expect(
    switchOffer(settings(), { ...draft, recipientUserIds: ["adaeze", "bisi"] }),
  ).toBeNull()
  // Someone who can no longer check payments blocks too.
  expect(
    alertsSubmission({
      settings: settings(),
      draft: { ...draft, recipientUserIds: ["sola"], channel: "email" },
      loading: false,
    }).problem,
  ).toBe("missing_contacts")
})

test("a valid change sends one channel with the revision it was based on", () => {
  expect(
    alertsSubmission({
      settings: settings(),
      draft: {
        setUp: true,
        recipientUserIds: ["adaeze"],
        channel: "whatsapp",
        baseRevision: 3,
      },
      loading: false,
    }),
  ).toEqual({
    send: true,
    problem: null,
    payload: {
      recipientUserIds: ["adaeze"],
      channel: "whatsapp",
      expectedRevision: 3,
    },
  })
})

test("an existing account without alerts stays unconfigured until someone sets them up", () => {
  const none = settings({
    recipientUserIds: [],
    channel: null,
    effectiveChannel: null,
  })
  const draft = initialDraft(none)
  expect(draft).toEqual({
    setUp: false,
    recipientUserIds: [],
    channel: null,
    baseRevision: 3,
  })
  // Bank details still save; nothing about alerts is sent.
  expect(alertsSubmission({ settings: none, draft, loading: false })).toEqual({
    send: false,
    problem: null,
  })
  expect(
    alertsSubmission({
      settings: none,
      draft: { ...draft, setUp: true },
      loading: false,
    }).problem,
  ).toBe("choose_people")
})

test("unchanged saved alerts aren't resent, so a bank-details edit doesn't touch them", () => {
  const saved = settings()
  expect(
    alertsSubmission({
      settings: saved,
      draft: initialDraft(saved),
      loading: false,
    }),
  ).toEqual({ send: false, problem: null })
})

test("a new account adds without alerts until someone sets them up, whatever the plan says", () => {
  const fresh = settings({
    accountId: null,
    revision: 0,
    recipientUserIds: ["adaeze"],
    channel: null,
    effectiveChannel: null,
  })
  const draft = initialDraft(fresh)
  // Off by default: the owner is only a suggestion, and no channel is chosen for anyone.
  expect(draft).toEqual({
    setUp: false,
    recipientUserIds: ["adaeze"],
    channel: null,
    baseRevision: 0,
  })
  const ownerCantReceive = {
    ...fresh,
    recipients: [{ ...adaeze, emailVerified: false, phoneVerified: false }],
  }
  for (const input of [
    { settings: fresh, loading: false },
    { settings: null, loading: true },
    { settings: null, loading: false },
    {
      settings: { ...fresh, eligibility: eligibility(off, off) },
      loading: false,
    },
    { settings: ownerCantReceive, loading: false },
  ])
    expect(alertsSubmission({ ...input, draft })).toEqual({
      send: false,
      problem: null,
    })
  // Once set up, the usual checks apply and still pick no channel.
  const setUp = { ...draft, setUp: true }
  expect(
    alertsSubmission({ settings: fresh, draft: setUp, loading: false }).problem,
  ).toBe("choose_channel")
  expect(
    alertsSubmission({
      settings: ownerCantReceive,
      draft: setUp,
      loading: false,
    }).problem,
  ).toBe("nobody_can_receive")
  expect(
    alertsSubmission({
      settings: fresh,
      draft: { ...setUp, channel: "whatsapp" },
      loading: false,
    }),
  ).toEqual({
    send: true,
    problem: null,
    payload: {
      recipientUserIds: ["adaeze"],
      channel: "whatsapp",
      expectedRevision: 0,
    },
  })
})

test("WhatsApp needs a verified phone, not an assistant connection", () => {
  expect(destination(adaeze, "whatsapp")).toEqual({
    tone: "ok",
    text: "WhatsApp · verified phone ••0142",
  })
  expect(destination(kemi, "whatsapp")).toEqual({
    tone: "warn",
    text: "No verified phone",
  })
  expect(destination(sola, "email").text).toBe("Can't check payments")
})

test("Review settings opens one account only in the book shown, never a guess", () => {
  const one = { accountIds: ["gtb"], bookId: "ngn" }
  expect(noticeReview(one, "ngn")).toEqual({
    kind: "account",
    accountId: "gtb",
  })
  const elsewhere: [
    { accountIds: string[]; bookId: string | null },
    string | undefined,
  ][] = [
    [one, "usd"],
    [one, undefined],
    [{ accountIds: ["gtb"], bookId: null }, "ngn"],
    [{ accountIds: ["gtb", "opay"], bookId: null }, "ngn"],
    [{ accountIds: [], bookId: "ngn" }, "ngn"],
  ]
  for (const [notice, current] of elsewhere)
    expect(noticeReview(notice, current).kind).toBe("accounts")
  expect(
    noticeReview({ accountIds: ["gtb", "opay"], bookId: "ngn" }, "ngn"),
  ).toEqual({
    kind: "accounts",
    message:
      "This affects 2 bank accounts. Check payment alerts on each one in Money accounts.",
  })
})

test("delivery badges: unknown states read as unconfirmed, a running retry as Trying again", () => {
  expect(deliveryBadge("failed")).toEqual({
    label: "Couldn't send",
    tone: "bad",
  })
  expect(deliveryBadge("unknown").label).toBe("Delivery unconfirmed")
  expect(deliveryBadge("something-new").label).toBe("Delivery unconfirmed")
  expect(retryingBadge).toEqual({ label: "Trying again", tone: "info" })
})

test("WhatsApp off: alerts open on Email with WhatsApp as the previous choice, never auto-switched back", () => {
  const fallback = settings({
    accountId: "opay",
    recipientUserIds: ["adaeze"],
    channel: "whatsapp",
    effectiveChannel: "email",
    eligibility: eligibility(channel(), off),
  })
  const draft = initialDraft(fallback)
  expect(draft.channel).toBe("email")
  expect(previousChoice(fallback, draft)).toBe("whatsapp")
  // WhatsApp available again: still Email until someone chooses WhatsApp.
  const back = { ...fallback, eligibility: eligibility() }
  expect(initialDraft(back).channel).toBe("email")
  expect(previousChoice(back, initialDraft(back))).toBeNull()
})

test("no fallback: the closed channel names who can't take over instead of inventing Email", () => {
  const paused = settings({
    accountId: "opay",
    recipientUserIds: ["adaeze", "bisi"],
    channel: "whatsapp",
    effectiveChannel: null,
    eligibility: eligibility(channel(), off),
  })
  const draft = initialDraft(paused)
  expect(draft.channel).toBe("whatsapp")
  expect(closedChannelAdvice(paused, draft)).toEqual({
    kind: "stuck",
    other: "email",
    blockers: [
      {
        userId: "bisi",
        name: "Bisi Musa",
        firstName: "Bisi",
        reason: "no_email",
      },
    ],
  })
  expect(
    alertsSubmission({ settings: paused, draft, loading: false }).problem,
  ).toBe("channel_closed")
  expect(
    accountAlertsRow({
      revision: 5,
      recipientNames: ["Adaeze Okafor", "Bisi Musa"],
      channel: "whatsapp",
      effectiveChannel: null,
    }),
  ).toEqual({
    icon: "paused",
    label: "Paused · action needed",
    names: "Adaeze Okafor, Bisi Musa",
    previous: "Previous choice: WhatsApp",
  })
  expect(accountAlertsRow(null)).toBeNull()
})

test("a background refresh never rebases a changed draft: it holds until the person reviews", () => {
  // Opened at revision 3 (Email to Adaeze and Kemi); this person switched to WhatsApp for Adaeze.
  const mine = {
    ...initialDraft(settings()),
    recipientUserIds: ["adaeze"],
    channel: "whatsapp" as const,
  }
  expect(mine.baseRevision).toBe(3)
  // Meanwhile someone else saved WhatsApp to Adaeze and Bisi (revision 4); the query refetched.
  const latest = settings({
    revision: 4,
    recipientUserIds: ["adaeze", "bisi"],
    channel: "whatsapp",
    effectiveChannel: "whatsapp",
  })
  expect(
    alertsSubmission({ settings: latest, draft: mine, loading: false }),
  ).toEqual({
    send: false,
    problem: "settings_changed",
  })
  expect(alertsConflict(latest, mine)).toEqual({
    saved: "WhatsApp to Adaeze Okafor, Bisi Musa",
    mine: "WhatsApp to Adaeze Okafor",
  })
  // Keeping my choices is explicit, keeps every choice, and only then uses revision 4.
  const kept = keepMyChoices(latest, mine)
  expect(kept).toEqual({ ...mine, baseRevision: 4 })
  expect(
    alertsSubmission({ settings: latest, draft: kept, loading: false }),
  ).toEqual({
    send: true,
    problem: null,
    payload: {
      recipientUserIds: ["adaeze"],
      channel: "whatsapp",
      expectedRevision: 4,
    },
  })
  // Taking the saved settings instead sends nothing over them.
  expect(
    alertsSubmission({
      settings: latest,
      draft: initialDraft(latest),
      loading: false,
    }),
  ).toEqual({ send: false, problem: null })
})

test("a refusal that isn't a revision change keeps the choices and shows why", () => {
  const mine = {
    ...initialDraft(settings()),
    recipientUserIds: ["adaeze", "kemi"],
    channel: "email" as const,
  }
  // Same revision, but Kemi's verified email is gone (a contact CONFLICT from the server).
  const refreshed = settings({
    recipients: [adaeze, { ...kemi, emailVerified: false }, bisi, sola],
    channel: "whatsapp",
    effectiveChannel: "whatsapp",
  })
  expect(alertsConflict(refreshed, mine)).toBeNull()
  const result = alertsSubmission({
    settings: refreshed,
    draft: mine,
    loading: false,
  })
  expect(result.problem).toBe("missing_contacts")
  expect(mine.recipientUserIds).toEqual(["adaeze", "kemi"])
})

test("a draft that already matches newer saved alerts isn't a conflict and can't loop", () => {
  const paused = settings({
    revision: 6,
    recipientUserIds: ["adaeze"],
    channel: "whatsapp",
    effectiveChannel: null,
  })
  const mine = {
    setUp: true,
    recipientUserIds: ["adaeze"],
    channel: "whatsapp" as const,
    baseRevision: 5,
  }
  expect(alertsConflict(paused, mine)).toBeNull()
  const result = alertsSubmission({
    settings: paused,
    draft: mine,
    loading: false,
  })
  expect(result.send && result.payload.expectedRevision).toBe(6)
})

test("Don't set up now is only for alerts that were never saved, and keeps nothing pending", () => {
  const fresh = settings({
    accountId: null,
    revision: 0,
    recipientUserIds: ["adaeze"],
    channel: null,
    effectiveChannel: null,
  })
  const unconfigured = settings({
    recipientUserIds: [],
    channel: null,
    effectiveChannel: null,
  })
  expect(canSkipSetup(fresh)).toBe(true)
  expect(canSkipSetup(unconfigured)).toBe(true)
  expect(canSkipSetup(settings())).toBe(false)
  expect(canSkipSetup(settings({ effectiveChannel: null }))).toBe(false)
  // Set up, half-filled, then "Not now": nothing is sent and nothing blocks the bank save.
  const started = {
    ...initialDraft(fresh),
    setUp: true,
    channel: "whatsapp" as const,
  }
  const notNow = { ...started, setUp: false }
  expect(
    alertsSubmission({ settings: fresh, draft: started, loading: false }).send,
  ).toBe(true)
  expect(
    alertsSubmission({ settings: fresh, draft: notNow, loading: false }),
  ).toEqual({
    send: false,
    problem: null,
  })
  // If someone else set alerts up meanwhile, "Not now" still sends nothing over them.
  const configuredMeanwhile = settings({ revision: 4 })
  const skipped = { ...initialDraft(unconfigured), baseRevision: 3 }
  expect(
    alertsSubmission({
      settings: configuredMeanwhile,
      draft: {
        ...skipped,
        setUp: true,
        channel: "email",
        recipientUserIds: ["kemi"],
      },
      loading: false,
    }).problem,
  ).toBe("settings_changed")
  expect(
    alertsSubmission({
      settings: configuredMeanwhile,
      draft: skipped,
      loading: false,
    }),
  ).toEqual({ send: false, problem: null })
  expect(alertsConflict(configuredMeanwhile, skipped)).toEqual({
    saved: "Email to Adaeze Okafor, Kemi Balogun",
    mine: "Not set up",
  })
})
