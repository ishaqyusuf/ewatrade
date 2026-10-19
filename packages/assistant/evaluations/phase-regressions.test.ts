import { expect, test } from "bun:test"

// Separate processes prevent fixture module mocks from leaking into the normal
// API/dashboard suites. Keep these regressions discoverable by ordinary Bun tests.
for (const [name, fixture] of [
  [
    "C04 completed recovery",
    "stock-transfer-recovery.production-path.fixture.ts",
  ],
  [
    "inventory operation URL routing",
    "inventory-operation-routing.fixture.tsx",
  ],
  ["E03 canonical transfer result", "simple-transfer-result.fixture.ts"],
  [
    "D04 authorization timestamp attribution",
    "d04-authorization-inert.fixture.ts",
  ],
  ["Phase 4 native order editor", "native-order-editor.fixture.tsx"],
  [
    "Phase 5 native money editors and originals",
    "native-money-editor.fixture.tsx",
  ],
  ["Phase 6 native staff originals", "native-staff-original.fixture.tsx"],
  [
    "Phase 6 native staff status editor",
    "native-staff-status-editor.fixture.tsx",
  ],
  [
    "Phase 6 native staff invitation editor",
    "native-staff-invitation-editor.fixture.tsx",
  ],
  [
    "Phase 6 native staff access editor",
    "native-staff-access-editor.fixture.tsx",
  ],
  ["S01 native member read", "native-staff-member.fixture.tsx"],
  ["S01 native directory read", "native-staff-directory.fixture.tsx"],
  ["S01 native recorded history", "native-staff-history.fixture.tsx"],
  ["S01 native read navigation", "native-staff-read-navigation.fixture.tsx"],
  ["Phase 7 native service originals", "native-service-original.fixture.tsx"],
  [
    "Phase 7 native service work editor",
    "native-service-work-editor.fixture.tsx",
  ],
  [
    "Phase 7 native service intake editor",
    "native-service-intake-editor.fixture.tsx",
  ],
  [
    "Phase 7 native quotation editor and original",
    "native-quote-decision.fixture.tsx",
  ],
  ["Native booking original", "native-booking-original.fixture.tsx"],
  ["Native exact current Job", "native-service-job.fixture.tsx"],
  ["Native cash count editor", "native-cash-count-editor.fixture.tsx"],
  ["Native cash count original", "native-cash-original.fixture.tsx"],
  ["Native day review", "native-day-review.fixture.tsx"],
  ["Native cash/day route dispatch", "native-cash-navigation.fixture.tsx"],
  ["Native Service raw payment boundary", "native-service-payment.fixture.tsx"],
  [
    "Native business report content",
    "native-business-report-content.fixture.tsx",
  ],
  [
    "Native business report authorized screen",
    "native-business-report-screen.fixture.tsx",
  ],
  [
    "G05 protected manual-message router",
    "service-manual-message-router.fixture.ts",
  ],
  [
    "G03 protected Service Request reads",
    "service-request-read-router.fixture.ts",
  ],
  [
    "G03 native Service Request original content",
    "native-service-request-content.fixture.tsx",
  ],
  [
    "G03 native Service Request page content",
    "native-service-request-page-content.fixture.tsx",
  ],
  [
    "G03 native protected Request screens and Back paging",
    "native-service-request-screen.fixture.tsx",
  ],
  [
    "G03/G05 dashboard mount-owned original reads",
    "dashboard-service-request-read.fixture.tsx",
  ],
  [
    "G03 actual Request tool answers and safe model output",
    "service-request-tool-answers.fixture.ts",
  ],
  [
    "G05 native manual-message editor",
    "native-service-message-editor.fixture.tsx",
  ],
  [
    "G05 native manual-message content",
    "native-service-message-content.fixture.tsx",
  ],
  [
    "G05 native exact manual-message original",
    "native-service-message-original.fixture.tsx",
  ],
] as const) {
  test(`${name} passes in an isolated source runtime`, () => {
    const result = Bun.spawnSync(
      [
        process.execPath,
        "--env-file=/dev/null",
        "test",
        `./packages/assistant/evaluations/fixtures/${fixture}`,
      ],
      {
        cwd: new URL("../../../", import.meta.url).pathname,
        env: {
          ...process.env,
          DATABASE_URL: undefined,
          EWATRADE_DATABASE_URL:
            "postgresql://fixture:fixture@127.0.0.1:1/assistant_source_tests",
        },
        timeout: 10_000,
      },
    )
    if (result.exitCode !== 0)
      throw Error(new TextDecoder().decode(result.stderr))
    expect(result.exitCode).toBe(0)
  }, 15_000)
}
