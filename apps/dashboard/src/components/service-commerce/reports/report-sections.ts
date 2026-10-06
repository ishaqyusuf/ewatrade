import type { ServiceCommerceReportSection } from "@/hooks/use-service-commerce-report-params"
import type { ServiceCommerceReportOutput } from "@ewatrade/service-commerce"

export type ReportMetric = {
  label: string
  /** `null` is Unknown: the fact is not available, so it is never shown as zero. */
  value: number | null
  format?: "count" | "duration" | "money"
  /** Required when `format` is money. */
  currencyCode?: string | null
  /** A current snapshot rather than an occurrence inside the window. */
  current?: boolean
  note?: string
  unknownReason?: string
  /** Total that `value` is a share of; drawn as a proportion bar. */
  shareOf?: number
}

export type ReportMetricGroup = { title: string; metrics: ReportMetric[] }

export type ReportSectionContent = {
  key: Exclude<ServiceCommerceReportSection, "stores">
  tab: string
  title: string
  description: string
  groups: ReportMetricGroup[]
  footnote?: string
}

export type ReportFunnelStep = {
  label: string
  count: number
  /** Percent of the step above; `null` when the step above is zero. */
  ratio?: number | null
}

const CHANNEL_LABELS: Record<
  ServiceCommerceReportOutput["lifecycle"]["byChannel"][number]["channel"],
  string
> = {
  staff: "Staff",
  web: "Web",
  whatsapp: "WhatsApp",
}

const SOURCE_LABELS: Record<
  ServiceCommerceReportOutput["lifecycle"]["bySource"][number]["source"],
  string
> = {
  commerce_inquiry: "Commerce inquiry",
  prescription: "Prescription",
  service: "Service",
}

export const COST_LABELS: Record<
  ServiceCommerceReportOutput["costs"][number]["costKind"],
  string
> = {
  bsp_or_twilio_markup: "BSP or Twilio markup",
  delivery: "Delivery",
  ewatrade_subscription: "EwaTrade subscription",
  ewatrade_usage: "EwaTrade usage",
  meta_delivered_message: "Meta delivered messages",
  number: "Number fees",
  payment_provider_fee: "Payment-provider fees",
  revenue: "Business revenue",
  tax: "Tax",
}

