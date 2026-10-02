import { describe, expect, test } from "bun:test"

import {
  getCatalogListPageInput,
  loadCatalogFilterParams,
} from "./use-catalog-filter-params"
import {
  getOrderListPageInput,
  loadOrderFilterParams,
} from "./use-order-filter-params"
import {
  getServiceWorkQueuePageInput,
  loadServiceWorkFilterParams,
} from "./use-service-work-filter-params"

describe("server-backed commerce list filters", () => {
  test("loads catalog URL filters and preserves the full-query API input", async () => {
    const filter = await loadCatalogFilterParams({
      catalogKind: "product",
      catalogQuery: "  ginger  ",
      catalogStatus: "draft",
      productUnits: "unit_1",
    })

    expect(filter).toEqual({
      kind: "product",
      query: "  ginger  ",
      status: "draft",
    })
    expect(getCatalogListPageInput(filter)).toEqual({
      kind: "product",
      limit: 25,
      query: "ginger",
      status: "draft",
    })
  })

  test("ignores invalid catalog and order enum values", async () => {
    const catalogFilter = await loadCatalogFilterParams({
      catalogKind: "invalid",
      catalogStatus: "published",
    })
    const orderFilter = await loadOrderFilterParams({
      orderStatus: "PENDING-ish",
    })

    expect(catalogFilter).toEqual({ kind: null, query: null, status: null })
    expect(orderFilter.status).toBeNull()
    expect(getOrderListPageInput(orderFilter)).toEqual({
      limit: 25,
      queryMode: "all",
      query: undefined,
      statuses: undefined,
    })
  })

  test("maps order search and status to the supported server filter", async () => {
    const filter = await loadOrderFilterParams({
      orderQuery: "  EW-104  ",
      orderStatus: "READY_FOR_PICKUP",
      orderSheet: "create",
    })

    expect(getOrderListPageInput(filter)).toEqual({
      limit: 25,
      query: "EW-104",
      queryMode: "all",
      statuses: ["READY_FOR_PICKUP"],
    })
  })

  test("maps service priority, due, assignee, and query to queue page input", async () => {
    const filter = await loadServiceWorkFilterParams({
      serviceAssignee: "user_1",
      serviceDue: "overdue",
      servicePriority: "urgent",
      serviceQuery: "  order-7  ",
      serviceSheet: "job",
    })

    expect(getServiceWorkQueuePageInput(filter)).toEqual({
      assigneeUserId: "user_1",
      due: "overdue",
      limit: 25,
      priority: "urgent",
      query: "order-7",
    })
  })

  test("omits default service filters and rejects unsupported URL choices", async () => {
    const filter = await loadServiceWorkFilterParams({
      serviceDue: "this_week",
      servicePriority: "critical",
    })

    expect(filter.due).toBeNull()
    expect(filter.priority).toBeNull()
    expect(getServiceWorkQueuePageInput(filter)).toEqual({
      assigneeUserId: undefined,
      due: undefined,
      limit: 25,
      priority: undefined,
      query: undefined,
    })
  })
})
