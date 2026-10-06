import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

type Step = {
  id?: string
  name?: string
  uses?: string
  if?: string
  "continue-on-error"?: boolean
  with?: Record<string, unknown>
  env?: Record<string, unknown>
  run?: string
  "working-directory"?: string
}

const source = readFileSync(
  resolve(import.meta.dir, "../.github/workflows/release-collect.yml"),
  "utf8",
)
const workflow = Bun.YAML.parse(source) as {
  on?: Record<string, unknown>
  true?: Record<string, unknown>
  concurrency: { group: string; "cancel-in-progress": boolean }
  permissions: Record<string, string>
  jobs: Record<
    string,
    {
      if: string
      environment: string
      "timeout-minutes": number
      steps: Step[]
    }
  >
}

function step(name: string): Step {
  const found = workflow.jobs.collect.steps.find((item) => item.name === name)
  if (!found) throw new Error(`Workflow step is missing: ${name}`)
  return found
}

describe("trusted release fact collection workflow", () => {
  test("is manual only, restricted to main, and selects a protected environment", () => {
    expect(Object.keys(workflow.on ?? workflow.true ?? {})).toEqual([
      "workflow_dispatch",
    ])
    expect((workflow.on ?? workflow.true)?.workflow_dispatch).toMatchObject({
      inputs: {
        environment: {
          type: "choice",
          required: true,
          options: ["preview", "production"],
        },
        revision: { type: "string", required: true },
        preview_deployment_ids: { type: "string", required: false },
      },
    })
    expect(workflow.concurrency.group).toContain("inputs.environment")
    expect(workflow.concurrency["cancel-in-progress"]).toBe(false)
    expect(workflow.permissions).toEqual({ contents: "read" })
    expect(workflow.jobs.collect.if).toBe("github.ref == 'refs/heads/main'")
    expect(workflow.jobs.collect.environment).toBe("${{ inputs.environment }}")
    expect(workflow.jobs.collect["timeout-minutes"]).toBe(30)
  })

  test("checks out trusted main immutably and candidate as full-history manifest-only data", () => {
    const trusted = step(
      "Check out trusted collector at immutable default-branch revision",
    )
    expect(trusted.uses).toBe(
      "actions/checkout@11d5960a326750d5838078e36cf38b85af677262",
    )
    expect(trusted.with).toMatchObject({
      ref: "${{ steps.trusted.outputs.sha }}",
      path: "trusted",
      "fetch-depth": 0,
      "persist-credentials": false,
      submodules: false,
    })

    const candidate = step(
      "Check out candidate as manifest-only data with full Git history",
    )
    expect(candidate.uses).toBe(
      "actions/checkout@11d5960a326750d5838078e36cf38b85af677262",
    )
    expect(candidate.with).toMatchObject({
      ref: "${{ steps.candidate.outputs.sha }}",
      path: "candidate",
      "fetch-depth": 0,
      "persist-credentials": false,
      submodules: false,
      "sparse-checkout": "/release.manifest.json",
      "sparse-checkout-cone-mode": false,
    })
    const validation = step(
      "Validate candidate revision against trusted main history",
    )
    expect(validation.run).toContain("^[0-9a-f]{40}$")
    expect(validation.run).toContain("cat-file -e")
    expect(validation.run).toContain("merge-base --is-ancestor")

    for (const item of workflow.jobs.collect.steps) {
      expect(item.uses ?? "").not.toMatch(/candidate\//i)
      expect(item.name ?? "").not.toMatch(
        /candidate.*(?:install|script|config)/i,
      )
      expect(item.run ?? "").not.toMatch(
        /(?:npm|bun) install[^\n]*candidate|candidate\/(?:scripts|\.release|package\.json)/i,
      )
      if (item.uses) expect(item.uses).toMatch(/@(v[0-9]+|[0-9a-f]{40})$/i)
    }
    expect(
      workflow.jobs.collect.steps
        .filter((item) => item.uses)
        .map((item) => item.uses),
    ).toEqual([
      "actions/checkout@11d5960a326750d5838078e36cf38b85af677262",
      "actions/checkout@11d5960a326750d5838078e36cf38b85af677262",
      "oven-sh/setup-bun@0c5077e51419868618aeaa5fe8019c62421857d6",
      "actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02",
    ])
    expect(
      step("Install trusted checkout dependencies without lifecycle scripts"),
    ).toMatchObject({
      "working-directory": "trusted",
      run: "bun install --frozen-lockfile --ignore-scripts",
    })
  })

  test("checks current Production main before step-scoped application provider secrets", () => {
    const freshness = step("Require current main before Production reads")
    const facts = step("Collect unsigned application provider facts")
    expect(facts["working-directory"]).toBe("trusted")
    expect(freshness.if).toBe("inputs.environment == 'production'")
    expect(freshness.run).toContain('gh api "repos/$REPOSITORY/commits/main"')
    expect(freshness.run).toContain('[[ "$current_main" == "$CANDIDATE_SHA" ]]')
    expect(workflow.jobs.collect.steps.indexOf(freshness)).toBeLessThan(
      workflow.jobs.collect.steps.indexOf(facts),
    )
    expect(facts.env).toMatchObject({
      VERCEL_TOKEN: "${{ secrets.VERCEL_TOKEN }}",
      EXPO_TOKEN: "${{ secrets.EXPO_TOKEN }}",
      TRIGGER_ACCESS_TOKEN: "${{ secrets.TRIGGER_ACCESS_TOKEN }}",
      TRIGGER_RELEASE_READ_KEY: "${{ secrets.TRIGGER_RELEASE_READ_KEY }}",
      TRIGGER_EXPECTED_ORGANIZATION_ID:
        "${{ vars.TRIGGER_EXPECTED_ORGANIZATION_ID }}",
      EWATRADE_RELEASE_NATIVE_ENVIRONMENT_JSON:
        "${{ secrets.EWATRADE_RELEASE_NATIVE_ENVIRONMENT_JSON }}",
      EWATRADE_RELEASE_NATIVE_ENVIRONMENT_SHA256:
        "${{ vars.EWATRADE_RELEASE_NATIVE_ENVIRONMENT_SHA256 }}",
    })
    expect(
      Object.keys(facts.env ?? {}).some((key) => /DATABASE/i.test(key)),
    ).toBe(false)
    expect(facts.run).toContain(
      "bun --env-file=/dev/null scripts/release-collect.ts",
    )
    expect(facts.run?.match(/scripts\/release-collect\.ts/g)).toHaveLength(1)
    expect(facts.run).not.toContain("scripts/release-database-")
    expect(facts.run).toContain('[[ "$collector_status" -eq 1 ]]')
    expect(facts.run).toContain(".releaseReady == false")
    expect(facts.run).toContain('has("vercel")')
    expect(facts.run).toContain('has("trigger")')
    expect(facts.run).toContain('has("mobile")')
    expect(facts.run).toContain('"$REPORT_DIRECTORY/release-facts.json"')
    expect(facts.run).toContain("exit 1")
    expect(facts["continue-on-error"]).toBe(true)

    const secretSteps = workflow.jobs.collect.steps.filter((item) =>
      Object.values(item.env ?? {}).some(
        (value) => typeof value === "string" && value.includes("secrets."),
      ),
    )
    expect(secretSteps).toEqual([facts])
    expect(facts.env).not.toHaveProperty("EWATRADE_RELEASE_EVIDENCE_HMAC_KEY")
    expect(facts.env).not.toHaveProperty("EWATRADE_RELEASE_EVIDENCE_ENVELOPE")
    expect(source).not.toMatch(
      /\b(?:vercel\s+(?:deploy|promote)|eas\s+(?:build|update|submit)|db:push|release-verify|release-baselines)\b/i,
    )
    expect(source).not.toContain("actions/cache")
  })

  test("uploads only unsigned fact reports and keeps the job non-green", () => {
    const upload = step("Upload source-safe unsigned fact report")
    expect(upload.if).toBe("always() && steps.facts.outputs.partial == 'true'")
    expect(upload.uses).toBe(
      "actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02",
    )
    expect(upload.with).toMatchObject({
      path: "${{ runner.temp }}/ewatrade-release-facts/release-facts.json",
      "if-no-files-found": "error",
      "retention-days": 7,
    })
    const final = step("Keep unsigned collection visibly partial")
    expect(final.if).toBe("always()")
    expect(final.run).toContain("COLLECTION_OUTCOME")
    expect(final.run).toContain("exit 1")
    expect(final.run).toContain("exit 2")
    expect(source).not.toMatch(/bundle\.json|receipts\.json|live-state/i)
  })
})
