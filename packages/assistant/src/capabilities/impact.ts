import { z } from "zod"

/**
 * Feature change gate (H02). A change to merchant behavior — endpoints, domain
 * commands and queries, schema, shared authority, assistant adapters or
 * web/mobile feature source — must ship a reviewed impact record in
 * `packages/assistant/impact/` that states its assistant support or deliberate
 * exclusion. Machine-known rows (capabilities and merchant procedures whose
 * generated coverage changed) must each be named with the actual change and
 * current rollout; rationale, documentation and rollout stay human-reviewed.
 * Brain files are ignored by git, so the gate records them as `local_only` and
 * never claims CI read them.
 */

export const impactRecordDirectory = "packages/assistant/impact"
export const coverageDocument =
  "packages/assistant/src/capabilities/COVERAGE.md"

export type ImpactArea =
  | "api"
  | "schema"
  | "permissions"
  | "capability"
  | "domain"
  | "client"
export type DocTopic =
  | "feature"
  | "api"
  | "schema"
  | "permissions"
  | "capability"

/**
 * Deliberately ungated paths, each with its reason. Anything else outside the
 * gated source trees (configuration, build and release tooling) is ungated too.
 */
export const impactExemptions: { pattern: RegExp; reason: string }[] = [
  {
    pattern:
      /\.(test|spec|fixture|integration-check)\.tsx?$|\/test-helpers\/|\/__tests__\//,
    reason: "Tests and fixtures prove behavior; they do not change it.",
  },
  {
    pattern:
      /\.(md|mdx|png|jpe?g|gif|webp|svg|ico|ttf|otf|woff2?|mp3|mp4|lottie)$|\/assets\//,
    reason: "Documentation and static assets carry no merchant behavior.",
  },
  {
    pattern:
      /^packages\/assistant\/src\/capabilities\/(impact|coverage)\.ts$|^apps\/api\/src\/assistant\/capability-coverage\.ts$/,
    reason: "The gates themselves are tooling, covered by their own tests.",
  },
]
const areaRules: { area: ImpactArea; pattern: RegExp }[] = [
  { area: "schema", pattern: /^packages\/db\/prisma\// },
  {
    area: "permissions",
    pattern:
      /^(packages\/auth\/src\/|apps\/api\/src\/utils\/staff-[^/]+\.ts$|apps\/api\/src\/trpc\/(init|finance-procedure)\.ts$|apps\/api\/src\/trpc\/routers\/[^/]*permission[^/]*\.ts$)/,
  },
  {
    area: "capability",
    pattern:
      /^(packages\/assistant\/src\/(capabilities|general)\/|apps\/api\/src\/assistant\/)/,
  },
  {
    area: "api",
    pattern: /^apps\/api\/src\/(trpc\/routers|schemas)\//,
  },
  {
    // Commands, repositories and services can change behavior without a
    // router signature or coverage row changing.
    area: "domain",
    pattern:
      /^(apps\/api\/src\/|packages\/(?!ui\/|tsconfig\/|assistant\/)[^/]+\/src\/)/,
  },
  {
    area: "client",
    pattern: /^(apps\/(?!api\/)[^/]+\/src\/|packages\/ui\/src\/)/,
  },
]
/** Documentation each touched area needs; `feature` is always required. */
const requiredTopics: Record<ImpactArea, DocTopic> = {
  api: "api",
  schema: "schema",
  permissions: "permissions",
  capability: "capability",
  domain: "feature",
  client: "feature",
}

/** Areas whose changes need an impact record. */
export function classifyChangedPaths(paths: readonly string[]) {
  const areas = new Map<ImpactArea, string[]>()
  for (const path of paths) {
    if (impactExemptions.some((entry) => entry.pattern.test(path))) continue
    const rule = areaRules.find((entry) => entry.pattern.test(path))
    if (rule) areas.set(rule.area, [...(areas.get(rule.area) ?? []), path])
  }
  return areas
}

const trimmed = z.string().trim().min(1)
const rollout = z.enum(["planned", "source", "pilot", "enabled"])
export const impactRecordSchema = z
  .object({
    version: z.literal(1),
    id: z.string().regex(/^\d{4}-\d{2}-\d{2}-[a-z0-9-]+$/),
    tickets: z.array(z.string().regex(/^[A-HS]\d{2}$/)).min(1),
    summary: trimmed,
    /** Why the change has no assistant consequence; replaces capability rows. */
    noAssistantImpact: trimmed.optional(),
    capabilities: z
      .array(
        z.object({
          id: z.string().regex(/^[a-z_]+(\.[a-z_]+)+$/),
          change: z.enum(["added", "changed", "removed", "unchanged"]),
          /** Must equal the generated coverage rollout unless removed. */
          rollout: rollout.optional(),
          note: trimmed.optional(),
        }),
      )
      .default([]),
    procedures: z
      .array(
        z.object({
          path: trimmed,
          status: z.enum([
            "supported",
            "planned",
            "form_only",
            "excluded",
            "removed",
          ]),
          reason: trimmed,
        }),
      )
      .default([]),
    docs: z
      .array(
        z.object({
          topic: z.enum([
            "feature",
            "api",
            "schema",
            "permissions",
            "capability",
          ]),
          path: trimmed.optional(),
          status: z.enum(["updated", "local_only", "not_applicable"]),
          note: trimmed.optional(),
        }),
      )
      .min(1),
    evidence: z
      .array(
        z.object({
          kind: z.enum(["test", "fixture", "run", "screenshot", "review"]),
          path: trimmed,
          /** Definitions are not evidence of a passing run. */
          executed: z.boolean(),
          result: trimmed.optional(),
        }),
      )
      .default([]),
  })
  .strict()
export type ImpactRecord = z.infer<typeof impactRecordSchema>

type CoverageCapability = { id: string; row: string; rollout: string }
type CoverageProcedure = { path: string; row: string; status: string }
export type CoverageSnapshot = {
  capabilities: Map<string, CoverageCapability>
  procedures: Map<string, CoverageProcedure>
}

function section(markdown: string, heading: string) {
  const start = markdown.indexOf(`\n## ${heading}\n`)
  if (start < 0) return []
  const rest = markdown.slice(start + heading.length + 5)
  const end = rest.indexOf("\n## ")
  return (end < 0 ? rest : rest.slice(0, end))
    .split("\n")
    .filter((line) => line.startsWith("| `"))
}
const cells = (row: string) =>
  row
    .slice(1, -1)
    .split(/(?<!\\)\|/)
    .map((cell) => cell.trim())
const code = (cell = "") => cell.replace(/^`|`$/g, "")

/** Reads the generated coverage tables; a missing document is empty. */
export function parseCoverageSnapshot(markdown: string): CoverageSnapshot {
  const capabilities = new Map<string, CoverageCapability>()
  for (const row of section(markdown, "Capabilities")) {
    const [id, , , , , , , rolloutCell] = cells(row)
    capabilities.set(code(id), {
      id: code(id),
      row,
      rollout: rolloutCell ?? "",
    })
  }
  const procedures = new Map<string, CoverageProcedure>()
  for (const row of section(markdown, "Merchant procedures")) {
    const [path, , , , status] = cells(row)
    procedures.set(code(path), { path: code(path), row, status: status ?? "" })
  }
  return { capabilities, procedures }
}

/** Machine-known rows a reviewed record must name. */
export function coverageChanges(
  base: CoverageSnapshot,
  head: CoverageSnapshot,
) {
  const diff = <T extends { row: string }>(
    before: Map<string, T>,
    after: Map<string, T>,
  ) => {
    const changes = new Map<string, "added" | "changed" | "removed">()
    for (const [key, value] of after) {
      const old = before.get(key)
      if (!old) changes.set(key, "added")
      else if (old.row !== value.row) changes.set(key, "changed")
    }
    for (const key of before.keys())
      if (!after.has(key)) changes.set(key, "removed")
    return changes
  }
  return {
    capabilities: diff(base.capabilities, head.capabilities),
    procedures: diff(base.procedures, head.procedures),
  }
}

export type ImpactGateInput = {
  changedPaths: readonly string[]
  /** Records added or modified by the change, keyed by repository path. */
  records: ReadonlyMap<string, unknown>
  base: CoverageSnapshot
  head: CoverageSnapshot
  /** True when a tracked repository path exists at HEAD. */
  exists: (path: string) => boolean
  /** Local Brain checks are skipped in CI, where ignored files are absent. */
  localFiles: boolean
}

export function evaluateImpactGate(input: ImpactGateInput) {
  const errors: string[] = []
  const notes: string[] = []
  const areas = classifyChangedPaths(input.changedPaths)
  const changes = coverageChanges(input.base, input.head)
  const machineRows = changes.capabilities.size + changes.procedures.size
  if (!areas.size && !machineRows && !input.records.size)
    return { areas, changes, errors, notes, records: [] as ImpactRecord[] }
  if (!input.records.size) {
    const touched = [...areas.keys()].join(", ") || "generated coverage"
    errors.push(
      `Changes touch ${touched} but add no impact record in ${impactRecordDirectory}/. Run \`bun assistant:impact --draft\` and review it.`,
    )
    return { areas, changes, errors, notes, records: [] as ImpactRecord[] }
  }
  const changed = new Set(input.changedPaths)
  const records: ImpactRecord[] = []
  for (const [path, value] of input.records) {
    const parsed = impactRecordSchema.safeParse(value)
    if (!parsed.success) {
      for (const issue of parsed.error.issues)
        errors.push(
          `${path}: ${issue.path.join(".") || "record"} ${issue.message}`,
        )
      continue
    }
    const record = parsed.data
    if (!path.endsWith(`/${record.id}.json`))
      errors.push(`${path}: file name must be ${record.id}.json`)
    if (record.noAssistantImpact && record.capabilities.length)
      errors.push(`${path}: noAssistantImpact cannot also list capabilities`)
    if (!record.noAssistantImpact && !record.evidence.length)
      errors.push(`${path}: add evidence or explain noAssistantImpact`)
    for (const doc of record.docs) {
      const label = `${path}: ${doc.topic} doc`
      if (doc.status === "not_applicable") {
        if (!doc.note) errors.push(`${label} needs a note when not applicable`)
        continue
      }
      if (!doc.path) {
        errors.push(`${label} needs a path`)
        continue
      }
      if (doc.status === "local_only") {
        if (!doc.path.startsWith(".brain/"))
          errors.push(`${label}: only ignored .brain/ files may be local_only`)
        else if (input.localFiles && !input.exists(doc.path))
          errors.push(`${label}: ${doc.path} does not exist locally`)
        else if (!input.localFiles)
          notes.push(`${label}: ${doc.path} is local-only; not verified in CI`)
      } else if (doc.path.startsWith(".brain/"))
        errors.push(`${label}: ignored Brain files must be local_only`)
      else if (!changed.has(doc.path))
        errors.push(`${label}: ${doc.path} is marked updated but unchanged`)
    }
    for (const item of record.evidence) {
      const local = /^(\.brain|artifacts|output|outputs)\//.test(item.path)
      if (local) {
        if (input.localFiles && !input.exists(item.path))
          errors.push(`${path}: evidence ${item.path} does not exist locally`)
      } else if (!input.exists(item.path))
        errors.push(`${path}: evidence ${item.path} does not exist`)
      if (item.executed && !item.result)
        errors.push(`${path}: executed evidence ${item.path} needs a result`)
    }
    for (const entry of record.capabilities) {
      const current = input.head.capabilities.get(entry.id)
      const actual = changes.capabilities.get(entry.id) ?? "unchanged"
      if (entry.change !== actual)
        errors.push(
          `${path}: ${entry.id} is declared ${entry.change} but coverage shows ${actual}`,
        )
      if (entry.change === "removed") {
        if (current) errors.push(`${path}: ${entry.id} is still in coverage`)
      } else if (!current)
        errors.push(`${path}: unknown capability ${entry.id}`)
      else if (!entry.rollout)
        errors.push(
          `${path}: ${entry.id} needs its current rollout (${current.rollout})`,
        )
      else if (entry.rollout !== current.rollout)
        errors.push(
          `${path}: ${entry.id} rollout ${entry.rollout} differs from coverage ${current.rollout}`,
        )
    }
    for (const entry of record.procedures) {
      const current = input.head.procedures.get(entry.path)
      if (entry.status === "removed") {
        if (current) errors.push(`${path}: ${entry.path} is still a procedure`)
      } else if (!current)
        errors.push(`${path}: unknown merchant procedure ${entry.path}`)
      else if (current.status !== entry.status)
        errors.push(
          `${path}: ${entry.path} is ${current.status} in coverage, not ${entry.status}`,
        )
    }
    records.push(record)
  }
  if (errors.length) return { areas, changes, errors, notes, records }
  const named = {
    capabilities: new Set(
      records.flatMap((record) => record.capabilities.map((entry) => entry.id)),
    ),
    procedures: new Set(
      records.flatMap((record) => record.procedures.map((entry) => entry.path)),
    ),
    topics: new Set(
      records.flatMap((record) => record.docs.map((doc) => doc.topic)),
    ),
  }
  for (const [id, change] of changes.capabilities)
    if (!named.capabilities.has(id))
      errors.push(`Capability ${id} was ${change}; name it in an impact record`)
  for (const [procedure, change] of changes.procedures)
    if (!named.procedures.has(procedure))
      errors.push(
        `Merchant procedure ${procedure} was ${change}; record its support, planned ticket or exclusion`,
      )
  if (
    areas.size &&
    !records.some(
      (record) =>
        record.noAssistantImpact ||
        record.capabilities.length ||
        record.procedures.length,
    )
  )
    errors.push(
      "Impact records omit the assistant decision: name the affected capabilities (unchanged with a note is allowed) or state noAssistantImpact",
    )
  for (const topic of new Set<DocTopic>([
    "feature",
    ...[...areas.keys()].map((area) => requiredTopics[area]),
  ]))
    if (!named.topics.has(topic))
      errors.push(`Impact records omit the ${topic} documentation decision`)
  return { areas, changes, errors, notes, records }
}

/** A starting record from machine-known rows; rationale stays for review. */
export function draftImpactRecord(input: {
  id: string
  changedPaths: readonly string[]
  base: CoverageSnapshot
  head: CoverageSnapshot
}) {
  const areas = classifyChangedPaths(input.changedPaths)
  const changes = coverageChanges(input.base, input.head)
  const todo = "TODO: reviewed rationale"
  const machineRows = changes.capabilities.size + changes.procedures.size
  return {
    version: 1,
    id: input.id,
    tickets: ["TODO"],
    summary: todo,
    ...(machineRows
      ? {}
      : {
          noAssistantImpact:
            "TODO: why no assistant capability changes, or replace with capability rows",
        }),
    capabilities: [...changes.capabilities].map(([id, change]) => ({
      id,
      change,
      ...(change === "removed"
        ? {}
        : { rollout: input.head.capabilities.get(id)?.rollout }),
      note: todo,
    })),
    procedures: [...changes.procedures].map(([path, change]) => ({
      path,
      status:
        change === "removed"
          ? "removed"
          : input.head.procedures.get(path)?.status,
      reason: todo,
    })),
    docs: [
      ...new Set<DocTopic>([
        "feature",
        ...[...areas.keys()].map((area) => requiredTopics[area]),
      ]),
    ].map((topic) =>
      topic === "capability"
        ? { topic, status: "updated", path: coverageDocument }
        : { topic, status: "local_only", path: ".brain/TODO" },
    ),
    evidence: [],
  }
}
