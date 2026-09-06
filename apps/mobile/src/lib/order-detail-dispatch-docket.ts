import {
  type CommercialOrder,
  commerceStatusLabel,
} from "@/components/mobile/commerce/commerce-model"
import { getCommercialOrderOverviewSummary } from "@/components/mobile/commerce/commercial-order-overview-model"
import { formatMinorMoney } from "@ewatrade/utils"

export type OrderDetailDispatchDocketPresentation = {
  balanceLabel: string
  fulfillmentLabel: string
  fulfillmentScheduledForFuture: boolean
  fulfillmentUnlockAtMs: number | null
  itemLabel: string
  lineLabel: string
  movementProgressLabel: string
  nextMovement: {
    detail: string
    label: string
    stepLabel: string
  }
  paymentLabel: string
  statusLabel: string
  totalLabel: string
}

export function formatOrderDetailMoney(
  amountMinor: number,
  currencyCode: string,
) {
  return formatMinorMoney(amountMinor, currencyCode).replace(/\.00$/, "")
}

export function getOrderDetailDispatchDocketPresentation(
  order: CommercialOrder,
  now = Date.now(),
): OrderDetailDispatchDocketPresentation {
  const summary = getCommercialOrderOverviewSummary(order)
  const parsedDeliveryDueTime = order.deliveryDueAt
    ? new Date(order.deliveryDueAt).getTime()
    : null
  const fulfillmentUnlockAtMs =
    parsedDeliveryDueTime !== null && Number.isFinite(parsedDeliveryDueTime)
      ? parsedDeliveryDueTime
      : null
  const deliveryIsScheduled =
    fulfillmentUnlockAtMs !== null && fulfillmentUnlockAtMs > now

  let nextMovement = {
    detail: "No further order action is waiting.",
    label: "Order complete",
    stepLabel: "Done",
  }

  if (summary.fulfillableProductLineCount > 0) {
    nextMovement = deliveryIsScheduled
      ? {
          detail: "Reserved stock unlocks at the scheduled delivery time.",
          label: "Wait for scheduled delivery",
          stepLabel: "Scheduled",
        }
      : {
          detail: `${summary.fulfillableProductLineCount} reserved ${
            summary.fulfillableProductLineCount === 1 ? "line is" : "lines are"
          } ready for fulfilment.`,
          label: "Fulfil reserved stock",
          stepLabel: "Fulfil",
        }
  } else if (summary.serviceLineCount > 0 && order.status !== "COMPLETED") {
    nextMovement = {
      detail: `${summary.serviceLineCount} service ${
        summary.serviceLineCount === 1 ? "line continues" : "lines continue"
      } in Service jobs.`,
      label: "Continue service work",
      stepLabel: "Service",
    }
  }

  return {
    balanceLabel: formatOrderDetailMoney(
      order.balanceDueMinor,
      order.currencyCode,
    ),
    fulfillmentLabel:
      summary.productLineCount === 0
        ? summary.serviceLineCount > 0
          ? "Service order"
          : "No product lines"
        : summary.fulfilledProductLineCount === summary.productLineCount
          ? "Fulfilled"
          : deliveryIsScheduled
            ? "Scheduled"
            : summary.fulfillableProductLineCount === 1
              ? "Ready to fulfil"
              : summary.fulfillableProductLineCount > 1
                ? `${summary.fulfillableProductLineCount} ready`
                : `${summary.fulfilledProductLineCount}/${summary.productLineCount} fulfilled`,
    fulfillmentScheduledForFuture: deliveryIsScheduled,
    fulfillmentUnlockAtMs,
    itemLabel: `${summary.itemCount.toLocaleString()} ${
      summary.itemCount === 1 ? "item" : "items"
    }`,
    lineLabel: `${summary.lineCount.toLocaleString()} ${
      summary.lineCount === 1 ? "order line" : "order lines"
    }`,
    movementProgressLabel:
      summary.productLineCount > 0
        ? `${summary.fulfilledProductLineCount} / ${summary.productLineCount} fulfilled`
        : summary.serviceLineCount > 0
          ? `${summary.serviceLineCount} ${summary.serviceLineCount === 1 ? "service" : "services"}`
          : "Complete",
    nextMovement,
    paymentLabel:
      order.paymentStatus === "PARTIALLY_PAID"
        ? "Part paid"
        : commerceStatusLabel(order.paymentStatus),
    statusLabel: commerceStatusLabel(order.status),
    totalLabel: formatOrderDetailMoney(order.totalMinor, order.currencyCode),
  }
}
