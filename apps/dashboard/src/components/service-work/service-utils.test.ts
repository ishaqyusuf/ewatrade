import { describe, expect, test } from "bun:test"

import { catalogOfferingDisplayName } from "./service-utils"
import { formatDue } from "./service-utils"

describe("catalogOfferingDisplayName", () => {
  test("removes repeated item and variant segments", () => {
    expect(catalogOfferingDisplayName("Suit", "Suit · SM", "Suit · SM")).toBe(
      "Suit · SM",
    )
  })

  test("keeps distinct generic service segments", () => {
    expect(
      catalogOfferingDisplayName(
        "Business advisory",
        "Standard",
        "Consultation",
      ),
    ).toBe("Business advisory · Standard · Consultation")
  })
})

describe("formatDue", () => {
  test("uses the tenant timezone consistently", () => {
    expect(formatDue("2026-07-21T14:43:00.000Z", "Africa/Lagos")).toContain(
      "15:43",
    )
  })
})

import {
  formatWhen,
  jobNextStep,
  jobStage,
  requestStatus,
} from "./service-utils"

const line = (
  status: string,
  authorizationStatus = "AUTHORIZED",
  catalogItemName = "Bird vaccination",
) => ({ authorizationStatus, catalogItemName, status }) as never

const job = (summary: string, lines: never[], balanceDueMinor = 0) =>
  ({ balanceDueMinor, handedOffAt: null, lines, summary }) as never

describe("jobStage and jobNextStep", () => {
  test("a queued job waiting for payment asks for payment first", () => {
    const waiting = job("queued", [line("QUEUED", "PENDING_PAYMENT")], 500_000)
    expect(jobStage(waiting).label).toBe("Waiting for payment")
    expect(jobNextStep(waiting, false)).toEqual({
      action: "pay",
      label: "Take payment",
    })
  })

  test("only managers get Approve start for manager-gated work", () => {
    const gated = job("queued", [line("QUEUED", "PENDING_RELEASE")])
    expect(jobStage(gated).label).toBe("Needs manager OK")
    expect(jobNextStep(gated, true)?.action).toBe("approve")
    expect(jobNextStep(gated, false)).toBeNull()
  })

  test("ready work completes independently of collection", () => {
    expect(
      jobNextStep(job("ready_for_handoff", [line("READY_FOR_HANDOFF")]), false),
    ).toEqual({ action: "complete", label: "Complete job" })
    const cleaning = job("ready_for_handoff", [
      line("READY_FOR_HANDOFF", "AUTHORIZED", "Home cleaning"),
    ])
    expect(jobStage(cleaning).label).toBe("Customer sign-off")
    expect(jobNextStep(cleaning, false)?.label).toBe("Complete job")
  })

  test("stuck work continues; finished work has no next step", () => {
    expect(jobNextStep(job("blocked", [line("BLOCKED")]), false)?.action).toBe(
      "resume",
    )
    expect(jobNextStep(job("completed", [line("COMPLETED")]), true)).toBeNull()
  })
})

describe("formatWhen", () => {
  const now = new Date("2026-10-21T10:00:00.000Z")
  test("names today, tomorrow and yesterday in the store's time zone", () => {
    expect(formatWhen("2026-10-21T13:00:00.000Z", "Africa/Lagos", now)).toBe(
      "Today, 2:00pm",
    )
    expect(formatWhen("2026-10-22T09:00:00.000Z", "Africa/Lagos", now)).toBe(
      "Tomorrow, 10:00am",
    )
    expect(formatWhen("2026-10-20T15:00:00.000Z", "Africa/Lagos", now)).toBe(
      "Yesterday, 4:00pm",
    )
    expect(formatWhen(null)).toBe("No due date")
  })
})

describe("requestStatus", () => {
  test("uses plain words for request states", () => {
    expect(requestStatus("SUBMITTED").label).toBe("New")
    expect(requestStatus("NEEDS_INFORMATION").label).toBe(
      "Waiting for customer",
    )
  })
})
