import { spawn } from "node:child_process"
import { writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

type ValidationStep = {
  args: string[]
  command: string
  env?: Record<string, string>
  name: string
  writesDatabase?: boolean
  writesSource?: boolean
}

type ValidationStepResult = {
  command: string
  durationMs: number
  exitCode: number | null
  name: string
  ok: boolean
  signal: NodeJS.Signals | null
  stderr: string
  stdout: string
  writesDatabase: boolean
  writesSource: boolean
}

const CONFIRMATION_ENV = "CONFIRM_RETAIL_OPS_FULL_VALIDATION"
const TARGET_ENV = "RETAIL_OPS_VALIDATION_TARGET"
const ALLOW_PRODUCTION_ENV = "ALLOW_PRODUCTION_RETAIL_OPS_VALIDATION"
const DRY_RUN_ENV = "RETAIL_OPS_VALIDATION_DRY_RUN"
const REPORT_PATH_ENV = "RETAIL_OPS_VALIDATION_REPORT_PATH"
const SKIP_REFERENCE_SEED_ENV = "SKIP_RETAIL_OPS_REFERENCE_SEED"

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const packageDir = path.resolve(scriptDir, "..")

function requireValidationEnvironment() {
  if (process.env[CONFIRMATION_ENV] !== "1") {
    throw new Error(
      `${CONFIRMATION_ENV}=1 must be set before running the full Retail Ops validation sequence.`,
    )
  }

  if (!process.env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL must point to an intentional validation database before running the full Retail Ops validation sequence.",
    )
  }

  const target = process.env[TARGET_ENV]?.trim()

  if (!target) {
    throw new Error(
      `${TARGET_ENV} must name the selected validation target, for example "neon-retail-ops-validation".`,
    )
  }

  const productionSignals =
    `${target} ${process.env.DATABASE_URL}`.toLowerCase()

  if (
    process.env[ALLOW_PRODUCTION_ENV] !== "1" &&
    /\b(prod|production)\b/.test(productionSignals)
  ) {
    throw new Error(
      `The selected validation target looks production-like. Set ${ALLOW_PRODUCTION_ENV}=1 only with an approved production rollout window and backup.`,
    )
  }

  return target
}

function buildValidationSteps(): ValidationStep[] {
  const steps: ValidationStep[] = [
    {
      args: [
        "node_modules/prisma/build/index.js",
        "generate",
        "--config",
        "prisma.config.ts",
      ],
      command: "node",
      name: "Generate Prisma Client",
      writesSource: true,
    },
    {
      args: [
        "node_modules/prisma/build/index.js",
        "validate",
        "--config",
        "prisma.config.ts",
      ],
      command: "node",
      name: "Validate Prisma Schema",
    },
    {
      args: [
        "node_modules/prisma/build/index.js",
        "migrate",
        "deploy",
        "--config",
        "prisma.config.ts",
      ],
      command: "node",
      name: "Apply Committed Migrations",
      writesDatabase: true,
    },
    {
      args: [
        "node_modules/prisma/build/index.js",
        "migrate",
        "status",
        "--config",
        "prisma.config.ts",
      ],
      command: "node",
      name: "Check Migration Status",
    },
  ]

  if (process.env[SKIP_REFERENCE_SEED_ENV] !== "1") {
    steps.push({
      args: ["scripts/seed-retail-ops-reference-data.ts"],
      command: "bun",
      env: {
        CONFIRM_RETAIL_OPS_REFERENCE_SEED: "1",
      },
      name: "Seed Retail Ops Reference Data",
      writesDatabase: true,
    })
  }

  steps.push(
    {
      args: ["scripts/retail-ops-live-validation.ts"],
      command: "bun",
      name: "Validate Retail Ops Live Schema And Reference Data",
    },
    {
      args: ["scripts/validate-retail-ops-workflows.ts"],
      command: "bun",
      env: {
        CONFIRM_RETAIL_OPS_WORKFLOW_VALIDATION: "1",
      },
      name: "Validate Retail Ops Migrated Workflows",
      writesDatabase: true,
    },
  )

  return steps
}

