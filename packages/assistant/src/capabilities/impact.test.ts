import { expect, test } from "bun:test"
import {
  type ImpactGateInput,
  classifyChangedPaths,
  draftImpactRecord,
  evaluateImpactGate,
  parseCoverageSnapshot,
} from "./impact"

const coverage = (
  capabilities: string[],
  procedures: string[],
) => `# Assistant capability coverage

## Capabilities

| ID | v | Mode | Tool | Roles | Scoped staff | Clients | Rollout | Procedures |
|---|---|---|---|---|---|---|---|---|
${capabilities.join("\n")}

## Chat examples and regression tests

| Capability | Example requests | Registered regression tests |
|---|---|---|
| \`customers.read\` | Find Amina | None registered |

## Merchant procedures

| Procedure | Type | Scoped staff | Owner | Status | Capability, ticket or reason |
|---|---|---|---|---|---|
${procedures.join("\n")}
`
const customersRead =
  "| `customers.read` | 1 | read | `readCustomer` | OWNER, ADMIN | read | dashboard, mobile | source | `customers.get` |"
const staffActivity =
  "| `staff.activity.read` | 1 | read | `readStaffActivity` | OWNER, ADMIN, MANAGER | Owner/Admin only | dashboard, mobile | planned | `retailOps.staffActivity` |"
const customersGet =
  "| `customers.get` | query | read | customers | supported | customers.read |"
const staffActivityRow =
  "| `retailOps.staffActivity` | query | Owner/Admin only | staff | supported | staff.activity.read |"
const exportRow =
  "| `retailOps.exportStaff` | mutation | Owner/Admin only | staff | excluded | Bulk export stays form-only \\| reviewed. |"

const base = parseCoverageSnapshot(coverage([customersRead], [customersGet]))
const head = parseCoverageSnapshot(
  coverage(
    [customersRead, staffActivity],
    [customersGet, staffActivityRow, exportRow],
  ),
)
const record = {
  version: 1,
  id: "2026-10-12-staff-activity",
  tickets: ["S05"],
  summary: "Daily staff activity read.",
  capabilities: [
    { id: "staff.activity.read", change: "added", rollout: "planned" },
  ],
  procedures: [
    {
      path: "retailOps.staffActivity",
      status: "supported",
      reason: "Read projection over attributed sources.",
    },
    {
      path: "retailOps.exportStaff",
      status: "excluded",
      reason: "Bulk export stays form-only.",
    },
  ],
  docs: [
    {
      topic: "feature",
      path: ".brain/features/assistant-business-operations.md",
      status: "local_only",
    },
    {
      topic: "api",
      path: ".brain/api/endpoints.md",
      status: "local_only",
    },
    {
      topic: "capability",
      path: "packages/assistant/src/capabilities/COVERAGE.md",
      status: "updated",
    },
  ],
  evidence: [
    {
      kind: "test",
      path: "apps/api/src/assistant/staff-activity.test.ts",
      executed: false,
    },
  ],
}
const recordPath = "packages/assistant/impact/2026-10-12-staff-activity.json"
const changedPaths = [
  "apps/api/src/trpc/routers/retail-ops.ts",
  "packages/assistant/src/capabilities/manifest.ts",
  "packages/assistant/src/capabilities/COVERAGE.md",
  "apps/api/src/assistant/staff-activity.test.ts",
  recordPath,
]
const input = (overrides: Partial<ImpactGateInput> = {}): ImpactGateInput => ({
  changedPaths,
  records: new Map([[recordPath, record]]),
  base,
  head,
  exists: () => true,
  localFiles: true,
  ...overrides,
})

test("classifies merchant behavior and keeps tests and assets exempt", () => {
  const areas = classifyChangedPaths([
    "packages/db/prisma/models/staff.prisma",
    "apps/api/src/utils/staff-procedure-policy.ts",
    "packages/auth/src/roles.ts",
    "apps/api/src/trpc/routers/orders.ts",
    "apps/api/src/trpc/routers/orders.test.ts",
    "apps/api/src/assistant/general-product-price.ts",
    "packages/assistant/src/general/quote-decision.ts",
    "packages/db/src/queries/service-intake.ts",
    "apps/api/src/finance/post-journal.ts",
    "apps/dashboard/src/components/sheets/global-sheets.tsx",
    "apps/mobile/src/components/mobile/assistant/general-change-editor.tsx",
    "packages/ui/src/components/dialog.tsx",
    // Exempt: tests, fixtures, assets, docs, the gates and tooling/config.
    "packages/db/src/queries/test-helpers/commerce.ts",
    "apps/mobile/assets/store-listing/v32-native/hero.png",
    "packages/assistant/src/capabilities/COVERAGE.md",
    "packages/assistant/src/capabilities/impact.ts",
    "scripts/assistant-impact.ts",
    "apps/mobile/app.config.ts",
  ])
  expect(Object.fromEntries(areas)).toEqual({
    schema: ["packages/db/prisma/models/staff.prisma"],
    permissions: [
      "apps/api/src/utils/staff-procedure-policy.ts",
      "packages/auth/src/roles.ts",
    ],
    api: ["apps/api/src/trpc/routers/orders.ts"],
    capability: [
      "apps/api/src/assistant/general-product-price.ts",
      "packages/assistant/src/general/quote-decision.ts",
    ],
    domain: [
      "packages/db/src/queries/service-intake.ts",
      "apps/api/src/finance/post-journal.ts",
    ],
    client: [
      "apps/dashboard/src/components/sheets/global-sheets.tsx",
      "apps/mobile/src/components/mobile/assistant/general-change-editor.tsx",
      "packages/ui/src/components/dialog.tsx",
    ],
  })
})

