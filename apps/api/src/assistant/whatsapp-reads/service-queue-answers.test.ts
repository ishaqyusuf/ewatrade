import { expect, test } from "bun:test"
import { generalAnswerSchema } from "@ewatrade/assistant/general/contracts"
import {
  type ServiceQueueAnswerPage,
  generalServiceQueueAnswers,
} from "./service-queue-answers"

type Job = ServiceQueueAnswerPage["items"][number]
const asOf = "2026-10-15T11:00:00.000Z"
function job(patch: Partial<Job> = {}): Job {
  return {
    id: "saved-job",
    storeId: "saved-store",
    commercialOrderId: "saved-order",
    orderNumber: "ORD-1042",
    currencyCode: "NGN",
    orderTotalMinor: 12500,
    amountPaidMinor: 5000,
    balanceDueMinor: 7500,
    paymentStatus: "PARTIALLY_PAID",
    customerName: "Amina",
    summary: "ready_for_handoff",
    customerMilestone: "ready",
    priority: "urgent",
    revision: 3,
    dueCommitmentAt: new Date("2026-10-15T15:00:00+01:00"),
    handedOffAt: null,
    lines: [
      {
        id: "saved-line",
        allocatedQuantity: "9007199254740993.125",
        catalogItemName: "Washing",
        variantName: "Delicate",
        offeringName: "Washing service",
        revision: 7,
        status: "READY_FOR_HANDOFF",
        authorizationStatus: "AUTHORIZED",
        authorizationPolicy: "MANUAL_RELEASE",
      },
    ],
    ...patch,
  }
}

test("authorized Service queue cards preserve saved states, exact amounts and unconverted allocated quantities", () => {
  const answers = generalServiceQueueAnswers(
    {
      items: [
        job(),
        job({
          id: "second-job",
          orderNumber: "ORD-1043",
          currencyCode: "USD",
          orderTotalMinor: 199,
          amountPaidMinor: 0,
          balanceDueMinor: 199,
        }),
      ],
      nextCursor: "private-next-job",
    },
    { storeName: "Main Store", due: "today", query: "Amina", asOf },
  )
  expect(answers[0]?.value).toBe("2 jobs on this page")
  expect(answers[0]?.detail).toContain("not a complete queue")
  expect(answers[1]?.value).toBe("ready for handoff")
  expect(answers[1]?.detail).toContain("unpaid ₦75.00")
  expect(answers[1]?.detail).toContain("PARTIALLY_PAID")
  expect(answers[1]?.detail).toContain("2026-10-15T14:00:00.000Z (UTC)")
  expect(answers[1]?.detail).toContain("No handoff recorded")
  expect(answers[2]?.value).toBe("9007199254740993.125 allocated")
  expect(answers[2]?.detail).toContain("Line revision 7")
  expect(answers[2]?.detail).toContain(
    "does not supply the quantity's unit name",
  )
  expect(answers[3]?.detail).toContain("1.99")
  expect(
    answers.every(
      (answer) =>
        answer.asOf === asOf && generalAnswerSchema.safeParse(answer).success,
    ),
  ).toBe(true)
  expect(JSON.stringify(answers)).not.toContain("private-next-job")
})

test("empty/filtered queue pages never present native unfiltered count as a search total", () => {
  const page = { items: [], nextCursor: "next-job", totalCount: 123456 }
  const answers = generalServiceQueueAnswers(page, {
    storeName: "Shop",
    query: "unmatched",
    cursor: "previous-job",
    asOf,
  })
  expect(answers).toHaveLength(1)
  expect(answers[0]?.value).toBe("0 jobs on this page")
  expect(answers[0]?.detail).toContain("Continuation page")
  expect(answers[0]?.detail).toContain("More jobs")
  expect(JSON.stringify(answers)).not.toContain("123456")
  expect(JSON.stringify(answers)).not.toContain("previous-job")
})

test("line omission and shortened labels remain explicit and private raw work data is never copied", () => {
  const original = job()
  const line = original.lines[0]
  if (!line) throw Error("Synthetic line missing")
  const source = {
    ...original,
    customerName: "A".repeat(400),
    lines: Array.from({ length: 8 }, (_, index) => ({
      ...line,
      id: `line-${index}`,
      catalogItemName: "👨‍👩‍👧‍👦 work ".repeat(60),
      variantName: "V".repeat(400),
      offeringName: "O".repeat(400),
    })),
    notes: [{ body: "never-copy-private-notes" }],
    evidence: [{ assetId: "never-copy-asset" }],
    notificationIntents: [{ renderedMessage: "never-copy-recipient" }],
  }
  const before = JSON.stringify(source)
  const answers = generalServiceQueueAnswers(
    { items: [source], nextCursor: undefined },
    { storeName: "Shop", asOf },
  )
  expect(answers).toHaveLength(5)
  expect(answers[1]?.detail).toContain("3 of 8 saved lines shown")
  expect(answers[1]?.detail).toContain("further lines omitted")
  expect(answers[2]?.detail).toContain("labels are shortened")
  expect(
    answers.every((answer) => generalAnswerSchema.safeParse(answer).success),
  ).toBe(true)
  expect(JSON.stringify(answers)).not.toContain("never-copy")
  expect(JSON.stringify(source)).toBe(before)
})
