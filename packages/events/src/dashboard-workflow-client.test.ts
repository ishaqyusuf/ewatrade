import { expect, test } from "bun:test"
import { createDashboardWorkflowClient } from "./dashboard-workflow-client"
test("REST tracking records safe HTTP acknowledgement and preserves application responses", async () => {
  const events: unknown[][] = []
  const response = Response.json(
    { email: "private@example.com" },
    { status: 403 },
  )
  const client = createDashboardWorkflowClient(
    {
      workflow: (...args) => {
        events.push(args)
      },
    },
    async () => response,
  )
  expect(
    await client.fetch("signup", "/api/auth/signup", {
      method: "POST",
      body: "private password",
    }),
  ).toBe(response)
  expect(events).toEqual([
    ["signup", "started", { channel: "browser" }],
    ["signup", "blocked", { channel: "browser_response" }],
  ])
  expect(JSON.stringify(events)).not.toContain("private")
})
test("tracking exceptions cannot prevent a request or replace its result/error", async () => {
  const response = Response.json({ success: true })
  const workflow = () => {
    throw new Error("analytics down")
  }
  const success = createDashboardWorkflowClient(
    { workflow },
    async () => response,
  )
  expect(await success.fetch("login", "/api/auth/login")).toBe(response)
  const error = new Error("network failed")
  const failure = createDashboardWorkflowClient({ workflow }, async () => {
    throw error
  })
  await expect(failure.fetch("login", "/api/auth/login")).rejects.toBe(error)
})
