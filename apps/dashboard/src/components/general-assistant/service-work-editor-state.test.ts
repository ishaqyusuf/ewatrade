import { expect, test } from "bun:test"
import type {
  ServiceWorkEditorAction,
  ServiceWorkEditorContext,
} from "@ewatrade/assistant/general/contracts"
import {
  parseServiceWorkEditorDraft,
  serviceWorkEditorContextMatches,
  serviceWorkEditorReviewMatches,
} from "./service-work-editor-state"
import { preserveReviewedTimestamp } from "./posting-date"

const scope = { tenantId: "tenant", storeId: "store", actorUserId: "actor" }
const context: ServiceWorkEditorContext = {
  ...scope,
  job: {
    id: "job",
    orderNumber: "ORD-1",
    customerName: "Amina",
    promisedAt: null,
  },
  line: {
    id: "line",
    offeringName: "Wash",
    variantName: "Standard",
    quantity: "2",
    status: "QUEUED",
    authorizationStatus: "AUTHORIZED",
  },
  assignees: [{ id: "staff", name: "Saved eligible staff" }],
  assigneesComplete: true,
}
const note: ServiceWorkEditorAction = {
  action: "service_work_note",
  jobId: "job",
  lineId: "line",
  body: "Private note",
}
test("editor context and fresh review require authenticated scope and exact owning target", () => {
  expect(serviceWorkEditorContextMatches(context, scope, note)).toBe(true)
  const review = { ...scope, jobId: "job", lineId: "line" }
  expect(serviceWorkEditorReviewMatches(review, scope, note)).toBe(true)
  for (const patch of [
    { tenantId: "other" },
    { storeId: "other" },
    { actorUserId: "other" },
  ]) {
    expect(
      serviceWorkEditorContextMatches({ ...context, ...patch }, scope, note),
    ).toBe(false)
    expect(
      serviceWorkEditorReviewMatches({ ...review, ...patch }, scope, note),
    ).toBe(false)
  }
  expect(
    serviceWorkEditorContextMatches({ ...context, line: null }, scope, note),
  ).toBe(false)
  expect(
    serviceWorkEditorReviewMatches({ ...review, lineId: null }, scope, note),
  ).toBe(false)
  expect(
    serviceWorkEditorReviewMatches({ ...review, jobId: "other" }, scope, note),
  ).toBe(false)
})
test("saving preserves exact target and permits only authenticated eligible assignees", () => {
  expect(
    parseServiceWorkEditorDraft(
      note,
      { ...note, body: "Edited private note" },
      context,
    ),
  ).toEqual({ ...note, body: "Edited private note" })
  expect(() =>
    parseServiceWorkEditorDraft(note, { ...note, lineId: undefined }, context),
  ).toThrow()
  expect(() =>
    parseServiceWorkEditorDraft(note, { ...note, jobId: "other" }, context),
  ).toThrow()
  const assignment: ServiceWorkEditorAction = {
    action: "service_job_assign",
    jobId: "job",
    assigneeUserId: "staff",
  }
  const wholeJob = { ...context, line: null }
  expect(parseServiceWorkEditorDraft(assignment, assignment, wholeJob)).toEqual(
    assignment,
  )
  expect(() =>
    parseServiceWorkEditorDraft(assignment, assignment, {
      ...wholeJob,
      assigneesComplete: false,
    }),
  ).toThrow()
  expect(() =>
    parseServiceWorkEditorDraft(assignment, assignment, {
      ...wholeJob,
      assignees: [],
    }),
  ).toThrow()
})
test("an unchanged UTC datetime preserves the reviewed instant and precision", () => {
  const reviewed = "2026-10-15T15:00:00.123+03:00"
  expect(
    preserveReviewedTimestamp(new Date("2026-10-15T12:00:00Z"), reviewed),
  ).toBe(reviewed)
  expect(
    preserveReviewedTimestamp(new Date("2026-10-15T13:00:00Z"), reviewed),
  ).toBe("2026-10-15T13:00:00.000Z")
})
