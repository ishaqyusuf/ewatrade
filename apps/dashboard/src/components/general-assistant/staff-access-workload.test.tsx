import { expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import {
  type StaffAccessWorkload,
  staffAccessWorkloadJob,
  staffAccessWorkloadState,
} from "./staff-access-workload-state"
import {
  StaffAccessWorkloadDetail,
  StaffAccessWorkloadView,
} from "./staff-access-workload-view"

function fixture(): StaffAccessWorkload {
  return {
    membershipId: "staff",
    storeId: null,
    scope: "all_business_stores_current_assignee",
    count: 13,
    shown: 10,
    limit: 10,
    hasMore: true,
    coverage: "available",
    countCoverage: "complete",
    detailsCoverage: "limited",
    attribution: "current_assignee",
    definition: "Native nonterminal Line predicate",
    ambiguity: "Not the older whole-Job summary predicate",
    asOf: "2026-10-12T10:00:00.000Z",
    detail: "13 outstanding Jobs; showing 10",
    handover: "not_performed",
    performedWork: "not_measured",
    historicalSales: "excluded",
    jobs: Array.from({ length: 10 }, (_, index) => ({
      jobId: `exact-job-${index}`,
      revision: index + 1,
      createdAt: "2026-10-01T10:00:00.123Z",
      priority: "URGENT",
      storeId: index === 0 ? "archived-store" : "active-store",
      storeName: index === 0 ? "Old Workshop" : "Current Workshop",
      storeStatus: index === 0 ? "ARCHIVED" : "ACTIVE",
    })),
  }
}
function render(
  workload: StaffAccessWorkload,
  membershipId = "staff",
  disabled = false,
) {
  return renderToStaticMarkup(
    <StaffAccessWorkloadView
      workload={workload}
      membershipId={membershipId}
      disabled={disabled}
    />,
  )
}

test("complete count remains distinct from ten bounded rows including archived Store identity", () => {
  const workload = fixture()
  expect(staffAccessWorkloadState(workload, "staff")).toBe("ready")
  const markup = render(workload)
  expect(markup).toContain("13 outstanding Jobs")
  expect(markup).toContain("Showing 10 of 13")
  expect(markup).toContain("remaining 3 Jobs")
  expect(markup).toContain("Old Workshop")
  expect(markup).not.toContain("archived-store")
  expect(markup).toContain("archived")
  expect(markup.match(/Review assigned Job/g)?.length).toBe(10)
  expect(markup).not.toContain("exact-job-")
})

test("foreign member and inconsistent total/page metadata hide rows instead of inventing zero", () => {
  const workload = fixture()
  const inconsistent = [
    { ...workload, count: 9 },
    { ...workload, shown: 13 },
    { ...workload, hasMore: false },
    { ...workload, detailsCoverage: "complete" as const },
    { ...workload, limit: 5 },
    { ...workload, count: Number.MAX_SAFE_INTEGER + 1 },
    {
      ...workload,
      jobs: workload.jobs.map((job) => ({ ...job, jobId: "duplicate" })),
    },
  ]
  for (const value of inconsistent) {
    expect(staffAccessWorkloadState(value, "staff")).toBe("unavailable")
    const markup = render(value)
    expect(markup).toContain("unavailable")
    expect(markup).not.toContain("Old Workshop")
    expect(markup).not.toContain("13 outstanding Jobs")
    expect(markup).not.toContain("No outstanding Jobs")
  }
  expect(render(workload, "other-staff")).toContain("unavailable")
  expect(render(workload, "other-staff")).not.toContain("Old Workshop")
})

test("authoritative zero is distinct from unavailable or merely a missing bounded row", () => {
  const workload = {
    ...fixture(),
    count: 0,
    shown: 0,
    jobs: [],
    hasMore: false,
    detailsCoverage: "complete" as const,
  }
  expect(staffAccessWorkloadState(workload, "staff")).toBe("ready")
  expect(render(workload)).toContain("No outstanding Jobs currently assigned")
  expect(staffAccessWorkloadJob(fixture(), "staff", "exact-job-12")).toBeNull()
})

test("inline selection requires exact current membership and row with no fallback or input mutation", () => {
  const workload = fixture()
  const before = JSON.stringify(workload)
  expect(staffAccessWorkloadJob(workload, "staff", "exact-job-3")).toEqual(
    workload.jobs[3],
  )
  expect(staffAccessWorkloadJob(workload, "staff", null)).toBeNull()
  expect(staffAccessWorkloadJob(workload, "staff", "invented-job")).toBeNull()
  expect(
    staffAccessWorkloadJob(workload, "other-staff", "exact-job-3"),
  ).toBeNull()
  expect(
    staffAccessWorkloadJob(
      {
        ...workload,
        jobs: workload.jobs.slice(1),
        count: 9,
        shown: 9,
        hasMore: false,
        detailsCoverage: "complete",
      },
      "staff",
      "exact-job-0",
    ),
  ).toBeNull()
  expect(JSON.stringify(workload)).toBe(before)
})

test("a selected-Store snapshot cannot display a Job from another Store", () => {
  const workload: StaffAccessWorkload = {
    ...fixture(),
    scope: "selected_store_current_assignee",
    storeId: "active-store",
    jobs: fixture().jobs.slice(1),
    count: 9,
    shown: 9,
    hasMore: false,
    detailsCoverage: "complete",
  }
  expect(staffAccessWorkloadState(workload, "staff")).toBe("ready")
  expect(render(workload)).toContain("At the reviewed Store")
  expect(
    staffAccessWorkloadState(
      { ...workload, storeId: "foreign-store" },
      "staff",
    ),
  ).toBe("unavailable")
})

test("inline controls cannot submit the surrounding access form and disclose navigation limitation", () => {
  const markup = render(fixture())
  expect(markup.match(/type="button"/g)?.length).toBe(10)
  expect(markup).not.toContain('type="submit"')
  expect(markup).not.toContain("<a ")
  expect(markup).toContain("keep your unsaved access draft")
  expect(markup).toContain(
    "Opening the full Job over this draft is not available here yet",
  )
  expect(markup).toContain("does not transfer or reassign")
  expect(markup).toContain("does not show performed work or historical sales")
})

test("pending editor disables workload inspection controls", () => {
  const markup = render(fixture(), "staff", true)
  expect(markup.match(/<button\b[^>]*\sdisabled=""/g)?.length).toBe(10)
  expect(markup).not.toContain("Assign Job")
  expect(markup).not.toContain("Transfer Job")
})

test("inline detail preserves exact revision/time and states current-assignment attribution", () => {
  const job = fixture().jobs[0]
  if (!job) throw Error("Fixture requires an exact Job")
  const markup = renderToStaticMarkup(<StaffAccessWorkloadDetail job={job} />)
  expect(markup).toContain("Assigned Job review details")
  expect(markup).not.toContain("exact-job-0")
  expect(markup).toContain("Job revision at review")
  expect(markup).toContain("2026-10-01T10:00:00.123Z")
  expect(markup).toContain(
    "currently assigned to the person whose access you are editing",
  )
  expect(markup).toContain("review snapshot facts")
  expect(markup).not.toContain("customer")
  expect(markup).not.toContain("<button")
})

test("malformed observation and creation times or invalid identities are unavailable without crashing", () => {
  const workload = fixture()
  for (const value of [
    "not-a-time",
    "2026-02-30T10:00:00.000Z",
    "",
    "2026-10-01",
  ]) {
    expect(render({ ...workload, asOf: value })).toContain("unavailable")
    expect(
      render({
        ...workload,
        jobs: workload.jobs.map((job) => ({ ...job, createdAt: value })),
      }),
    ).toContain("unavailable")
  }
  for (const patch of [
    { jobId: " " },
    { storeId: "" },
    { storeName: "" },
    { storeStatus: "invented" },
    { priority: "invented" },
    { revision: -1 },
  ]) {
    expect(
      render({
        ...workload,
        jobs: workload.jobs.map((job) => ({ ...job, ...patch })),
      }),
    ).toContain("unavailable")
  }
  const corrupted = structuredClone(workload)
  Reflect.set(corrupted, "scope", "invented")
  expect(render(corrupted)).toContain("unavailable")
  const job = workload.jobs[0]
  if (!job) throw Error("Fixture requires a Job")
  expect(
    renderToStaticMarkup(
      <StaffAccessWorkloadDetail job={{ ...job, createdAt: "invalid" }} />,
    ),
  ).toContain("Unavailable")
})
