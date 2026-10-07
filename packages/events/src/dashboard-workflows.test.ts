import { expect, test } from "bun:test"
import { eventNameSchema } from "@ishaqyusuf/logly-core"
import {
  dashboardBrowserActions,
  dashboardProcedure,
  dashboardProcedures,
  procedureOutcome,
  workflowEvent,
  workflowFailure,
} from "./dashboard-workflows"
import { safeBatch, safeRoute } from "./policy"

test("all eighteen areas have explicit, valid event vocabulary", () => {
  const categories = new Set<string>()
  const names = new Set<string>()
  for (const path of Object.keys(dashboardProcedures)) {
    const workflow = dashboardProcedure(path)
    if (!workflow) throw new Error(`Missing vocabulary: ${path}`)
    categories.add(workflow.category)
    for (const phase of [
      "started",
      "completed",
      "failed",
      "blocked",
      "cancelled",
      "observed",
    ] as const) {
      const event = workflowEvent(workflow, phase)
      expect(eventNameSchema.safeParse(event.name).success).toBe(true)
      expect(names.has(event.name)).toBe(false)
      names.add(event.name)
    }
  }
  for (const workflow of Object.values(dashboardBrowserActions)) {
    categories.add(workflow.category)
    expect(
      eventNameSchema.safeParse(workflowEvent(workflow, "completed").name)
        .success,
    ).toBe(true)
  }
  expect(categories.size).toBe(18)
  expect(dashboardProcedure("qaAccess.exchange")).toBeNull()
  expect(dashboardProcedure("serviceCommerce.mobileSendText")).toBeNull()
  expect(dashboardProcedure("orders.user@example.com")).toBeNull()
  expect(dashboardProcedure("toString")).toBeNull()
})
test("partial setup batches cannot masquerade as completed activation", () => {
  expect(
    procedureOutcome("setupAssistant.commit", {
      results: [
        { state: "COMMITTED", recordId: "private" },
        { state: "FAILED", message: "sensitive" },
      ],
    }),
  ).toEqual({ phase: "failed", itemCount: 1 })
  expect(
    procedureOutcome("setupAssistant.commit", {
      interrupted: true,
      results: [{ state: "COMMITTED" }],
    }),
  ).toEqual({ phase: "blocked", itemCount: 1 })
  expect(procedureOutcome("setupAssistant.commit", { results: [] })).toEqual({
    phase: "completed",
    itemCount: 0,
  })
  expect(workflowFailure("FORBIDDEN")).toBe("blocked")
  expect(workflowFailure("INTERNAL_SERVER_ERROR")).toBe("failed")
})
test("actual dashboard routes remain useful without leaking identifiers or query text", () => {
  for (const route of [
    "sales",
    "finance",
    "services",
    "conversations",
    "prescriptions",
    "signup",
  ])
    expect(safeRoute(`/${route}/private-id?q=private@example.com`)).toBe(
      `/${route}`,
    )
  expect(safeRoute("/settings/channels?token=secret")).toBe(
    "/settings/channels",
  )
  expect(safeRoute("/settings/private@example.com")).toBe("/settings")
  expect(safeRoute("/finance/reports/private-id")).toBe("/finance/reports")
  const event = workflowEvent(dashboardBrowserActions.search, "started")
  const batch = safeBatch(
    {
      sentAt: new Date().toISOString(),
      sdk: { name: "@ishaqyusuf/logly-core", version: "0.2.0" },
      events: [
        {
          eventId: crypto.randomUUID(),
          project: "wrong",
          version: 1,
          source: "browser",
          occurredAt: new Date().toISOString(),
          name: event.name,
          properties: {
            ...event.properties,
            query: "secret",
            email: "private@example.com",
            amount: 1000,
            message: "clinical",
          },
        },
      ],
    },
    "ewatrade-dashboard",
  )
  expect(batch.events[0]?.properties).toEqual(event.properties)
})
