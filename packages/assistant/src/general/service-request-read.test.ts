import { expect, test } from "bun:test"
import {
  generalReadContinuationContext,
  nextGeneralReadRequest,
  parseGeneralReadContinuation,
} from "./read-continuation"
import {
  type ServiceRequestTarget,
  serviceRequestOriginalInput,
  serviceRequestPageInput,
  serviceRequestTargetSchema,
} from "./service-request-read"

test("bounded generic request discovery has explicit filter semantics", () => {
  expect(serviceRequestPageInput.parse({})).toEqual({ limit: 10 })
  expect(
    serviceRequestPageInput.parse({
      status: "withdrawn",
      query: "  shoe repair  ",
      limit: 1,
    }),
  ).toEqual({ status: "withdrawn", query: "shoe repair", limit: 1 })
  for (const input of [
    { limit: 0 },
    { limit: 11 },
    { limit: 1.5 },
    { status: "SUBMITTED" },
    { query: " " },
    { query: "x".repeat(121) },
    { cursor: "" },
    { cursor: "x".repeat(4097) },
    { tenantId: "foreign" },
    { storeId: "foreign" },
    { actorUserId: "other" },
    { sourceType: "PRESCRIPTION_REQUEST" },
    { publicToken: "bearer" },
  ])
    expect(serviceRequestPageInput.safeParse(input).success).toBe(false)
})

test("an exact request target preserves origin without putting it into protected input", () => {
  const target: ServiceRequestTarget = {
    kind: "service_request",
    requestId: "request-1",
    origin: { tenantId: "business-1", storeId: "store-1" },
  }
  expect(
    serviceRequestTargetSchema.parse(JSON.parse(JSON.stringify(target))),
  ).toEqual(target)
  expect(serviceRequestOriginalInput.parse({ requestId: "request-1" })).toEqual(
    {
      requestId: "request-1",
    },
  )
  for (const input of [
    target,
    { requestId: "request-1", tenantId: "business-1" },
    { requestId: "request-1", sourceId: "clinical-1" },
    { requestId: "request-1", token: "bearer" },
    { requestId: "x".repeat(129) },
  ])
    expect(serviceRequestOriginalInput.safeParse(input).success).toBe(false)
  for (const input of [
    { ...target, kind: "service_job" },
    { ...target, origin: undefined },
    { ...target, origin: { ...target.origin, actorUserId: "other" } },
    { ...target, intentId: "unrelated-message" },
  ])
    expect(serviceRequestTargetSchema.safeParse(input).success).toBe(false)
})

test("saved request continuation preserves all filters and never becomes a write or source override", () => {
  const hint = {
    version: 1,
    tool: "readServiceRequests",
    input: { status: "needs_information", query: "shoe", limit: 3 },
    nextCursor: "next-bound-cursor",
  }
  const saved = JSON.parse(JSON.stringify(hint))
  expect(nextGeneralReadRequest(saved)).toEqual({
    tool: "readServiceRequests",
    input: {
      status: "needs_information",
      query: "shoe",
      limit: 3,
      cursor: "next-bound-cursor",
    },
  })
  expect(nextGeneralReadRequest({ ...hint, nextCursor: null })).toBeUndefined()
  expect(
    parseGeneralReadContinuation({
      ...hint,
      input: { ...hint.input, storeId: "foreign" },
    }),
  ).toBeUndefined()
  expect(
    parseGeneralReadContinuation({ ...hint, tool: "updateServiceRequest" }),
  ).toBeUndefined()
  const context = generalReadContinuationContext([
    {
      role: "user",
      parts: [{ type: "data-general-answer", data: { continuation: hint } }],
    },
  ])
  expect(context).toBeUndefined()
  expect(
    generalReadContinuationContext([
      {
        role: "assistant",
        parts: [{ type: "data-general-answer", data: { continuation: hint } }],
      },
    ]),
  ).toContain('"tool":"readServiceRequests"')
})
