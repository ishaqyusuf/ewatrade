# Agent Instructions

## Fast verification workflow

Use `docs/testing.md` as the current testing/release entrypoint. Reuse the root
dev launcher, QA Accelerator and existing release tool. Start with
`bun run qa:doctor --offline`, then select only the needed runtime services.
Run `bun run test:quick --plan` to inspect the fast source smoke scope; use
`--files <owned paths...>` when concurrent work must be excluded, and disclose
that narrower scope. Existing assistant CI gates still apply.

Complete focused verification once when the change is ready. Reuse valid
source/platform-specific evidence; repeat for a relevant change, failure,
concrete uncertainty or required release check. Do not multiply ordinary UI
checks across every theme, font, viewport and environment. Money, permission,
concurrency, native compatibility and release-specific checks remain required.
Fast smoke success is not full feature/type/UI/release acceptance. Unsupported
change mappings must remain visible. No deployment is implied by QA success.

## Codex / Claude communication

Use the root `AGENT_CHAT.md` for shared assistant-operation messages. Codex is the
acceptance coordinator; Claude is the implementation agent. Read
`.brain/features/agent-communication.md` for the protocol and `bun agent:chat help`
for commands. Check `bun agent:chat read --as <codex|claude> --unread` at work start,
before overlapping edits or handoffs, and periodically during active work. After
reading, acknowledge message IDs explicitly and reply with findings/evidence.
Append through the CLI; preserve history and never impersonate the other agent.
Messages coordinate existing work and do not authorize deployment, provider actions
or changes to human approval boundaries.

## Workshop model preference

Use Claude Opus 5.5 with high effort for Workshop work (owner instruction,
21 October 2026). In T3, discover the current catalog and delegate using
`providerInstanceId: "claudeAgent"`, `model: "claude-opus-5-5"`, and
`target.options: { "effort": "high" }` when those IDs remain available.
Verify the returned model/options. Do not silently substitute another model or
effort level; report a capability mismatch. This preference does not itself
start a Workshop or change existing design/implementation ownership.

Owner fallback instruction, 21 October 2026: when Claude is unavailable (including
API rate limits), Codex should do the Workshop work directly and finish the
authorized deliverable. Report the fallback; do not keep retrying or ask for a
model override. Preserve the same review, history and implementation boundaries.

## Storefront template design lifecycle

Use `https://workshop.localhost/ewatrade/storefront/template-library` as the
canonical Factory template design and review space (owner instruction,
23 October 2026). Keep all current and future templates there, using stable
template direction keys and immutable revisions for updates. Preview and refine
in that same space before applying or implementing product changes; record the
owner-approved exact revision before implementation and verified evidence after.
Keep earlier Storefront Studio/Retail/Service/Catalog choices and history intact.
Workshop is the design/review authority; the product registry and canonical
save/release commands retain runtime and publication authority. An archived
preview or selection does not authorize deployment/provider actions.

## Mobile search presentation

Always reuse the exact floating search footer from the mobile Global Search
screen: `BottomSearchFooter` and its `FloatingSearchField`. Do not create inline
search inputs, copy its appearance, or use a separate `FormField` search variant.
For search state inside a form, use `SearchFooterField` within the owning
`SearchFooterScope`, with `SearchFooterSpacer` in the scroll content. Sheets keep
their existing keyboard owner; Gorhom footer adapters reuse `BottomSearchFooter`
with `keyboardOwner="sheet"` and `position="relative"`.

Reuse the existing shared-component verification. Do not add or repeat device,
large-text, viewport or per-screen test passes simply to adopt this component.
For the 18 October 2026 migration, the owner explicitly requested no additional
tests after implementation; finish with a source review and documentation.

## WhatsApp design and implementation lifecycle

Use `.brain/plans/whatsapp-system-design/implementation-standard.md` for WhatsApp
feature work. Workshop `ewatrade/assistant/whatsapp-system` is the canonical design;
the existing private WhatsApp review Site is its mobile mirror. Preserve stable
case IDs, append case versions for changed conversations, and retain old replays.
Link implementation, focused checks, human approval and target release to the
exact case version with evidence; source presence or a local review mark is not
live availability. Update Workshop first and the matching Site in the same
authorized design/feature delivery. Keep existing URLs and private audience.

Follow Midday-style thin route/channel orchestration and the existing EwaTrade
assistant/domain commands, server-derived permissions/scope, durable jobs/results
and explicit confirmations. Keep identity/proof/control and OTP handling separate
from ordinary model input. Design selection/history never authorizes live changes;
preserve current human deployment/provider approval boundaries.

## Brain Protocol

`.brain/` is the project memory and source of truth for architecture, product state, tasks, and implementation context. Treat Brain documentation as part of the definition of done for every meaningful change.

Before starting work:

- Read the relevant Brain files for the task. Start with `.brain/BRAIN.md`, `.brain/SYSTEM_OVERVIEW.md`, `.brain/system/overview.md`, `.brain/system/architecture.md`, `.brain/engineering/ai-rules.md`, `.brain/engineering/coding-standards.md`, and `.brain/tasks/in-progress.md`.
- For feature work, also read the matching file in `.brain/features/` and any related ADR in `.brain/decisions/`.
- For API, auth, permission, database, or migration work, read the matching files under `.brain/api/` and `.brain/database/`.
- If the repository root defines both `db:migrate` and `db:push` scripts and Prisma schema/database files are changed, run both commands after the Prisma update. Do not manually create migration files.

After code changes:

- Run a Brain documentation impact check before finishing.
- Update `.brain/database/schema.md`, `.brain/database/relationships.md`, or `.brain/database/migrations.md` for database changes.
- For Prisma database updates, if root scripts `db:migrate` and `db:push` exist, run `bun db:migrate` and `bun db:push` after changing the schema. Do not manually create migration files.
- Update `.brain/api/endpoints.md`, `.brain/api/contracts.md`, or `.brain/api/permissions.md` for API, contract, auth, or permission changes.
- Update or create `.brain/features/<feature>.md` for feature behavior changes.
- Add an ADR under `.brain/decisions/` for durable architecture, product, integration, or implementation decisions.
- Update `.brain/tasks/backlog.md`, `.brain/tasks/in-progress.md`, `.brain/tasks/done.md`, or `.brain/tasks/roadmap.md` when task state changes.
- If no Brain update is needed, state that explicitly in the final response with the reason.

Final responses must include the Brain files updated, or `No Brain documentation updates required` with a short rationale.
