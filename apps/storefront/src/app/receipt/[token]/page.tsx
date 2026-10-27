import { StorefrontContent } from "@/components/storefront/storefront-content"
import { manualPaymentUrl, quoteAccessSecret } from "@/lib/storefront-commerce"
import {
  customerView,
  loadCustomerSession,
  loadStorefrontPage,
} from "@/lib/storefront-pages"
import { prisma } from "@ewatrade/db"
import {
  getStorefrontOrderReceipt,
  getStorefrontServiceReceipt,
  storefrontReceiptDigest,
} from "@ewatrade/db/queries"
import type { ReceiptView } from "@ewatrade/storefront-templates/commerce-studio"
import type { Metadata } from "next"
import { headers } from "next/headers"
import { notFound } from "next/navigation"

export const dynamic = "force-dynamic"
type Props = { params: Promise<{ token: string }> }

export const metadata: Metadata = {
  title: "Your request",
  robots: { index: false, follow: false },
  // The capability lives in the path; never leak it to other sites.
  referrer: "no-referrer",
}

/** Guest receipt: the token must belong to a request of the business behind this Host. */
export default async function ReceiptPage({ params }: Props) {
  const { token } = await params
  const { load, storefront } = await loadStorefrontPage()
  if (
    load.status !== "ready" ||
    load.snapshot.composition.template.key !== "commerce-studio" ||
    !storefront
  )
    notFound()
  const host = (await headers()).get("host") ?? ""
  const session = await loadCustomerSession()
  const whatsapp = storefront.whatsAppPhone
  let receipt: ReceiptView | null = null
  const order = await getStorefrontOrderReceipt(prisma, { host, token })
  if (order) {
    const owner = await prisma.storefrontOrderRequest.findFirst({
      where: { receiptTokenDigest: storefrontReceiptDigest(token) },
      select: { customerId: true },
    })
    receipt = {
      token,
      kind: "order",
      reference: order.reference,
      businessName: order.businessName,
      stage: order.stage,
      revision: order.revision,
      createdAt: order.createdAt,
      customerName: order.customerName,
      staffResponse: order.staffResponse,
      messages: order.messages,
      currencyCode: order.currencyCode,
      lines: order.lines.map((line) => ({
        key: line.offeringId,
        name: line.itemName,
        option: line.optionName === line.itemName ? "" : line.optionName,
        quantity: line.quantity.replace(/\.?0+$/, "") || line.quantity,
        unitLabel: line.unitLabel,
        unitPriceMinor: line.observedUnitPriceMinor,
      })),
      fulfilment: order.fulfilment as "pickup" | "delivery",
      deliveryAddress: order.deliveryAddress,
      observedSubtotalMinor: order.observedSubtotalMinor,
      order: order.order
        ? {
            orderNumber: order.order.orderNumber,
            status: order.order.status,
            paymentStatus: order.order.paymentStatus,
            totalMinor: order.order.totalMinor,
            paidMinor: order.order.paidMinor,
            balanceMinor: order.order.balanceMinor,
            currencyCode: order.order.currencyCode,
            subtotalMinor: order.order.subtotalMinor,
            deliveryFeeMinor: order.order.deliveryFeeMinor,
            paymentReport: order.order.paymentReport
              ? {
                  status: order.order.paymentReport.status,
                  claimedAmountMinor:
                    order.order.paymentReport.claimedAmountMinor,
                }
              : null,
          }
        : null,
      paymentUrl: manualPaymentUrl(order.order?.paymentLink ?? null),
      businessWhatsApp: whatsapp,
      canLinkToAccount: Boolean(
        session &&
          owner &&
          owner.customerId !== session.customer.id &&
          !owner.customerId,
      ),
    }
  } else {
    const service = await getStorefrontServiceReceipt(prisma, {
      host,
      token,
      quoteSecret: quoteAccessSecret(),
    })
    if (!service) notFound()
    const owner = await prisma.storefrontServiceRequestContext.findFirst({
      where: { receiptTokenDigest: storefrontReceiptDigest(token) },
      select: { customerId: true },
    })
    receipt = {
      token,
      kind: "service",
      reference: service.reference,
      businessName: service.businessName,
      stage: service.stage,
      revision: service.revision,
      createdAt: service.createdAt,
      customerName: service.customerName,
      staffResponse: service.staffResponse,
      messages: service.messages,
      currencyCode: service.lines[0]?.currencyCode ?? storefront.currencyCode,
      lines: service.lines.map((line) => ({
        key: line.offeringId,
        name: line.serviceName,
        option: line.optionName === line.serviceName ? "" : line.optionName,
        quantity: line.quantity.replace(/\.?0+$/, "") || line.quantity,
        unitLabel: null,
        unitPriceMinor: line.priceMinor,
      })),
      preferredDate: service.preferredDate,
      collectionAddress: service.collectionAddress,
      details: service.details,
      quote: service.quote
        ? {
            versionId: service.quote.versionId,
            status: service.quote.status,
            totalMinor: service.quote.totalMinor,
            feeMinor: service.quote.feeMinor,
            currencyCode: service.quote.currencyCode,
            note: service.quote.note,
            expiresAt: service.quote.expiresAt,
            lines: service.quote.lines.map((line) => ({
              name: line.name,
              option: line.option,
              quantity: line.quantity,
              totalMinor: line.totalMinor,
            })),
            acceptUrl: service.quote.acceptToken
              ? `/service-quote/${encodeURIComponent(service.quote.acceptToken)}`
              : null,
          }
        : null,
      appointment: service.appointment
        ? {
            status: service.appointment.status,
            startsAt: service.appointment.startsAt,
            endsAt: service.appointment.endsAt,
            timezone: service.appointment.timezone,
            serviceName: service.appointment.serviceName,
          }
        : null,
      order: service.order
        ? {
            orderNumber: service.order.orderNumber,
            status: service.order.status,
            paymentStatus: service.order.paymentStatus,
            totalMinor: service.order.totalMinor,
            paidMinor: service.order.paidMinor,
            balanceMinor: service.order.balanceMinor,
            currencyCode: service.order.currencyCode,
            paymentReport: service.order.paymentReport,
          }
        : null,
      paymentUrl: manualPaymentUrl(service.order?.paymentLink ?? null),
      businessWhatsApp: whatsapp,
      canLinkToAccount: Boolean(session && owner && !owner.customerId),
    }
  }
  return (
    <StorefrontContent
      snapshot={load.snapshot}
      pageKey="home"
      customer={customerView(session)}
      route={{ kind: "receipt", receipt }}
    />
  )
}
