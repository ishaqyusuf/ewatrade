import { expect, test } from "bun:test"
import { spawnSync } from "node:child_process"
import { createHash, randomUUID } from "node:crypto"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import {
  assertPrivacyOperatorApplyApproval,
  assertPrivacyOperatorTarget,
  privacyOperatorBinding,
  readPrivacyProductOperatorPlan,
} from "../packages/db/src/privacy-operator-plan"

function input() {
  return {
    version: 1,
    databaseHost: "approved-product.neon.tech",
    databaseName: "neondb",
    officeDatabaseHost: "approved-office.neon.tech",
    officeDatabaseName: "neondb",
    officeActorId: randomUUID(),
    officeEnrollmentAuditId: randomUUID(),
    officeOwnerId: randomUUID(),
    expectedOfficeRevision: 1,
    expectedOwnerRevision: 1,
    expectedPlatformAdminCount: 0,
    userId: randomUUID(),
    email: "privacy@ewatrade.com",
    name: "EwaTrade Privacy Operations",
    scope: "process",
    platformAdmin: true,
    expiresAt: new Date(Date.now() + 86400_000).toISOString(),
    reason:
      "Reviewed dedicated fixture principal with explicit platform authority",
    mailboxVerification:
      "Only synthetic fixture control; no mailbox or password action",
  }
}

test("strict exact plan, bounded mapping, approval digest and target gates", () => {
  const data = input()
  const raw = JSON.stringify(data)
  const { plan, sha256 } = readPrivacyProductOperatorPlan(raw)
  expect(sha256).toBe(createHash("sha256").update(raw).digest("hex"))
  expect(privacyOperatorBinding(plan)).toEqual({
    [data.officeActorId]: {
      userId: data.userId,
      scope: "process",
      expiresAt: data.expiresAt,
    },
  })
  for (const patch of [
    { extra: "refuse" },
    { platformAdmin: false },
    { scope: "owner" },
    { email: "other@example.test" },
    { userId: data.officeActorId },
    { expiresAt: new Date(0).toISOString() },
    { expiresAt: new Date(Date.now() + 32 * 86400_000).toISOString() },
  ])
    expect(() =>
      readPrivacyProductOperatorPlan(JSON.stringify({ ...data, ...patch })),
    ).toThrow()
  for (const env of [
    {},
    { PRIVACY_PRODUCT_ENROLLMENT: "APPROVED" },
    {
      PRIVACY_PRODUCT_ENROLLMENT: "APPROVED",
      PRIVACY_PRODUCT_PLAN_SHA256: "b".repeat(64),
    },
  ])
    expect(() => assertPrivacyOperatorApplyApproval(sha256, env)).toThrow(
      "exact product grant",
    )
  expect(() =>
    assertPrivacyOperatorApplyApproval(sha256, {
      PRIVACY_PRODUCT_ENROLLMENT: "APPROVED",
      PRIVACY_PRODUCT_PLAN_SHA256: sha256,
    }),
  ).not.toThrow()
  const url =
    "postgresql://synthetic:fixture@approved-product.neon.tech/neondb?sslmode=require"
  expect(
    new URL(
      assertPrivacyOperatorTarget(url, plan.databaseHost, plan.databaseName),
    ).searchParams.get("sslmode"),
  ).toBe("verify-full")
  for (const other of [
    url.replace("approved-product", "other"),
    url.replace("neondb?", "other?"),
    url.replace("?sslmode=require", ""),
    "postgresql://synthetic:fixture@127.0.0.1/neondb?sslmode=require",
  ])
    expect(() =>
      assertPrivacyOperatorTarget(other, plan.databaseHost, plan.databaseName),
    ).toThrow()
})

test("actual CLI refuses unapproved apply and wrong-target preview without printing plan evidence", async () => {
  const temp = await mkdtemp("/private/tmp/privacy-product-cli-test-")
  try {
    const plan = join(temp, "plan.json")
    const data = {
      ...input(),
      reason:
        "SECRET_FIXTURE_MARKER that must not appear in refused CLI output",
    }
    await writeFile(plan, JSON.stringify(data), { mode: 0o600 })
    await writeFile(
      join(temp, ".env.production"),
      "EWATRADE_DATABASE_URL=postgresql://synthetic:fixture@other-product.neon.tech/neondb?sslmode=require\n",
      { mode: 0o600 },
    )
    for (const args of [
      ["--plan", plan, "--apply"],
      ["--plan", plan],
      ["--plan", plan, "--unknown"],
    ]) {
      // Let the shell open files; this Bun host loses captured/remapped stdio.
      const output = join(temp, "stdout")
      const error = join(temp, "stderr")
      const result = spawnSync(
        "/bin/sh",
        [
          "-c",
          'exe="$1"; entry="$2"; out="$3"; err="$4"; shift 4; exec "$exe" --env-file=/dev/null "$entry" "$@" > "$out" 2> "$err"',
          "privacy-cli-test",
          process.execPath,
          join(import.meta.dir, "enroll-privacy-product-operator.ts"),
          output,
          error,
          ...args,
          "--environment-root",
          temp,
        ],
        { env: { PATH: process.env.PATH ?? "/usr/bin:/bin" }, timeout: 5000 },
      )
      const exit = result.status
      const [stdout, stderr] = await Promise.all([
        readFile(output, "utf8"),
        readFile(error, "utf8"),
      ])
      expect(exit).toBe(1)
      expect(stdout).toBe("")
      expect(stderr).toContain("Product enrollment refused or unavailable")
      expect(stderr).not.toContain("SECRET_FIXTURE_MARKER")
      expect(stderr).not.toContain("approved-product.neon.tech")
    }
  } finally {
    await rm(temp, { recursive: true, force: true })
  }
})
