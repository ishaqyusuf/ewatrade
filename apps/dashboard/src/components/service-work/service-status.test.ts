import { expect, test } from "bun:test"
import { serviceActivityEvents } from "./service-activity"
import { serviceStatusChoices } from "./service-status"
import { type WorkJob, jobStage } from "./service-utils"

function job(
  summary: WorkJob["summary"],
  status: WorkJob["lines"][number]["status"],
  authorizationStatus: WorkJob["lines"][number]["authorizationStatus"] = "AUTHORIZED",
) {
  return {
    summary,
    balanceDueMinor: 500,
    handedOffAt: null,
    createdAt: new Date("2026-10-23T08:00:00Z"),
    lines: [
      {
        id: "shirt",
        status,
        authorizationStatus,
        catalogItemName: "Laundry",
        offeringName: "Shirt · Wash & iron",
      },
    ],
    events: [],
  } as unknown as WorkJob
}

test("status choices contain progress only; completion opens the independent work review", () => {
  const draft = job("queued", "QUEUED")
  const choices = serviceStatusChoices(draft)
  expect(choices.map((choice) => choice.label)).toEqual([
    "Not started",
    "In progress",
    "Stuck",
    "Ready for customer",
    "Completed",
  ])
  expect(choices.find((choice) => choice.value === "completed")).toMatchObject({
    enabled: true,
    step: "complete",
  })
  expect(draft.summary).toBe("queued")
  expect(
    serviceStatusChoices(job("blocked", "BLOCKED")).find(
      (choice) => choice.value === "in_progress",
    )?.step,
  ).toBe("resume")
  expect(
    serviceStatusChoices(job("ready_for_handoff", "READY_FOR_HANDOFF")).find(
      (choice) => choice.value === "in_progress",
    )?.step,
  ).toBe("start")
  expect(
    serviceStatusChoices(job("ready_for_handoff", "READY_FOR_HANDOFF")).find(
      (choice) => choice.value === "in_progress",
    )?.enabled,
  ).toBe(false)
})

test("gated and terminal jobs never offer progress mutations; saved completion has one label", () => {
  expect(
    serviceStatusChoices(job("queued", "QUEUED", "PENDING_PAYMENT")).every(
      (choice) => !choice.enabled,
    ),
  ).toBe(true)
  const finished = job("completed", "COMPLETED")
  expect(
    serviceStatusChoices(finished).every((choice) => !choice.enabled),
  ).toBe(true)
  expect(jobStage(finished).label).toBe("Completed")
  expect(
    serviceStatusChoices(job("cancelled", "CANCELLED")).find(
      (choice) => choice.value === "cancelled",
    )?.enabled,
  ).toBe(false)
})

test("activity uses recorded transitions and reasons, includes creation, and avoids duplicate note events", () => {
  const source = job("in_progress", "IN_PROGRESS")
  source.events = [
    {
      id: "start",
      type: "STATUS_CHANGED",
      lineId: "shirt",
      fromStatus: "QUEUED",
      toStatus: "IN_PROGRESS",
      reason: "Started washing",
      effectiveAt: new Date("2026-10-23T09:00:00Z"),
      createdAt: new Date("2026-10-23T09:01:00Z"),
    },
    {
      id: "note",
      type: "NOTE_ADDED",
      lineId: null,
      fromStatus: null,
      toStatus: null,
      reason: null,
      effectiveAt: new Date("2026-10-23T09:02:00Z"),
      createdAt: new Date("2026-10-23T09:02:00Z"),
    },
  ]
  const entries = serviceActivityEvents(source)
  expect(entries).toHaveLength(2)
  expect(entries[0]).toMatchObject({
    id: "start",
    title: "Not started → In progress",
    detail: "Shirt · Wash & iron · Started washing",
  })
  expect(entries[0]?.at.toISOString()).toBe("2026-10-23T09:00:00.000Z")
  expect(entries[1]?.title).toBe("Job created")
})
