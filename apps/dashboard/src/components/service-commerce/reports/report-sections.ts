import {
  type ReportFunnelStep,
  type ReportMetricGroup,
  type ReportMetricTone,
  buildReportFunnel,
  reportMetric,
} from "@/components/reports/report-metrics"
import type { ServiceCommerceReportSection } from "@/hooks/use-service-commerce-report-params"
import { reportCsv, reportCsvMoney } from "@/lib/report-csv"
import { type ReportRange, reportRangeFileDates } from "@/lib/report-range"
import type { ServiceCommerceReportOutput } from "@ewatrade/service-commerce"

export type ReportSectionContent = {
  key: Exclude<ServiceCommerceReportSection, "stores">
  tab: string
  title: string
  description: string
  groups: ReportMetricGroup[]
  footnote?: string
}

const CHANNEL_LABELS: Record<
  ServiceCommerceReportOutput["lifecycle"]["byChannel"][number]["channel"],
  string
> = {
  staff: "Added by staff",
  web: "Website",
  whatsapp: "WhatsApp",
}

const SOURCE_LABELS: Record<
  ServiceCommerceReportOutput["lifecycle"]["bySource"][number]["source"],
  string
> = {
  commerce_inquiry: "Products",
  prescription: "Prescriptions",
  service: "Services",
}

export const COST_LABELS: Record<
  ServiceCommerceReportOutput["costs"][number]["costKind"],
  string
> = {
  bsp_or_twilio_markup: "Messaging partner fee",
  delivery: "Delivery",
  ewatrade_subscription: "EwaTrade plan",
  ewatrade_usage: "EwaTrade usage",
  meta_delivered_message: "WhatsApp message charges",
  number: "Phone number fees",
  payment_provider_fee: "Card and transfer fees",
  revenue: "Money received from sales",
  tax: "Tax",
}

const OBSERVED_OUTCOME_TONES: Partial<
  Record<
    ServiceCommerceReportOutput["observability"][number]["outcome"],
    ReportMetricTone
  >
> = {
  blocked: "block",
  failed: "failure",
}

const REPORT_VALUE_LABELS: Record<string, string> = {
  attempted: "Sent",
  issued: "Sent",
  provider_attempt: "Message",
  provider_recorded: "Reported by provider",
  quote: "Quote",
  received: "Received",
  recorded: "Recorded",
  request_received: "Request",
  staff: "Added by staff",
  staff_phone: "Phone (staff)",
  staff_walk_in: "Walk-in (staff)",
  succeeded: "Received",
  web: "Website",
  whatsapp: "WhatsApp",
}

