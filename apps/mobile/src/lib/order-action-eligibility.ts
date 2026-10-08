export function isClosedOrder(status: string) {
  return status === "CANCELLED" || status === "REFUNDED"
}
export function canRecordOrderPayment(order: {
  status: string
  balanceDueMinor: number
}) {
  return !isClosedOrder(order.status) && order.balanceDueMinor > 0
}
