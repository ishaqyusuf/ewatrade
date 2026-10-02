import { readFileSync, writeFileSync } from "node:fs"

const args = new Set(process.argv.slice(2))
for (const arg of args)
  if (!["--json", "--tickets", "--write"].includes(arg))
    throw new Error(`Unknown finance progress argument: ${arg}`)

const root = new URL("../", import.meta.url)
const planPath = ".brain/plans/2026-10-02-merchant-finance-task-progress.md"
const read = (path) => readFileSync(new URL(path, root), "utf8")
const write = (path, content) => writeFileSync(new URL(path, root), content)
const original = read(
  ".brain/plans/2026-10-01-merchant-finance-implementation.md",
)
  .split("### Phase 0 —")[1]
  .split("### Expense corrections checkpoint")[0]
const milestoneCounts = []
let phaseIndex = 0
for (const line of original.split("\n")) {
  const heading = line.match(/^### Phase (\d) —/)
  if (heading) phaseIndex = Number(heading[1])
  const item = line.match(/^- \[([ x])\] /)
  if (item) {
    milestoneCounts[phaseIndex] ??= { completed: 0, total: 0 }
    milestoneCounts[phaseIndex].total++
    milestoneCounts[phaseIndex].completed += Number(item[1] === "x")
  }
}

const content = read(planPath)
const baselineVersion = Number(content.match(/^Baseline version: (\d+)/m)?.[1])
if (!Number.isSafeInteger(baselineVersion) || baselineVersion < 1)
  throw new Error("Missing explicit baseline version")
const declaredTaskCount = Number(
  content.match(/^Baseline task count: (\d+)\.$/m)?.[1],
)
if (!Number.isSafeInteger(declaredTaskCount) || declaredTaskCount < 1)
  throw new Error("Missing explicit baseline task count")
const phases = []
const taskIds = new Set()
const ticketIds = new Set()
let phase
let ticket
for (const line of content.split("\n")) {
  const phaseHeading = line.match(/^## Phase (\d) — (.+)$/)
  if (phaseHeading) {
    phase = {
      id: Number(phaseHeading[1]),
      title: phaseHeading[2],
      completed: 0,
      total: 0,
      tickets: [],
    }
    if (phases.some((p) => p.id === phase.id))
      throw new Error("Duplicate finance phase")
    phases.push(phase)
    ticket = undefined
    continue
  }
  const ticketHeading = line.match(/^### (F(\d)\.(\d+)) — (.+)$/)
  if (ticketHeading) {
    if (
      !phase ||
      phase.id !== Number(ticketHeading[2]) ||
      ticketIds.has(ticketHeading[1])
    )
      throw new Error("Invalid or duplicate finance ticket")
    ticket = {
      id: ticketHeading[1],
      title: ticketHeading[4],
      completed: 0,
      total: 0,
      tasks: [],
    }
    ticketIds.add(ticket.id)
    phase.tickets.push(ticket)
    continue
  }
  const task = line.match(/^- \[([ x])\] (F\d\.\d+(?:\.\d+)+) (.+)$/)
  if (task) {
    if (
      !phase ||
      !ticket ||
      !task[2].startsWith(`${ticket.id}.`) ||
      taskIds.has(task[2])
    )
      throw new Error("Invalid or duplicate finance task")
    taskIds.add(task[2])
    const done = task[1] === "x"
    ticket.tasks.push({ id: task[2], title: task[3], completed: done })
    ticket.completed += Number(done)
    ticket.total++
    phase.completed += Number(done)
    phase.total++
  } else if (/^- \[[ x]\]/.test(line)) {
    throw new Error("Every counted finance task requires a stable task ID")
  }
}
if (phases.length !== 8 || ticketIds.size !== 61)
  throw new Error(
    "Detailed progress must retain all eight phases and 61 original tickets",
  )
for (const p of phases) {
  if (
    p.tickets.length !== milestoneCounts[p.id]?.total ||
    p.tickets.some((t) => t.total === 0)
  )
    throw new Error(`Incomplete original-ticket coverage for phase ${p.id}`)
}

const percent = (completed, total) =>
  Math.round((completed / total) * 1000) / 10
const ratio = (record) =>
  `${record.completed}/${record.total} — ${percent(record.completed, record.total).toFixed(1)}%`
const summary = {
  metric:
    "completed unique detailed checklist tasks / all detailed checklist tasks",
  baselineVersion,
  source: planPath,
  completed: phases.reduce((n, p) => n + p.completed, 0),
  total: phases.reduce((n, p) => n + p.total, 0),
  completedMilestones: milestoneCounts.reduce((n, p) => n + p.completed, 0),
  totalMilestones: milestoneCounts.reduce((n, p) => n + p.total, 0),
  phases,
}
summary.percent = percent(summary.completed, summary.total)
summary.pending = summary.total - summary.completed
if (summary.total !== declaredTaskCount)
  throw new Error(
    "Task scope changed: explicitly revise the declared baseline count and record the reason",
  )
summary.acceptedPhases = milestoneCounts.filter(
  (p) => p.completed === p.total,
).length
for (const p of phases) {
  p.percent = percent(p.completed, p.total)
  p.milestones = milestoneCounts[p.id]
  for (const t of p.tickets) t.percent = percent(t.completed, t.total)
}

const table = [
  "| Phase | Checklist tasks | Implementation |",
  "| --- | ---: | ---: |",
  ...phases.map(
    (p) =>
      `| ${p.id} ${p.title} | ${p.completed}/${p.total} | ${p.percent.toFixed(1)}% |`,
  ),
].join("\n")
const block = `<!-- finance-task-progress:start -->\nImplementation tasks: **${ratio(summary)}**; **${summary.pending} pending**.\n\n${table}\n\nOriginal milestones: **${summary.completedMilestones}/${summary.totalMilestones}**. Fully accepted phases: **${summary.acceptedPhases}/${phases.length}**.\nThis baseline counts detailed tasks; it does not estimate effort or release readiness.\n[Every ticket and its checklist](2026-10-02-merchant-finance-task-progress.md).\n<!-- finance-task-progress:end -->`

if (args.has("--write")) {
  const checkInPath = ".brain/plans/2026-10-01-merchant-finance-check-in.md"
  const checkIn = read(checkInPath)
  if (
    !checkIn.includes("<!-- finance-task-progress:start -->") ||
    !checkIn.includes("<!-- finance-task-progress:end -->")
  )
    throw new Error(
      "Missing owned progress summary markers in Finance check-in",
    )
  let detailed = content
  for (const p of phases)
    for (const t of p.tickets) {
      const escaped = t.id.replaceAll(".", "\\.")
      const section = new RegExp(
        `(^### ${escaped} — [^\\n]+\\n)(?:\\nTask progress: [^\\n]+\\n)?`,
        "m",
      )
      detailed = detailed.replace(
        section,
        `$1\nTask progress: **${ratio(t)}**.\n`,
      )
    }
  write(planPath, detailed)
  write(
    checkInPath,
    checkIn.replace(
      /<!-- finance-task-progress:start -->[\s\S]*?<!-- finance-task-progress:end -->/,
      block,
    ),
  )
}
if (args.has("--json"))
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`)
else {
  process.stdout.write(
    `Implementation tasks: ${ratio(summary)}; ${summary.pending} pending\n${table}\nMilestones: ${summary.completedMilestones}/${summary.totalMilestones}; accepted phases ${summary.acceptedPhases}/${phases.length}\n`,
  )
  if (args.has("--tickets"))
    for (const p of phases)
      for (const t of p.tickets)
        process.stdout.write(`${t.id}: ${ratio(t)} — ${t.title}\n`)
}
