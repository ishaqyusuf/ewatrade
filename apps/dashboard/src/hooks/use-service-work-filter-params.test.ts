import { expect, test } from "bun:test"
import { getServiceWorkQueuePageInput } from "./use-service-work-filter-params"

test("default list shows all jobs newest first while explicit historical stages remain available", () => {
  const filter = {
    assigneeUserId: null,
    due: null,
    priority: null,
    query: null,
    stage: null,
  }
  expect(getServiceWorkQueuePageInput(filter).stage).toBe("all")
  expect(getServiceWorkQueuePageInput(filter).sort).toEqual({
    field: "createdAt",
    direction: "desc",
  })
  expect(getServiceWorkQueuePageInput({ ...filter, stage: "all" }).stage).toBe(
    "all",
  )
  expect(getServiceWorkQueuePageInput({ ...filter, stage: "done" }).stage).toBe(
    "done",
  )
})