/** Plain sentence-case words for report codes: "message_delivery" → "Message delivery". */
export function humanizeReportValue(value: string) {
  const known = REPORT_VALUE_LABELS[value]
  if (known) return known
  const words = value.replaceAll("_", " ").toLowerCase()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

const MESSAGE_CATEGORY_LABELS: Record<string, string> = {
  authentication: "Login codes",
  marketing: "Promotions",
  service: "Customer service",
  utility: "Updates",
}

const BILLING_OWNER_LABELS: Record<string, string> = {
  business: "Paid by you",
  ewatrade: "Paid by EwaTrade",
}

const regionNames =
  typeof Intl.DisplayNames === "function"
    ? new Intl.DisplayNames(["en"], { type: "region" })
    : null

function regionName(code: string) {
  try {
    return regionNames?.of(code.toUpperCase()) ?? code
  } catch {
    return code
  }
}

export function usageAttributionLabel(dimension: {
  billingOwner?: string | null
  connectionId?: string | null
  messageCategory?: string | null
  recipientMarket?: string | null
}) {
  return [
    dimension.connectionId ? `WhatsApp number ${dimension.connectionId}` : null,
    dimension.recipientMarket ? regionName(dimension.recipientMarket) : null,
    dimension.messageCategory
      ? (MESSAGE_CATEGORY_LABELS[dimension.messageCategory] ??
        humanizeReportValue(dimension.messageCategory))
      : null,
    dimension.billingOwner
      ? (BILLING_OWNER_LABELS[dimension.billingOwner] ??
        humanizeReportValue(dimension.billingOwner))
      : null,
  ]
    .filter(Boolean)
    .join(" · ")
}

export function lifecycleFunnel(
  lifecycle: ServiceCommerceReportOutput["lifecycle"],
): ReportFunnelStep[] {
  return buildReportFunnel([
    { label: "Requests", count: lifecycle.requestsReceived },
    { label: "Quotes sent", count: lifecycle.quotesIssued },
    { label: "Quotes accepted", count: lifecycle.quotesAccepted },
    { label: "Paid", count: lifecycle.paymentsSucceeded },
  ])
}

const metric = reportMetric

/** The report's metric set as named groups; paired values become separate rows. */
export function buildReportSections(
  report: ServiceCommerceReportOutput,
): ReportSectionContent[] {
  const { catalog, lifecycle, media, reliability } = report
  const conversations = report.storeConversations
  const requestTotal = lifecycle.bySource.reduce(
    (total, entry) => total + entry.count,
    0,
  )

  return [
    {
      key: "lifecycle",
      tab: "Requests",
      title: "Requests",
      description:
        "Requests, Quotes, payments, bookings and hand-overs in these dates.",
      groups: [
        {
          title: "Handed over",
          metrics: [
            metric("Bookings confirmed", lifecycle.bookingsConfirmed),
            metric("Bookings completed", lifecycle.bookingsCompleted),
            metric("Picked up", lifecycle.pickupsCompleted),
            metric("Delivered", lifecycle.deliveriesCompleted),
            metric("Services done", lifecycle.serviceCompletions),
          ],
        },
        {
          title: "Where requests came from",
          metrics: lifecycle.byChannel.map((entry) =>
            metric(CHANNEL_LABELS[entry.channel], entry.count, {
              shareOf: requestTotal,
            }),
          ),
        },
        {
          title: "What was asked for",
          metrics: lifecycle.bySource.map((entry) =>
            metric(SOURCE_LABELS[entry.source], entry.count, {
              shareOf: requestTotal,
            }),
          ),
        },
      ],
    },
    {
      key: "conversations",
      tab: "Conversations",
      title: "Conversations",
      description:
        "How quickly your team replied, and how messages were delivered. Message text is never shown.",
      groups: [
        {
          title: "Conversations",
          metrics: [
            metric(
              "New conversations",
              conversations.lifecycle.conversationsStarted,
            ),
            metric(
              "Messages from Customers",
              conversations.lifecycle.customerMessages,
            ),
            metric("Replies sent", conversations.lifecycle.storeReplies),
            metric(
              "Average first reply",
              conversations.lifecycle.firstResponse.averageSeconds,
              {
                format: "duration",
                unknownReason: "No replies in these dates.",
              },
            ),
          ],
        },
        {
          title: "Team",
          metrics: [
            metric("Picked up by staff", conversations.team.claimed),
            metric("Waiting for staff", conversations.team.unclaimedCurrent, {
              current: true,
              tone: "block",
            }),
            metric("Reply overdue", conversations.team.overdueCurrent, {
              current: true,
              tone: "failure",
            }),
            metric("Passed to a manager", conversations.team.escalationsOpened),
            metric(
              "Resolved by a manager",
              conversations.team.escalationsResolved,
            ),
          ],
        },
        {
          title: "Opening hours",
          metrics: [
            metric("Replies paused", conversations.availability.paused),
            metric("Replies resumed", conversations.availability.resumed),
            metric("Hours changed", conversations.availability.scheduleUpdates),
            metric(
              "Messages outside staff hours",
              conversations.availability.coverageBlockObservations,
              { tone: "block" },
            ),
            metric(
              "Blocked by message rules",
              conversations.availability.policyBlockObservations,
              { tone: "block" },
            ),
            metric(
              "Blocked by WhatsApp",
              conversations.availability.providerBlockObservations,
              { tone: "block" },
            ),
            metric(
              "During a planned closure",
              conversations.availability.scheduledClosureObservations,
              {
                unknownReason:
                  "Past closures aren't saved, so this can't be counted.",
              },
            ),
          ],
        },
        {
          title: "Messages by channel",
          metrics: [
            metric("Website", conversations.channels.webMessages),
            metric("Mobile app", conversations.channels.mobileMessages),
            metric("WhatsApp", conversations.channels.whatsAppMessages),
            metric(
              "Asked to move to WhatsApp",
              conversations.channels.bridgeInitiated,
            ),
            metric("Moved to WhatsApp", conversations.channels.bridgeConfirmed),
          ],
        },
        {
          title: "Staff alerts",
          metrics: [
            metric("Queued", conversations.notifications.scheduled),
            metric("Sent", conversations.notifications.delivered),
            metric("Grouped into one", conversations.notifications.coalesced),
            metric(
              "Not needed (already read)",
              conversations.notifications.cancelledByRead,
            ),
            metric("Held back", conversations.notifications.suppressed),
            metric("Couldn't send", conversations.notifications.unavailable),
          ],
        },
        {
          title: "WhatsApp delivery",
          metrics: [
            metric("Messages sent", conversations.providerReliability.attempts),
            metric("Failed", conversations.providerReliability.failed, {
              tone: "failure",
            }),
            metric(
              "Delivery not confirmed",
              conversations.providerReliability.outcomeUnknown,
            ),
            metric(
              "Cost reported",
              conversations.costVisibility.knownObservations,
            ),
            metric(
              "Cost not reported yet",
              conversations.costVisibility.unknownObservations,
            ),
          ],
        },
        {
          title: "Requests and open conversations",
          metrics: [
            metric(
              "Product requests",
              conversations.lifecycle.requestKinds.product,
            ),
            metric(
              "Service requests",
              conversations.lifecycle.requestKinds.service,
            ),
            metric(
              "Prescription requests",
              conversations.lifecycle.requestKinds.prescription,
            ),
            metric("Open", conversations.lifecycle.currentSnapshot.active, {
              current: true,
            }),
            metric(
              "Archived",
              conversations.lifecycle.currentSnapshot.archived,
              { current: true },
            ),
            metric(
              "Restricted",
              conversations.lifecycle.currentSnapshot.restricted,
              { current: true },
            ),
          ],
        },
      ],
      footnote:
        "Closures and older WhatsApp history aren't saved, so they show as Unknown, not 0. Conversations has no day-by-day table.",
    },
    {
      key: "catalog",
      tab: "Catalog",
      title: "Catalog",
      description:
        "How requests were matched to your items, and how Quote prices were set.",
      groups: [
        {
          title: "Matching",
          metrics: [
            metric("Matched to an item", catalog.demandResolved),
            metric("New draft items", catalog.draftsCreated),
            metric(
              "Matched to an existing item",
              catalog.existingOfferingsMatched,
            ),
            metric("Not matched yet", catalog.resolutionUnknown),
          ],
        },
        {
          title: "Pricing and stock",
          metrics: [
            metric("Price changed on the Quote", catalog.quoteOverrides),
            metric("Price change not recorded", catalog.quoteOverrideUnknown),
            metric(
              "Price saved for next time",
              catalog.reusablePricePromotions,
            ),
            metric(
              "Bought in for a Customer",
              catalog.procureToOrderCommitments,
            ),
            metric("Now tracked in stock", catalog.managedInventoryGraduations),
          ],
        },
      ],
    },
    {
      key: "reliability",
      tab: "System health",
      title: "System health",
      description: "Messages and tasks that failed or needed a retry.",
      groups: [
        {
          title: "Messages and tasks",
          metrics: [
            metric("Messages sent", reliability.providerAttempts),
            metric("Messages failed", reliability.providerFailures, {
              tone: "failure",
            }),
            metric("Sent again automatically", reliability.providerRetries),
            metric("Tasks restarted", reliability.jobRecoveries),
            metric("Restart tries", reliability.jobRecoveryAttempts),
            metric(
              "Stopped: link out of date",
              reliability.staleCapabilityRejections,
              { tone: "block" },
            ),
          ],
        },
        ...(report.observability.length
          ? [
              {
                title: "Results by type",
                metrics: report.observability.map((entry) =>
                  metric(
                    `${humanizeReportValue(entry.kind)} · ${humanizeReportValue(entry.outcome)}`,
                    entry.count,
                    { tone: OBSERVED_OUTCOME_TONES[entry.outcome] },
                  ),
                ),
              },
            ]
          : []),
      ],
    },
    {
      key: "media",
      tab: "Photos and files",
      title: "Photos and files",
      description:
        "Safety checks on photos and files Customers sent. The files themselves are never shown.",
      groups: [
        {
          title: "Files",
          metrics: [
            metric("In use", media.attachmentsActive),
            metric("Passed the safety check", media.attachmentsSafe),
            metric("Held for checking", media.attachmentsQuarantined, {
              tone: "block",
            }),
            metric("Rejected as unsafe", media.attachmentsRejected, {
              tone: "failure",
            }),
            metric("Check failed, will retry", media.attachmentsRetryable, {
              tone: "block",
            }),
          ],
        },
        {
          title: "Photo notes",
          metrics: [
            metric("Photo notes", media.observationsCurrent),
            metric("Turned into requests", media.observationsConverted),
          ],
        },
      ],
    },
    {
      key: "costs",
      tab: "Costs",
      title: "Costs and fees",
      description:
        "Charges for messages, payments and delivery in these dates. Charges not reported yet show as Unknown; we never guess them.",
      groups: report.costs.length
        ? [
            {
              title: "By type",
              metrics: report.costs.map((cost) =>
                metric(
                  COST_LABELS[cost.costKind],
                  cost.currencyCode === null ? null : cost.knownTotalMinor,
                  {
                    currencyCode: cost.currencyCode,
                    format: "money",
                    note: `${cost.knownCount} ${cost.knownCount === 1 ? "charge" : "charges"}${cost.unknownCount ? ` · ${cost.unknownCount} not reported yet` : ""}`,
                    unknownReason: "No amount reported yet.",
                  },
                ),
              ),
            },
            ...(report.usageCostsByDimension.length
              ? [
                  {
                    title: "WhatsApp charges by number",
                    metrics: report.usageCostsByDimension.map((dimension) =>
                      metric(
                        usageAttributionLabel(dimension) ||
                          "No number recorded",
                        dimension.costs.reduce(
                          (count, cost) =>
                            count + cost.knownCount + cost.unknownCount,
                          0,
                        ),
                        { note: "Messages" },
                      ),
                    ),
                  },
                ]
              : []),
          ]
        : [],
    },
  ]
}

/** Days with any request, for the quiet-period note. */
export function countRequestDays(
  report: Pick<ServiceCommerceReportOutput, "daily">,
) {
  return (report.daily ?? []).filter((day) => day.requests > 0).length
}

/** CSV of the daily counts behind Requests by day and the request-to-payment steps. */
export function buildServiceCommerceReportCsv(
  report: ServiceCommerceReportOutput,
  range: ReportRange,
  storeName: string,
) {
  const { lifecycle } = report
  const rows: Array<Array<string | number>> = [
    ["Requests and quotes", storeName, `Amounts in ${report.currencyCode}`],
    [
      "Date",
      "Requests",
      "Quotes sent",
      "Quotes accepted",
      "Paid",
      "Amount paid",
    ],
    ...(report.daily ?? []).map((day) => [
      day.date,
      day.requests,
      day.quotesIssued,
      day.quotesAccepted,
      day.paymentsSucceeded,
      reportCsvMoney(day.paymentValueMinor),
    ]),
    [
      "Total",
      lifecycle.requestsReceived,
      lifecycle.quotesIssued,
      lifecycle.quotesAccepted,
      lifecycle.paymentsSucceeded,
      reportCsvMoney(lifecycle.paymentValueMinor),
    ],
    [],
    ["Bookings confirmed", lifecycle.bookingsConfirmed],
    ["Bookings completed", lifecycle.bookingsCompleted],
    ["Picked up", lifecycle.pickupsCompleted],
    ["Delivered", lifecycle.deliveriesCompleted],
    ["Services done", lifecycle.serviceCompletions],
  ]
  return {
    fileName: `requests-and-quotes_${reportRangeFileDates(range)}.csv`,
    text: reportCsv(rows),
  }
}