export function humanizeReportValue(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

export function formatReportDuration(seconds: number) {
  const rounded = Math.round(seconds)
  if (rounded < 60) return `${rounded}s`
  const minutes = Math.floor(rounded / 60)
  if (minutes < 60) return `${minutes}m ${rounded % 60}s`
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`
}

export function usageAttributionLabel(dimension: {
  billingOwner?: string | null
  connectionId?: string | null
  messageCategory?: string | null
  recipientMarket?: string | null
}) {
  return [
    dimension.connectionId ? `Connection ${dimension.connectionId}` : null,
    dimension.recipientMarket,
    dimension.messageCategory,
    dimension.billingOwner,
  ]
    .filter(Boolean)
    .join(" · ")
}

/**
 * Ratios compare occurrences inside one window with the step above. They are
 * not cohort conversion, so a step can exceed 100%.
 */
export function lifecycleFunnel(
  lifecycle: ServiceCommerceReportOutput["lifecycle"],
): ReportFunnelStep[] {
  const steps = [
    { label: "Requests received", count: lifecycle.requestsReceived },
    { label: "Quotes issued", count: lifecycle.quotesIssued },
    { label: "Quotes accepted", count: lifecycle.quotesAccepted },
    { label: "Payments succeeded", count: lifecycle.paymentsSucceeded },
  ]
  return steps.map((step, index) => {
    const previous = steps[index - 1]
    if (!previous) return step
    return {
      ...step,
      ratio:
        previous.count > 0
          ? Math.round((step.count / previous.count) * 100)
          : null,
    }
  })
}

const metric = (
  label: string,
  value: number | null,
  extra: Omit<ReportMetric, "label" | "value"> = {},
): ReportMetric => ({ label, value, ...extra })

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
      tab: "Lifecycle",
      title: "Lifecycle",
      description:
        "Request, Quote, payment, booking and fulfilment occurrences in the selected window.",
      groups: [
        {
          title: "Fulfilment",
          metrics: [
            metric("Bookings confirmed", lifecycle.bookingsConfirmed),
            metric("Bookings completed", lifecycle.bookingsCompleted),
            metric("Pickups completed", lifecycle.pickupsCompleted),
            metric("Deliveries completed", lifecycle.deliveriesCompleted),
            metric("Service completions", lifecycle.serviceCompletions),
          ],
        },
        {
          title: "Requests by channel",
          metrics: lifecycle.byChannel.map((entry) =>
            metric(CHANNEL_LABELS[entry.channel], entry.count, {
              shareOf: requestTotal,
            }),
          ),
        },
        {
          title: "Requests by source",
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
      title: "Store Conversation service quality",
      description:
        "Content-free operational counts. Customer messages, contacts, credentials and provider identifiers are never included.",
      groups: [
        {
          title: "Conversations",
          metrics: [
            metric(
              "Conversations started",
              conversations.lifecycle.conversationsStarted,
            ),
            metric(
              "Customer messages",
              conversations.lifecycle.customerMessages,
            ),
            metric("Store replies", conversations.lifecycle.storeReplies),
            metric(
              "First response average",
              conversations.lifecycle.firstResponse.averageSeconds,
              {
                format: "duration",
                unknownReason: "No first response was measured in this window.",
              },
            ),
          ],
        },
        {
          title: "Team",
          metrics: [
            metric("Claims", conversations.team.claimed),
            metric("Unclaimed", conversations.team.unclaimedCurrent, {
              current: true,
            }),
            metric("Overdue", conversations.team.overdueCurrent, {
              current: true,
            }),
            metric("Escalations opened", conversations.team.escalationsOpened),
            metric(
              "Escalations resolved",
              conversations.team.escalationsResolved,
            ),
          ],
        },
        {
          title: "Availability",
          metrics: [
            metric("Paused", conversations.availability.paused),
            metric("Resumed", conversations.availability.resumed),
            metric(
              "Schedule updates",
              conversations.availability.scheduleUpdates,
            ),
            metric(
              "Coverage blocks",
              conversations.availability.coverageBlockObservations,
            ),
            metric(
              "Policy blocks",
              conversations.availability.policyBlockObservations,
            ),
            metric(
              "Provider blocks",
              conversations.availability.providerBlockObservations,
            ),
            metric(
              "Scheduled closures",
              conversations.availability.scheduledClosureObservations,
              {
                unknownReason:
                  "Past scheduled closures are not stored, so this stays Unknown.",
              },
            ),
          ],
        },
        {
          title: "Messages by channel",
          metrics: [
            metric("Web", conversations.channels.webMessages),
            metric("Mobile", conversations.channels.mobileMessages),
            metric("WhatsApp", conversations.channels.whatsAppMessages),
            metric("Bridge initiated", conversations.channels.bridgeInitiated),
            metric("Bridge confirmed", conversations.channels.bridgeConfirmed),
          ],
        },
        {
          title: "Notifications",
          metrics: [
            metric("Scheduled", conversations.notifications.scheduled),
            metric("Delivered", conversations.notifications.delivered),
            metric("Coalesced", conversations.notifications.coalesced),
            metric(
              "Cancelled by read",
              conversations.notifications.cancelledByRead,
            ),
            metric("Suppressed", conversations.notifications.suppressed),
            metric("Unavailable", conversations.notifications.unavailable),
          ],
        },
        {
          title: "Provider delivery",
          metrics: [
            metric("Attempts", conversations.providerReliability.attempts),
            metric("Failures", conversations.providerReliability.failed),
            metric(
              "Outcome unknown",
              conversations.providerReliability.outcomeUnknown,
            ),
            metric(
              "Cost known",
              conversations.costVisibility.knownObservations,
            ),
            metric(
              "Cost unknown",
              conversations.costVisibility.unknownObservations,
            ),
          ],
        },
        {
          title: "Requests and current state",
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
            metric("Active", conversations.lifecycle.currentSnapshot.active, {
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
        "Scheduled closure and arbitrary WhatsApp history remain unknown because those historical observations are not persisted. They are not reported as zero. Store Conversations has no daily detail.",
    },
    {
      key: "catalog",
      tab: "Catalog",
      title: "Progressive Catalog",
      description:
        "How requests resolved to drafts or existing Offerings, and how Quote prices were set.",
      groups: [
        {
          title: "Resolution",
          metrics: [
            metric("Demand resolved", catalog.demandResolved),
            metric("Drafts created", catalog.draftsCreated),
            metric(
              "Existing Offerings matched",
              catalog.existingOfferingsMatched,
            ),
            metric("Resolution unknown", catalog.resolutionUnknown),
          ],
        },
        {
          title: "Pricing and stock",
          metrics: [
            metric("Quote overrides", catalog.quoteOverrides),
            metric("Quote override unknown", catalog.quoteOverrideUnknown),
            metric(
              "Reusable price promotions",
              catalog.reusablePricePromotions,
            ),
            metric(
              "Procure-to-order commitments",
              catalog.procureToOrderCommitments,
            ),
            metric(
              "Managed inventory graduations",
              catalog.managedInventoryGraduations,
            ),
          ],
        },
      ],
    },
    {
      key: "reliability",
      tab: "Reliability",
      title: "Reliability and recovery",
      description: "Provider attempts, job recovery and routing readiness.",
      groups: [
        {
          title: "Provider and jobs",
          metrics: [
            metric("Provider attempts", reliability.providerAttempts),
            metric("Provider failures", reliability.providerFailures),
            metric("Provider retries", reliability.providerRetries),
            metric("Job recoveries", reliability.jobRecoveries),
            metric("Job recovery attempts", reliability.jobRecoveryAttempts),
            metric(
              "Stale capability rejections",
              reliability.staleCapabilityRejections,
            ),
          ],
        },
        ...(report.observability.length
          ? [
              {
                title: "Observed outcomes",
                metrics: report.observability.map((entry) =>
                  metric(
                    `${humanizeReportValue(entry.kind)} · ${humanizeReportValue(entry.outcome)}`,
                    entry.count,
                  ),
                ),
              },
            ]
          : []),
      ],
    },
    {
      key: "media",
      tab: "Media",
      title: "Media safety and observations",
      description:
        "Aggregate safety and conversion facts only; media content, object keys and customer descriptions remain private.",
      groups: [
        {
          title: "Attachments",
          metrics: [
            metric("Active", media.attachmentsActive),
            metric("Safe", media.attachmentsSafe),
            metric("Quarantined", media.attachmentsQuarantined),
            metric("Rejected", media.attachmentsRejected),
            metric("Retryable", media.attachmentsRetryable),
          ],
        },
        {
          title: "Observations",
          metrics: [
            metric("Current observations", media.observationsCurrent),
            metric("Converted", media.observationsConverted),
          ],
        },
      ],
    },
    {
      key: "costs",
      tab: "Costs",
      title: "Costs and billing ownership",
      description:
        "A known zero remains zero. External costs that are not yet available stay unknown and are never estimated into another category.",
      groups: report.costs.length
        ? [
            {
              title: "By cost kind",
              metrics: report.costs.map((cost) =>
                metric(
                  COST_LABELS[cost.costKind],
                  cost.currencyCode === null ? null : cost.knownTotalMinor,
                  {
                    currencyCode: cost.currencyCode,
                    format: "money",
                    note: `${cost.knownCount} known · ${cost.unknownCount} unknown`,
                    unknownReason:
                      "No provider amount has been reported for these facts.",
                  },
                ),
              ),
            },
            ...(report.usageCostsByDimension.length
              ? [
                  {
                    title: "Meta usage by attribution",
                    metrics: report.usageCostsByDimension.map((dimension) =>
                      metric(
                        usageAttributionLabel(dimension) || "Unattributed",
                        dimension.costs.reduce(
                          (count, cost) =>
                            count + cost.knownCount + cost.unknownCount,
                          0,
                        ),
                        { note: "Usage facts" },
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
