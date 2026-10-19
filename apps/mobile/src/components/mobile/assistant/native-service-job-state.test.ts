import { expect, test } from "bun:test"
import {
  nativeServiceJobContext,
  nativeServiceJobId,
  nativeServiceJobMatches,
} from "./native-service-job-state"

const scope = {
  tenantId: "tenant",
  storeId: "store",
  actorUserId: "actor",
  role: "OWNER",
}
const context = {
  tenantId: "tenant",
  storeId: "store",
  actorUserId: "actor",
  job: {
    id: "job",
    orderNumber: "ORD-1042",
    customerName: "Amina",
    promisedAt: null,
  },
  line: null,
  assignees: [],
  assigneesComplete: true,
}
test("current Job handover fixes exact Job, actor, business, Store and Job-level guard", () => {
  expect(nativeServiceJobContext(context, scope, "job")).toEqual(context)
  for (const changed of [
    { tenantId: "other" },
    { storeId: "other" },
    { actorUserId: "other" },
    { job: { ...context.job, id: "other" } },
    {
      line: {
        id: "line",
        offeringName: "X",
        variantName: "X",
        quantity: "1",
        status: "QUEUED",
        authorizationStatus: "AUTHORIZED",
      },
    },
  ])
    expect(() =>
      nativeServiceJobContext({ ...context, ...changed }, scope, "job"),
    ).toThrow()
})
test("current Job selector accepts only the guarded identity/Store/order linkage", () => {
  const job = {
    id: "job",
    storeId: "store",
    orderNumber: "ORD-1042",
    commercialOrderId: "order",
  }
  const accepts = (value: unknown) =>
    nativeServiceJobMatches(
      value as Parameters<typeof nativeServiceJobMatches>[0],
      context,
      "job",
    )
  expect(accepts(job)).toBe(true)
  for (const changed of [
    null,
    undefined,
    { ...job, id: "another-queue-job" },
    { ...job, storeId: "other" },
    { ...job, orderNumber: "ORD-OTHER" },
    { ...job, commercialOrderId: "" },
  ])
    expect(accepts(changed)).toBe(false)
})
test("empty, oversized and nonstring Job navigation cannot prepare a read", () => {
  expect(nativeServiceJobId.parse(" job ")).toBe("job")
  for (const value of ["", " ", "x".repeat(129), null, {}, ["job"]])
    expect(nativeServiceJobId.safeParse(value).success).toBe(false)
})
