import { Column, Link, Row, Section, Text } from "@react-email/components"

import { BrandEmail, EmailStatus, emailPalette } from "../components"
import { renderEmailMarkup } from "../src/render"
import { createEmailText } from "./shared"

export type CommercialOrderReminderDigestTiming =
  | "overdue"
  | "same_day"
  | "day_before"

export type CommercialOrderReminderDigestOrder = {
  customerName: string | null
  dueLabel: string
  orderNumber: string
  orderUrl: string | null
  storeName: string
}

export type CommercialOrderReminderDigestEmailInput = {
  businessName: string
  ordersUrl: string | null
  sections: Array<{
    orders: CommercialOrderReminderDigestOrder[]
    timing: CommercialOrderReminderDigestTiming
  }>
}

/** Rows shown per section; the rest are summarised and linked. */
export const COMMERCIAL_ORDER_REMINDER_DIGEST_SECTION_LIMIT = 20

const sectionOrder: CommercialOrderReminderDigestTiming[] = [
  "overdue",
  "same_day",
  "day_before",
]

const sectionLabels: Record<CommercialOrderReminderDigestTiming, string> = {
  day_before: "Due tomorrow",
  overdue: "Overdue",
  same_day: "Due today",
}

function visibleSections(input: CommercialOrderReminderDigestEmailInput) {
  return sectionOrder.flatMap((timing) => {
    const orders =
      input.sections.find((section) => section.timing === timing)?.orders ?? []
    if (!orders.length) return []
    return [
      {
        hidden: Math.max(
          0,
          orders.length - COMMERCIAL_ORDER_REMINDER_DIGEST_SECTION_LIMIT,
        ),
        label: sectionLabels[timing],
        orders: orders.slice(0, COMMERCIAL_ORDER_REMINDER_DIGEST_SECTION_LIMIT),
        timing,
        total: orders.length,
      },
    ]
  })
}

export function commercialOrderReminderDigestCounts(
  input: Pick<CommercialOrderReminderDigestEmailInput, "sections">,
) {
  const count = (timing: CommercialOrderReminderDigestTiming) =>
    input.sections
      .filter((section) => section.timing === timing)
      .reduce((total, section) => total + section.orders.length, 0)
  return {
    dayBefore: count("day_before"),
    overdue: count("overdue"),
    sameDay: count("same_day"),
  }
}

export function commercialOrderReminderDigestSummary(
  input: Pick<CommercialOrderReminderDigestEmailInput, "sections">,
) {
  const counts = commercialOrderReminderDigestCounts(input)
  const orders = (count: number) => `${count} order${count === 1 ? "" : "s"}`
  return [
    counts.sameDay ? `${orders(counts.sameDay)} due today` : null,
    counts.dayBefore ? `${orders(counts.dayBefore)} due tomorrow` : null,
    counts.overdue ? `${orders(counts.overdue)} overdue` : null,
  ]
    .filter(Boolean)
    .join(", ")
}

function getContent(input: CommercialOrderReminderDigestEmailInput) {
  const counts = commercialOrderReminderDigestCounts(input)
  return {
    intro: `${commercialOrderReminderDigestSummary(input)}. Prepare the remaining Product lines and record fulfillment once each delivery is complete.`,
    note: "This reminder does not fulfill any order or change stock. You get at most one of these emails a day.",
    status: counts.overdue ? "Needs attention" : "Today's deliveries",
    title: counts.sameDay
      ? "Today's deliveries need a look."
      : counts.dayBefore
        ? "Tomorrow's deliveries need a look."
        : "Some deliveries are overdue.",
  }
}

function orderMeta(order: CommercialOrderReminderDigestOrder) {
  return [order.storeName, order.dueLabel].join(" · ")
}

export function CommercialOrderReminderDigestEmail({
  input,
}: {
  input: CommercialOrderReminderDigestEmailInput
}) {
  const content = getContent(input)
  const sections = visibleSections(input)

  return (
    <BrandEmail
      cta={
        input.ordersUrl
          ? { href: input.ordersUrl, label: "Open orders" }
          : undefined
      }
      eyebrow={`${input.businessName} / Deliveries`}
      intro={content.intro}
      note={content.note}
      preview={commercialOrderReminderDigestSummary(input)}
      title={content.title}
    >
      <EmailStatus label={content.status} tone="attention" />
      {sections.map((section) => (
        <Section key={section.timing} style={{ margin: "4px 0 20px" }}>
          <Text
            style={{
              color: emailPalette.muted,
              fontSize: "12px",
              fontWeight: 700,
              letterSpacing: "0.04em",
              lineHeight: "18px",
              margin: "0 0 4px",
              textTransform: "uppercase",
            }}
          >
            {section.label} · {section.total}
          </Text>
          {section.orders.map((order) => (
            <Row
              key={order.orderNumber}
              style={{ borderTop: `1px solid ${emailPalette.border}` }}
            >
              <Column style={{ padding: "11px 0", verticalAlign: "top" }}>
                <Text
                  style={{
                    color: emailPalette.ink,
                    fontSize: "14px",
                    fontWeight: 700,
                    lineHeight: "20px",
                    margin: 0,
                  }}
                >
                  {order.orderUrl ? (
                    <Link
                      href={order.orderUrl}
                      style={{ color: emailPalette.ink }}
                    >
                      {order.orderNumber}
                    </Link>
                  ) : (
                    order.orderNumber
                  )}
                  {order.customerName ? ` · ${order.customerName}` : ""}
                </Text>
                <Text
                  style={{
                    color: emailPalette.muted,
                    fontSize: "12px",
                    lineHeight: "18px",
                    margin: "2px 0 0",
                  }}
                >
                  {orderMeta(order)}
                </Text>
              </Column>
            </Row>
          ))}
          {section.hidden ? (
            <Text
              style={{
                borderTop: `1px solid ${emailPalette.border}`,
                color: emailPalette.muted,
                fontSize: "12px",
                lineHeight: "18px",
                margin: 0,
                padding: "11px 0 0",
              }}
            >
              and {section.hidden} more
            </Text>
          ) : null}
        </Section>
      ))}
    </BrandEmail>
  )
}

export function renderCommercialOrderReminderDigestTemplate(
  input: CommercialOrderReminderDigestEmailInput,
) {
  const content = getContent(input)
  const sections = visibleSections(input)

  return {
    html: renderEmailMarkup(
      <CommercialOrderReminderDigestEmail input={input} />,
    ),
    text: [
      createEmailText({
        cta: input.ordersUrl
          ? { href: input.ordersUrl, label: "Open orders" }
          : undefined,
        intro: content.intro,
        title: content.title,
      }),
      ...sections.map((section) =>
        [
          "",
          `${section.label} (${section.total})`,
          ...section.orders.map(
            (order) =>
              `- ${order.orderNumber}${order.customerName ? ` · ${order.customerName}` : ""} — ${orderMeta(order)}`,
          ),
          ...(section.hidden ? [`- and ${section.hidden} more`] : []),
        ].join("\n"),
      ),
      "",
      content.note,
    ].join("\n"),
  }
}

export default CommercialOrderReminderDigestEmail
