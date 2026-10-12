import { describe, expect, test } from "bun:test"
import type { ServiceWorkOriginalTarget } from "@ewatrade/assistant/general/service-work-original"
import {
  parseServiceWorkOriginal,
  serviceWorkOriginalCloseParams,
  serviceWorkOriginalOpenParams,
  serviceWorkOriginalReadState,
} from "./service-work-original-state"

const target: ServiceWorkOriginalTarget = {
  kind: "service_work",
  jobId: "job",
  eventId: "old-event",
}
const data = {
  kind: "service_work",
  source: "ServiceWorkEvent",
  jobId: "job",
  currentJob: { jobId: "job" },
  original: { jobId: "job", eventId: "old-event" },
}
const ready = {
  isPending: false,
  isFetching: false,
  isPaused: false,
  isError: false,
  isSuccess: true,
  isFetchedAfterMount: true,
  data,
}

describe("original Service record read visibility", () => {
  test("rejects malformed and injected URLs; close clears its own parameter only", () => {
    for (const raw of [
      null,
      "",
      "{",
      "null",
      "[]",
      JSON.stringify({ ...target, tenantId: "foreign" }),
    ])
      expect(parseServiceWorkOriginal(raw)).toBeNull()
    expect(
      parseServiceWorkOriginal(
        serviceWorkOriginalOpenParams(target).assistantWorkOriginal,
      ),
    ).toEqual(target)
    expect(serviceWorkOriginalCloseParams).toEqual({
      assistantWorkOriginal: null,
    })
  })
  test("withholds a cached successful record before a new Open authorizes it", () => {
    expect(
      serviceWorkOriginalReadState(target, "session:tenant:store:revision", {
        ...ready,
        isFetchedAfterMount: false,
      }),
    ).toBe("loading")
    expect(
      serviceWorkOriginalReadState(
        target,
        "session:tenant:store:revision",
        ready,
      ),
    ).toBe("ready")
    expect(serviceWorkOriginalReadState(target, "", ready)).toBe("unavailable")
  })
  test("withholds previous facts during fetch, pause, pending and failed refresh", () => {
    for (const flag of ["isPending", "isFetching", "isPaused"] as const)
      expect(
        serviceWorkOriginalReadState(target, "scope", {
          ...ready,
          [flag]: true,
        }),
      ).toBe("loading")
    expect(
      serviceWorkOriginalReadState(target, "scope", {
        ...ready,
        isError: true,
      }),
    ).toBe("unavailable")
    expect(
      serviceWorkOriginalReadState(target, "scope", {
        ...ready,
        isSuccess: false,
      }),
    ).toBe("unavailable")
    expect(
      serviceWorkOriginalReadState(target, "scope", {
        ...ready,
        data: undefined,
      }),
    ).toBe("unavailable")
  })
  test("never substitutes another Job, current record, branch or source", () => {
    for (const wrong of [
      { ...data, jobId: "foreign" },
      { ...data, currentJob: { jobId: "foreign" } },
      { ...data, original: { ...data.original, jobId: "foreign" } },
      { ...data, original: { ...data.original, eventId: "latest-event" } },
      { ...data, kind: "service_work_note" },
      { ...data, source: "ServiceInternalNote" },
    ])
      expect(
        serviceWorkOriginalReadState(target, "scope", {
          ...ready,
          data: wrong,
        }),
      ).toBe("unavailable")
  })
  test("notes and exceptions require their own recorded identities", () => {
    for (const kind of [
      "service_work_note",
      "service_work_exception",
    ] as const) {
      const target = { kind, jobId: "job", recordId: "record" }
      const record = {
        ...data,
        kind,
        source:
          kind === "service_work_note"
            ? "ServiceInternalNote"
            : "ServiceException",
        original: { jobId: "job", recordId: "record" },
      }
      expect(
        serviceWorkOriginalReadState(target, "scope", {
          ...ready,
          data: record,
        }),
      ).toBe("ready")
      expect(
        serviceWorkOriginalReadState(target, "scope", {
          ...ready,
          data: {
            ...record,
            original: { jobId: "job", recordId: "another-record" },
          },
        }),
      ).toBe("unavailable")
    }
  })
})
