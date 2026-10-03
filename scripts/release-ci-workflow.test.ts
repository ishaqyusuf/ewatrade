import { describe, expect, test } from "bun:test"
import { spawnSync } from "node:child_process"
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"

type Step = {
  name?: string
  uses?: string
  with?: Record<string, unknown>
  env?: Record<string, unknown>
  run?: string
}

const workflowPath = resolve(
  import.meta.dir,
  "../.github/workflows/release-assurance.yml",
)
const source = readFileSync(workflowPath, "utf8")
const collectWorkflowPath = resolve(
  import.meta.dir,
  "../.github/workflows/release-collect.yml",
)
const collectSource = readFileSync(collectWorkflowPath, "utf8")
const collectWorkflow = Bun.YAML.parse(collectSource) as {
  jobs: Record<string, { steps: Step[] }>
}
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
      permissions?: Record<string, string>
      needs?: string
      steps: Step[]
    }
  >
}

function required<T>(value: T | undefined, label: string): T {
  if (value === undefined) throw new Error(`Workflow is missing ${label}.`)
  return value
}

describe("release assurance workflow security", () => {
  test("parses events, environments, and queued concurrency", () => {
    // Bun versions support YAML 1.1 or 1.2; accept either representation of `on`.
    const triggers = workflow.on ?? workflow.true ?? {}
    expect(triggers).toHaveProperty("pull_request_target")
    expect(triggers).not.toHaveProperty("pull_request")
    expect(triggers).toHaveProperty("push")
    expect(triggers).toHaveProperty("workflow_dispatch")
    expect(triggers.workflow_dispatch).toMatchObject({
      inputs: {
        environment: {
          type: "choice",
          required: true,
          options: ["preview", "production"],
        },
      },
    })
    expect(workflow.concurrency.group).toContain("inputs.environment")
    expect(workflow.concurrency["cancel-in-progress"]).toBe(false)
    expect(workflow.permissions).toEqual({ contents: "read" })

    const job = required(workflow.jobs.verify, "verify job")
    expect(job.environment).toContain("preview")
    expect(job.environment).toContain("production")
    expect(job.if).toContain("github.event_name != 'workflow_dispatch'")
    expect(job.if).toContain("refs/heads/main")
  })

  test("uses isolated full-history trusted and candidate checkouts", () => {
    const steps = required(workflow.jobs.verify, "verify job").steps
    const trustedCheckout = required(
      steps.find(
        (step) =>
          step.name === "Check out trusted verifier by immutable revision",
      ),
      "trusted checkout step",
    )
    const candidateCheckout = required(
      steps.find(
        (step) =>
          step.name ===
          "Check out candidate release repository with full history",
      ),
      "candidate checkout step",
    )

    expect(trustedCheckout.uses).toBe(
      "actions/checkout@11d5960a326750d5838078e36cf38b85af677262",
    )
    expect(trustedCheckout.with).toMatchObject({
      ref: "${{ steps.trusted.outputs.sha }}",
      path: "trusted",
      "fetch-depth": 0,
      "persist-credentials": false,
      submodules: false,
    })
    expect(candidateCheckout.uses).toBe(
      "actions/checkout@11d5960a326750d5838078e36cf38b85af677262",
    )
    expect(candidateCheckout.with).toMatchObject({
      ref: "${{ steps.candidate.outputs.sha }}",
      path: "candidate",
      "fetch-depth": 0,
      "persist-credentials": false,
      submodules: false,
      "sparse-checkout": "/release.manifest.json",
      "sparse-checkout-cone-mode": false,
    })
    expect(source).toContain("commits/$DEFAULT_BRANCH")
    expect(source).toContain("github.event.pull_request.head.sha || github.sha")
    expect(source).toContain("Refuse external fork Preview verification")
    expect(steps.some((step) => step.uses?.startsWith("./"))).toBe(false)
    for (const step of steps) {
      expect(step.uses ?? "").not.toMatch(/candidate\//i)
      expect(step.name ?? "").not.toMatch(/install|cache|candidate script/i)
      expect(step.run ?? "").not.toMatch(
        /(npm|bun) install|candidate\/(?:scripts|\.release|package\.json)/i,
      )
    }
  })

  test("runs only the trusted verifier with secrets after the production freshness check", () => {
    const steps = required(workflow.jobs.verify, "verify job").steps
    const gate = required(
      steps.find((step) => step.name === "Verify release evidence"),
      "verification step",
    )
    const gateRun = required(gate.run, "verification command")

    expect(gate.env).toMatchObject({
      EWATRADE_RELEASE_EVIDENCE_ENVELOPE:
        "${{ secrets.EWATRADE_RELEASE_EVIDENCE_ENVELOPE }}",
      EWATRADE_RELEASE_EVIDENCE_HMAC_KEY:
        "${{ secrets.EWATRADE_RELEASE_EVIDENCE_HMAC_KEY }}",
      EWATRADE_RELEASE_NATIVE_ENVIRONMENT_JSON:
        "${{ secrets.EWATRADE_RELEASE_NATIVE_ENVIRONMENT_JSON }}",
      EWATRADE_RELEASE_NATIVE_ENVIRONMENT_SHA256:
        "${{ vars.EWATRADE_RELEASE_NATIVE_ENVIRONMENT_SHA256 }}",
    })
    expect(gateRun).toContain('gh api "repos/$REPOSITORY/commits/main"')
    expect(gateRun.indexOf("current_main")).toBeLessThan(
      gateRun.indexOf("scripts/release-verify.ts"),
    )
    expect(gateRun).toContain('cd "$GITHUB_WORKSPACE/trusted"')
    expect(gateRun).toContain(
      "bun --env-file=/dev/null scripts/release-verify.ts",
    )
    expect(gateRun).toContain('--repo "$GITHUB_WORKSPACE/candidate"')
    expect(gateRun).toContain('--revision "$CANDIDATE_SHA"')

    const secretReferences = steps.flatMap((step, index) =>
      Object.values(step.env ?? {}).some(
        (value) => typeof value === "string" && value.includes("secrets."),
      )
        ? [index]
        : [],
    )
    expect(secretReferences).toEqual([steps.indexOf(gate)])
    expect(source).not.toMatch(
      /\b(npm install|bun install|db:push|vercel deploy|eas (?:build|update|submit))\b/i,
    )
    expect(source).toContain("pull_request_target")
  })

  test("candidate check publisher isolates write authority from source and signing", () => {
    const job = required(
      workflow.jobs["preview-candidate-check"],
      "candidate publisher",
    )
    expect(job.needs).toBe("verify")
    expect(job.permissions).toEqual({ checks: "write" })
    expect(job.environment).toBeUndefined()
    expect(job.if).toContain("always()")
    expect(job.if).toContain("github.event_name == 'pull_request_target'")
    expect(job.if).toContain("github.event.pull_request.base.ref == 'main'")
    expect(job.if).toContain(
      "github.event.pull_request.head.repo.full_name == github.repository",
    )
    expect(job.steps).toHaveLength(1)
    expect(job.steps[0].uses).toBeUndefined()
    expect(JSON.stringify(job)).not.toContain("secrets.")
    expect(JSON.stringify(job)).not.toContain("checkout")
    expect(job.steps[0].env).toMatchObject({
      CANDIDATE_SHA: "${{ github.event.pull_request.head.sha }}",
      VERIFICATION_RESULT: "${{ needs.verify.result }}",
    })
    expect(workflow.jobs.verify.permissions).toBeUndefined()
  })

  test("executes the actual publisher command against a local API stub", () => {
    const job = required(
      workflow.jobs["preview-candidate-check"],
      "candidate publisher",
    )
    const command = required(job.steps[0].run, "publisher command")
    const directory = mkdtempSync(join(tmpdir(), "ewatrade-candidate-check-"))
    const capture = join(directory, "request.json")
    const args = join(directory, "args.txt")
    mkdirSync(join(directory, "bin"))
    writeFileSync(
      join(directory, "bin/gh"),
      `#!/bin/sh
cat > "$CAPTURE"
printf '%s\\n' "$@" > "$ARGUMENTS"
if [ "$API_FAILURE" = 1 ]; then exit 3; fi
if [ "$API_MISMATCH" = 1 ]; then
  printf 'wrong-response'
else
  /usr/bin/jq -r '[.name,.head_sha,.status,.conclusion] | @tsv' "$CAPTURE"
fi
`,
      { mode: 0o755 },
    )
    const environment = {
      PATH: `${join(directory, "bin")}:/usr/bin:/bin`,
      CAPTURE: capture,
      ARGUMENTS: args,
      GH_TOKEN: "local-test-token",
      REPOSITORY: "ishaqyusuf/ewatrade",
      CANDIDATE_SHA: "a".repeat(40),
      GITHUB_SHA: "b".repeat(40),
      GITHUB_RUN_ID: "123",
      GITHUB_RUN_ATTEMPT: "2",
    }
    try {
      for (const result of [
        "success",
        "failure",
        "cancelled",
        "skipped",
        "",
        "unknown",
      ]) {
        const execution = spawnSync("/bin/bash", ["-c", command], {
          env: { ...environment, VERIFICATION_RESULT: result },
          encoding: "utf8",
        })
        expect(execution.status).toBe(0)
        expect(JSON.parse(readFileSync(capture, "utf8"))).toMatchObject({
          name: "release-assurance-preview-candidate",
          head_sha: environment.CANDIDATE_SHA,
          status: "completed",
          conclusion: result === "success" ? "success" : "failure",
          details_url:
            "https://github.com/ishaqyusuf/ewatrade/actions/runs/123/attempts/2",
        })
        expect(readFileSync(args, "utf8")).toContain(
          "repos/ishaqyusuf/ewatrade/check-runs",
        )
        expect(readFileSync(capture, "utf8")).not.toContain(
          environment.GH_TOKEN,
        )
      }
      for (const flag of ["API_FAILURE", "API_MISMATCH"]) {
        expect(
          spawnSync("/bin/bash", ["-c", command], {
            env: {
              ...environment,
              VERIFICATION_RESULT: "success",
              [flag]: "1",
            },
          }).status,
        ).not.toBe(0)
      }
      rmSync(capture)
      const invalid = spawnSync("/bin/bash", ["-c", command], {
        env: {
          ...environment,
          CANDIDATE_SHA: "invalid; exit 0",
          VERIFICATION_RESULT: "success",
        },
      })
      expect(invalid.status).not.toBe(0)
      expect(existsSync(capture)).toBe(false)
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })
  test("release workflows expose no retired database proof credentials or fragments", () => {
    const gate = required(
      workflow.jobs.verify.steps.find(
        (step) => step.name === "Verify release evidence",
      ),
      "verification step",
    )
    expect(
      Object.keys(gate.env ?? {}).filter((key) => /DATABASE/i.test(key)),
    ).toEqual([])
    expect(source).not.toMatch(/EWATRADE_RELEASE_\w*DATABASE/i)

    const collection = required(
      collectWorkflow.jobs.collect.steps.find(
        (step) => step.name === "Collect unsigned application provider facts",
      ),
      "application collector step",
    )
    expect(
      Object.keys(collection.env ?? {}).filter((key) => /DATABASE/i.test(key)),
    ).toEqual([])
    expect(collection.run).toContain(
      'has("vercel") and has("trigger") and has("mobile")',
    )
    expect(collection.run).not.toContain('has("database")')
    expect(collectSource).not.toMatch(/EWATRADE_RELEASE_\w*DATABASE/i)
    expect(collectSource).not.toMatch(/database snapshot/i)
  })
})
