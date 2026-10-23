import { expect, test } from "bun:test"
import { summarizeStorefrontOperations } from "./operations"

const snapshot = () => ({
  version: 1,
  source: "synthetic-fixture",
  siteStatus: "PUBLISHED",
  activeReleaseId: "release-1",
  runs: [
    {
      id: "run-1",
      status: "READY",
      reservedTokens: 80000,
      actualTokens: 1000,
      durationMs: 100,
      providerStarted: true,
      accepted: true,
      errorCode: null,
    },
    {
      id: "run-2",
      status: "FAILED",
      reservedTokens: 80000,
      actualTokens: null,
      durationMs: 300,
      providerStarted: true,
      accepted: false,
      errorCode: "DESIGN_PROVIDER_OUTCOME_UNKNOWN",
    },
  ],
  events: [
    { id: "event-1", action: "published" },
    { id: "event-2", action: "rolled_back" },
  ],
  checks: [
    {
      id: "check-1",
      releaseId: "release-1",
      status: "COMPLETED",
      result: "SOURCE_READY_HTTP_UNVERIFIED",
    },
  ],
  failures: [
    { id: "request-1", operation: "storefront.publish", code: "CONFLICT" },
  ],
  artifacts: [
    {
      id: "a".repeat(64),
      status: "ready",
      generatorKind: "offline-fixture",
      totalMs: 1400,
      actualTokens: null,
      reviewed: true,
    },
  ],
})

test("support summary distinguishes known usage, unresolved reservations, source readiness and actual delivery", () => {
  const report = summarizeStorefrontOperations(snapshot())
  expect(report.generation).toMatchObject({
    acceptedProposals: 1,
    latency: { known: 2, meanMs: 200 },
  })
  expect(report.usage).toMatchObject({
    knownActualTokens: 1000,
    unknownUsageReceipts: 1,
    unsettledReservedTokens: 80000,
    providerStartedWithoutUsage: 1,
    monetaryCost: null,
  })
  expect(report.components).toMatchObject({
    offlineFixtures: 1,
    reviewedArtifacts: 1,
  })
  expect(report.publication).toMatchObject({
    committedOutcomes: { published: 1, rolled_back: 1 },
    requestFailures: { "storefront.publish:CONFLICT": 1 },
    delivery: "unverified",
  })
})

test("support export refuses business content, duplicate outcomes and unbounded snapshots", () => {
  expect(() =>
    summarizeStorefrontOperations({
      ...snapshot(),
      brief: "private merchant facts",
    }),
  ).toThrow()
  const duplicate = snapshot()
  duplicate.events.push(
    duplicate.events[0] as (typeof duplicate.events)[number],
  )
  expect(() => summarizeStorefrontOperations(duplicate)).toThrow()
  expect(() =>
    summarizeStorefrontOperations({
      ...snapshot(),
      runs: Array.from({ length: 51 }, () => snapshot().runs[0]),
    }),
  ).toThrow()
  expect(() =>
    summarizeStorefrontOperations({ ...snapshot(), runs: [] }),
  ).not.toThrow()
})
