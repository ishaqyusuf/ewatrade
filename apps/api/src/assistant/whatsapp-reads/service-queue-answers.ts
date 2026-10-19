import {
  type GeneralAnswer,
  generalMoney,
} from "@ewatrade/assistant/general/contracts"
import type { listServiceWorkQueuePage } from "@ewatrade/db/queries"

type Queue = Awaited<ReturnType<typeof listServiceWorkQueuePage>>
type Job = Queue["items"][number]
type Line = Job["lines"][number]
type QueueJob = Pick<
  Job,
  | "id"
  | "storeId"
  | "commercialOrderId"
  | "orderNumber"
  | "currencyCode"
  | "orderTotalMinor"
  | "amountPaidMinor"
  | "balanceDueMinor"
  | "paymentStatus"
  | "customerName"
  | "summary"
  | "customerMilestone"
  | "priority"
  | "revision"
  | "dueCommitmentAt"
  | "handedOffAt"
> & {
  lines: Array<
    Pick<
      Line,
      | "id"
      | "allocatedQuantity"
      | "catalogItemName"
      | "variantName"
      | "offeringName"
      | "revision"
      | "status"
      | "authorizationStatus"
      | "authorizationPolicy"
    >
  >
}
export type ServiceQueueAnswerPage = Pick<Queue, "nextCursor"> & {
  items: QueueJob[]
}
function label(value: string, max: number) {
  if (value.length <= max) return value
  let result = ""
  for (const { segment } of new Intl.Segmenter("en", {
    granularity: "grapheme",
  }).segment(value)) {
    if (result.length + segment.length > max - 1) break
    result += segment
  }
  return `${result}…`
}
function money(value: number, currency: string) {
  if (!Number.isSafeInteger(value))
    throw Error("Exact Service order amount unavailable.")
  return generalMoney(value, currency)
}
function at(value: Date | string) {
  const date = new Date(value)
  return Number.isFinite(date.getTime())
    ? date.toISOString()
    : "time unavailable"
}
/** Existing authorized queue facts only; no requests, versions, units or identities are inferred. */
export function generalServiceQueueAnswers(
  page: ServiceQueueAnswerPage,
  options: {
    storeName: string
    query?: string
    due?: "all" | "overdue" | "today"
    cursor?: string
    asOf?: string
  },
): GeneralAnswer[] {
  // The shared tool requests ten jobs; cap line cards to preserve the saved reply bound.
  if (page.items.length > 10)
    throw Error("Service queue answer page exceeds its bound.")
  const asOf = options.asOf ?? new Date().toISOString()
  const scope = label(`${options.storeName} · Service work queue`, 500)
  const answers: GeneralAnswer[] = [
    {
      id: `service_queue_${crypto.randomUUID()}`,
      title: "Service work queue",
      value: `${page.items.length} jobs on this page`,
      scope,
      asOf,
      detail: `${options.cursor ? "Continuation page" : "First page"}. Search: ${label(options.query ?? "none", 160)}; due filter: ${options.due ?? "all"}, as defined by the work queue. ${page.nextCursor ? "More jobs are available; continue with the same filters." : "End of this live result page."} This is a bounded authorized work page, not a complete queue, request count or financial total. Job, line, customer milestone and recorded payment states are separate facts.`,
    },
  ]
  for (const job of page.items) {
    const shownLines = job.lines.slice(0, 3)
    answers.push({
      id: `service_job_${crypto.randomUUID()}`,
      title: label(`Service work · ${job.orderNumber}`, 160),
      value: label(job.summary.replaceAll("_", " "), 160),
      scope,
      asOf,
      detail: `Order ${label(job.orderNumber, 100)} · customer ${label(job.customerName ?? "not recorded", 100)}. Job revision ${job.revision}; priority ${job.priority}; customer milestone ${job.customerMilestone}. Recorded Order payment ${job.paymentStatus}; order value ${money(job.orderTotalMinor, job.currencyCode)}, recorded paid ${money(job.amountPaidMinor, job.currencyCode)}, unpaid ${money(job.balanceDueMinor, job.currencyCode)}. Not customer-ledger debt, new money received or provider settlement. ${job.dueCommitmentAt ? `Current saved promise ${at(job.dueCommitmentAt)} (UTC).` : "No current due promise recorded."} ${job.handedOffAt ? `Saved handoff ${at(job.handedOffAt)} (UTC).` : "No handoff recorded; ready work does not establish handoff."} ${shownLines.length} of ${job.lines.length} saved lines shown${job.lines.length > shownLines.length ? "; further lines omitted—open this saved job in EwaTrade" : ""}.`,
    })
    for (const [index, line] of shownLines.entries()) {
      const quantity = `${line.allocatedQuantity} allocated`
      if (quantity.length > 160)
        throw Error("Exact allocated Service quantity exceeds answer bounds.")
      const shortened =
        line.catalogItemName.length > 110 ||
        line.variantName.length > 120 ||
        line.offeringName.length > 120
      answers.push({
        id: `service_line_${crypto.randomUUID()}`,
        title: label(`${index + 1}. ${line.catalogItemName}`, 160),
        value: quantity,
        scope: label(
          `${options.storeName} · ${job.orderNumber} · Service work`,
          500,
        ),
        asOf,
        detail: `${shortened ? "Some line labels are shortened; open the original job for full names. " : ""}Variant ${label(line.variantName, 120)} · offering ${label(line.offeringName, 120)}. Line revision ${line.revision}; work status ${line.status}; authorization ${line.authorizationStatus} under ${line.authorizationPolicy}. Current saved allocated quantity is not completed work, handed-off quantity or stock. This queue does not supply the quantity's unit name; no unit conversion is inferred. No request, quotation/version or booking identity is inferred from a Job or Order.`,
      })
    }
  }
  return answers
}