test("domain and client behavior changes need a record with an assistant decision", () => {
  const domain = evaluateImpactGate(
    input({
      changedPaths: ["packages/db/src/queries/service-intake.ts"],
      records: new Map(),
      head: base,
    }),
  )
  expect(domain.errors).toEqual([
    "Changes touch domain but add no impact record in packages/assistant/impact/. Run `bun assistant:impact --draft` and review it.",
  ])
  const clientPath = "packages/assistant/impact/2026-10-12-receipt-layout.json"
  const client = {
    version: 1,
    id: "2026-10-12-receipt-layout",
    tickets: ["A03"],
    summary: "Receipt card layout.",
    docs: [
      { topic: "feature", status: "not_applicable", note: "Layout only." },
    ],
    evidence: [{ kind: "review", path: "x.tsx", executed: false }],
  }
  const silent = evaluateImpactGate(
    input({
      changedPaths: ["apps/dashboard/src/components/receipt.tsx", clientPath],
      records: new Map([[clientPath, client]]),
      head: base,
    }),
  )
  expect(silent.errors).toEqual([
    "Impact records omit the assistant decision: name the affected capabilities (unchanged with a note is allowed) or state noAssistantImpact",
  ])
  const stated = evaluateImpactGate(
    input({
      changedPaths: ["apps/dashboard/src/components/receipt.tsx", clientPath],
      records: new Map([
        [
          clientPath,
          { ...client, noAssistantImpact: "Presentation only; same actions." },
        ],
      ]),
      head: base,
    }),
  )
  expect(stated.errors).toEqual([])
})

test("declared capability changes must match coverage and carry current rollout", () => {
  const declared = (capabilities: unknown[]) =>
    evaluateImpactGate(
      input({ records: new Map([[recordPath, { ...record, capabilities }]]) }),
    ).errors
  expect(
    declared([{ id: "staff.activity.read", change: "unchanged" }]),
  ).toEqual([
    `${recordPath}: staff.activity.read is declared unchanged but coverage shows added`,
    `${recordPath}: staff.activity.read needs its current rollout (planned)`,
  ])
  expect(
    declared([
      { id: "staff.activity.read", change: "added", rollout: "planned" },
      { id: "customers.read", change: "changed", rollout: "source" },
    ]),
  ).toEqual([
    `${recordPath}: customers.read is declared changed but coverage shows unchanged`,
  ])
  // An unchanged capability may be named to record the assistant decision.
  expect(
    declared([
      { id: "staff.activity.read", change: "added", rollout: "planned" },
      { id: "customers.read", change: "unchanged", rollout: "source" },
    ]),
  ).toEqual([])
})

test("coverage parsing keeps escaped pipes inside a reason", () => {
  expect(head.procedures.get("retailOps.exportStaff")?.status).toBe("excluded")
  expect(head.capabilities.get("staff.activity.read")?.rollout).toBe("planned")
  // Example rows from other sections never count as capabilities.
  expect([...head.capabilities.keys()]).toEqual([
    "customers.read",
    "staff.activity.read",
  ])
})

test("a reviewed record naming every machine-known row passes", () => {
  const result = evaluateImpactGate(input())
  expect(result.errors).toEqual([])
  expect(result.changes.capabilities).toEqual(
    new Map([["staff.activity.read", "added"]]),
  )
})

test("gated changes without a record fail with the draft command", () => {
  const result = evaluateImpactGate(input({ records: new Map() }))
  expect(result.errors).toEqual([
    "Changes touch api, capability but add no impact record in packages/assistant/impact/. Run `bun assistant:impact --draft` and review it.",
  ])
})

test("ungated changes need no record", () => {
  const result = evaluateImpactGate(
    input({
      changedPaths: [
        "apps/mobile/app.config.ts",
        "apps/dashboard/public/logo.svg",
        "apps/api/src/assistant/general-tools.test.ts",
      ],
      records: new Map(),
      head: base,
    }),
  )
  expect(result.errors).toEqual([])
})

