import { expect, test } from "bun:test"
import {
  overdueWork,
  workMatches,
  workStatusLabel,
} from "./service-work-summary"
const job = {
  summary: "in_progress",
  dueCommitmentAt: "2026-10-08T10:00:00Z",
  handedOffAt: null,
  currentAssigneeUserId: "rep1",
}
const now = Date.parse("2026-10-08T11:00:00Z")
test("completed and cancelled jobs cannot be overdue", () => {
  expect(overdueWork(job, now)).toBe(true)
  expect(overdueWork({ ...job, summary: "cancelled" }, now)).toBe(false)
  expect(
    overdueWork({ ...job, handedOffAt: "2026-10-08T10:30:00Z" }, now),
  ).toBe(false)
  expect(overdueWork({ ...job, dueCommitmentAt: null }, now)).toBe(false)
})
test("Mine cannot match another assignee or an unknown actor", () => {
  expect(workMatches(job, "mine", "rep1", now)).toBe(true)
  expect(workMatches(job, "mine", "rep2", now)).toBe(false)
  expect(workMatches(job, "mine", undefined, now)).toBe(false)
  expect(
    workMatches({ ...job, summary: "ready_for_handoff" }, "ready", "rep1", now),
  ).toBe(true)
})
test("status labels use counter language", () => {
  expect(workStatusLabel("READY_FOR_HANDOFF")).toBe("Ready")
  expect(workStatusLabel("PARTIALLY_PAID")).toBe("Part paid")
})
