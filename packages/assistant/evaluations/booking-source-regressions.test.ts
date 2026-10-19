import { expect, test } from "bun:test"

// Exact actual-source cohort from the 16 October booking review checkpoint.
// Never replace these paths with a directory glob: connected/integration checks
// are separately authorized work. Each suite runs alone so mocks and globals
// cannot leak between suites. These are inert source checks, not HTTP/Session
// issuance, SQL isolation/rollback/concurrency, provider, device or hosted proof.
const suites = [
  "packages/db/src/queries/commercial-order-completion.test.ts",
  "packages/db/src/queries/commercial-order-completion-decimal.test.ts",
  "packages/db/src/queries/service-commerce-bookings/booking-command-review.test.ts",
  "packages/db/src/queries/service-commerce-bookings/booking-commands.test.ts",
  "apps/api/src/assistant/general-booking-input.test.ts",
  "apps/api/src/assistant/general-booking-draft-store.test.ts",
  "apps/api/src/assistant/general-booking-drafts.test.ts",
  "apps/api/src/assistant/general-booking-confirmation.test.ts",
  "apps/api/src/assistant/general-booking-decision.test.ts",
  "apps/api/src/assistant/general-booking-review-projection.test.ts",
  "packages/assistant/src/general/booking-review.test.ts",
  "apps/api/src/assistant/general-booking-review-transport.test.ts",
  "apps/api/src/assistant/general-booking-review.test.ts",
] as const

// At most 8 KiB of child output is included in a failure (two 4 KiB tails).
// Deliberately do not echo environment, full command output or secret values.
const diagnosticTail = (bytes: Uint8Array) =>
  new TextDecoder().decode(bytes.subarray(Math.max(0, bytes.length - 4096)))

for (const suite of suites) {
  test(`${suite} passes in an isolated inert source process`, () => {
    let result: ReturnType<typeof Bun.spawnSync>
    try {
      result = Bun.spawnSync(
        [process.execPath, "--env-file=/dev/null", "test", `./${suite}`],
        {
          cwd: new URL("../../../", import.meta.url).pathname,
          env: {
            ...process.env,
            APP_ENV: undefined,
            DEV_PROFILE: undefined,
            DATABASE_URL: undefined,
            EWATRADE_DATABASE_URL:
              "postgresql://fixture:fixture@127.0.0.1:1/assistant_booking_source_tests",
          },
          timeout: 10_000,
        },
      )
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Spawn failed"
      throw Error(
        `${suite} could not finish its bounded source process: ${detail.slice(-4096)}`,
      )
    }
    if (result.exitCode !== 0 || result.signalCode || !result.success)
      throw Error(
        `${suite} failed (exit ${result.exitCode}, signal ${result.signalCode ?? "none"}; 10000ms process ceiling).\nSTDERR tail:\n${diagnosticTail(result.stderr)}\nSTDOUT tail:\n${diagnosticTail(result.stdout)}`,
      )
    expect(result.exitCode).toBe(0)
  }, 15_000)
}