test("unnamed rows, stale rollout and wrong status are reported", () => {
  const result = evaluateImpactGate(
    input({
      records: new Map([
        [
          recordPath,
          {
            ...record,
            capabilities: [
              {
                id: "staff.activity.read",
                change: "added",
                rollout: "enabled",
              },
            ],
            procedures: [
              {
                path: "retailOps.staffActivity",
                status: "planned",
                reason: "Not yet.",
              },
            ],
          },
        ],
      ]),
    }),
  )
  expect(result.errors).toEqual([
    `${recordPath}: staff.activity.read rollout enabled differs from coverage planned`,
    `${recordPath}: retailOps.staffActivity is supported in coverage, not planned`,
  ])
  const unnamed = evaluateImpactGate(
    input({
      records: new Map([
        [recordPath, { ...record, procedures: [record.procedures[0]] }],
      ]),
    }),
  )
  expect(unnamed.errors).toEqual([
    "Merchant procedure retailOps.exportStaff was added; record its support, planned ticket or exclusion",
  ])
})

test("schema and permission changes need their documentation decisions", () => {
  const result = evaluateImpactGate(
    input({
      changedPaths: [
        ...changedPaths,
        "packages/db/prisma/models/staff.prisma",
        "packages/auth/src/roles.ts",
      ],
    }),
  )
  expect(result.errors).toEqual([
    "Impact records omit the schema documentation decision",
    "Impact records omit the permissions documentation decision",
  ])
})

test("Brain files stay local-only and are not claimed in CI", () => {
  const wrong = evaluateImpactGate(
    input({
      records: new Map([
        [
          recordPath,
          {
            ...record,
            docs: [
              {
                topic: "feature",
                path: ".brain/features/assistant-business-operations.md",
                status: "updated",
              },
              {
                topic: "api",
                path: "docs/api.md",
                status: "updated",
              },
              { topic: "capability", status: "not_applicable" },
            ],
          },
        ],
      ]),
    }),
  )
  expect(wrong.errors).toEqual([
    `${recordPath}: feature doc: ignored Brain files must be local_only`,
    `${recordPath}: api doc: docs/api.md is marked updated but unchanged`,
    `${recordPath}: capability doc needs a note when not applicable`,
  ])
  const ci = evaluateImpactGate(
    input({ localFiles: false, exists: () => true }),
  )
  expect(ci.errors).toEqual([])
  expect(ci.notes).toEqual([
    `${recordPath}: feature doc: .brain/features/assistant-business-operations.md is local-only; not verified in CI`,
    `${recordPath}: api doc: .brain/api/endpoints.md is local-only; not verified in CI`,
  ])
  const missing = evaluateImpactGate(
    input({ exists: (path) => !path.startsWith(".brain/") }),
  )
  expect(missing.errors).toContain(
    `${recordPath}: feature doc: .brain/features/assistant-business-operations.md does not exist locally`,
  )
})

test("malformed records, executed evidence without results and name mismatch fail", () => {
  const result = evaluateImpactGate(
    input({
      records: new Map([
        ["packages/assistant/impact/other.json", { ...record, tickets: [] }],
        [
          "packages/assistant/impact/wrong-name.json",
          {
            ...record,
            evidence: [{ kind: "run", path: "x.md", executed: true }],
          },
        ],
      ]),
    }),
  )
  expect(result.errors).toEqual([
    "packages/assistant/impact/other.json: tickets Too small: expected array to have >=1 items",
    "packages/assistant/impact/wrong-name.json: file name must be 2026-10-12-staff-activity.json",
    "packages/assistant/impact/wrong-name.json: executed evidence x.md needs a result",
  ])
})

test("draft lists machine-known rows and required documentation topics", () => {
  const draft = draftImpactRecord({
    id: "2026-10-12-staff-activity",
    changedPaths,
    base,
    head,
  })
  expect(draft.capabilities).toEqual([
    {
      id: "staff.activity.read",
      change: "added",
      rollout: "planned",
      note: "TODO: reviewed rationale",
    },
  ])
  expect(draft.procedures.map((entry) => [entry.path, entry.status])).toEqual([
    ["retailOps.staffActivity", "supported"],
    ["retailOps.exportStaff", "excluded"],
  ])
  expect(draft.docs.map((doc) => doc.topic)).toEqual([
    "feature",
    "api",
    "capability",
  ])
})

test("a decision record may accompany the required documentation", () => {
  const result = evaluateImpactGate(
    input({
      records: new Map([
        [
          recordPath,
          {
            ...record,
            docs: [
              ...record.docs,
              {
                topic: "decision",
                path: ".brain/decisions/2026-10-12-example.md",
                status: "local_only",
              },
            ],
          },
        ],
      ]),
    }),
  )
  expect(result.errors).toEqual([])
})
