import {
  type CommercialOrder,
  commerceStatusLabel,
} from "@/components/mobile/commerce/commerce-model"
import { getCommercialOrderOverviewSummary } from "@/components/mobile/commerce/commercial-order-overview-model"
import { formatMinorMoney } from "@ewatrade/utils"

export type OrderDetailDispatchDocketPresentation = {
  balanceLabel: string
  itemLabel: string
  lineLabel: string
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
  const deliveryDueTime = order.deliveryDueAt
    ? new Date(order.deliveryDueAt).getTime()
    : null
  const deliveryIsScheduled =
    deliveryDueTime !== null && Number.isFinite(deliveryDueTime)
      ? deliveryDueTime > now
      : false

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
    itemLabel: `${summary.itemCount.toLocaleString()} ${
      summary.itemCount === 1 ? "item" : "items"
    }`,
    lineLabel: `${summary.lineCount.toLocaleString()} ${
      summary.lineCount === 1 ? "order line" : "order lines"
    }`,
    nextMovement,
    paymentLabel:
      order.paymentStatus === "PARTIALLY_PAID"
        ? "Part paid"
        : commerceStatusLabel(order.paymentStatus),
    statusLabel: commerceStatusLabel(order.status),
    totalLabel: formatOrderDetailMoney(order.totalMinor, order.currencyCode),
  }
}