function summarizeCommand(step: ValidationStep) {
  return [step.command, ...step.args].join(" ")
}

function summarizePlannedStep(step: ValidationStep) {
  return {
    command: summarizeCommand(step),
    name: step.name,
    writesDatabase: Boolean(step.writesDatabase),
    writesSource: Boolean(step.writesSource),
  }
}

function runStep(step: ValidationStep): Promise<ValidationStepResult> {
  const startedAt = Date.now()

  return new Promise((resolve) => {
    let stdout = ""
    let stderr = ""
    const child = spawn(step.command, step.args, {
      cwd: packageDir,
      env: {
        ...process.env,
        ...step.env,
      },
      stdio: ["ignore", "pipe", "pipe"],
    })

    child.stdout.on("data", (chunk: Buffer) => {
      const text = chunk.toString()

      stdout += text
      process.stdout.write(text)
    })

    child.stderr.on("data", (chunk: Buffer) => {
      const text = chunk.toString()

      stderr += text
      process.stderr.write(text)
    })

    child.on("error", (error) => {
      stderr += `${error.message}\n`
    })

    child.on("close", (exitCode, signal) => {
      resolve({
        command: summarizeCommand(step),
        durationMs: Date.now() - startedAt,
        exitCode,
        name: step.name,
        ok: exitCode === 0,
        signal,
        stderr,
        stdout,
        writesDatabase: Boolean(step.writesDatabase),
        writesSource: Boolean(step.writesSource),
      })
    })
  })
}

async function writeReport(report: unknown) {
  const reportPath = process.env[REPORT_PATH_ENV]?.trim()

  if (!reportPath) return null

  const resolvedPath = path.resolve(process.cwd(), reportPath)

  await writeFile(resolvedPath, `${JSON.stringify(report, null, 2)}\n`)

  return resolvedPath
}

async function main() {
  const target = requireValidationEnvironment()
  const startedAt = new Date()
  const steps = buildValidationSteps()
  const results: ValidationStepResult[] = []
  const dryRun = process.env[DRY_RUN_ENV] === "1"

  if (dryRun) {
    const report = {
      dryRun: true,
      finishedAt: new Date().toISOString(),
      ok: true,
      plannedSteps: steps.map(summarizePlannedStep),
      reportVersion: 1,
      startedAt: startedAt.toISOString(),
      target,
      totalDurationMs: Date.now() - startedAt.getTime(),
      writesDatabase: steps.some((step) => step.writesDatabase),
      writesSource: steps.some((step) => step.writesSource),
    }
    const reportPath = await writeReport(report)

    console.log(
      JSON.stringify(
        {
          dryRun: true,
          ok: true,
          plannedSteps: report.plannedSteps,
          reportPath,
          target,
        },
        null,
        2,
      ),
    )

    return
  }

  for (const step of steps) {
    console.log(`\n==> ${step.name}`)

    const result = await runStep(step)
    results.push(result)

    if (!result.ok) break
  }

  const report = {
    finishedAt: new Date().toISOString(),
    dryRun: false,
    ok: results.length === steps.length && results.every((result) => result.ok),
    reportVersion: 1,
    startedAt: startedAt.toISOString(),
    target,
    totalDurationMs: Date.now() - startedAt.getTime(),
    writesDatabase: steps.some((step) => step.writesDatabase),
    writesSource: steps.some((step) => step.writesSource),
    steps: results,
  }
  const reportPath = await writeReport(report)

  console.log(
    JSON.stringify(
      {
        ok: report.ok,
        reportPath,
        target,
        totalDurationMs: report.totalDurationMs,
      },
      null,
      2,
    ),
  )

  if (!report.ok) {
    process.exitCode = 1
  }
}

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        error: error instanceof Error ? error.message : String(error),
        ok: false,
      },
      null,
      2,
    ),
  )
  process.exitCode = 1
})
