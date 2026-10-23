import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { z } from "zod"
import {
  type FixtureName,
  fixture,
} from "../../storefront-templates/src/fixtures"
import {
  artifactHash,
  beginComponentAttempt,
  finishComponentAttempt,
  readAttemptStatus,
  saveComponentArtifact,
  verifyArtifact,
} from "./artifacts"
import {
  COMPONENT_SDK_VERSION,
  type ComponentInput,
  componentArtifactProvenanceSchema,
  createComponentInput,
} from "./contracts"
import {
  COMPONENT_PROMPT_VERSION,
  type ComponentGenerator,
  GENERATION_LIMITS,
  componentGenerationPrompt,
  componentGenerationRequestSchema,
  invokeComponentGenerator,
} from "./generation"
import { runIsolatedComponentBuild } from "./isolation"
import { validateComponentSource } from "./source-policy"

const fixtureNames = [
  "populated",
  "empty",
  "unavailable",
] as const satisfies readonly FixtureName[]
type Stage = "generation" | "schema" | "build" | "preview"
export type ComponentDiagnostic = {
  stage: Stage
  code: string
  repairable: boolean
}
export type ComponentPipelineResult = {
  status: "ready" | "failed" | "outcome-unknown"
  attemptId: string
  artifactId: string | null
  artifactPath: string | null
  diagnostics: ComponentDiagnostic[]
  replayed?: boolean
}
const escaped = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
const safeCode = (error: unknown) =>
  error instanceof Error
    ? (error.message.match(/^COMPONENT_[A-Z_]+(?::[a-z]+)?$/)?.[0] ??
      "COMPONENT_QUALIFICATION_FAILED")
    : "COMPONENT_QUALIFICATION_FAILED"
const tags = new Set(
  "section article header footer div span p h1 h2 h3 h4 h5 h6 strong em small ul ol li dl dt dd figure figcaption hr br button img".split(
    " ",
  ),
)
const voidTags = new Set(["hr", "br", "img"])

/** Small strict serialization grammar, not a sanitizer. Ambiguous/active HTML is refused. */
export function validateInertComponentHtml(
  html: string,
  input: ComponentInput,
) {
  if (
    Buffer.byteLength(html) > 262_144 ||
    Array.from(html).some(
      (character) =>
        character.charCodeAt(0) < 32 &&
        ![9, 10, 13].includes(character.charCodeAt(0)),
    )
  )
    throw new Error("COMPONENT_PREVIEW_HTML_LIMIT")
  const stack: string[] = []
  const frameTokens: Record<string, string> = {
    "--sf-component-accent": input.theme.accent,
    "--sf-component-background": input.theme.background,
    "--sf-component-font":
      input.theme.font === "serif" ? "Georgia, serif" : "system-ui, sans-serif",
    "--sf-component-radius": { none: "0", small: "6px", rounded: "20px" }[
      input.theme.radius
    ],
    "--sf-component-space-1": "4px",
    "--sf-component-space-2": "8px",
    "--sf-component-space-3": "16px",
    "--sf-component-space-4": "24px",
  }
  let cursor = 0
  let nodes = 0
  let buttons = 0
  while (cursor < html.length) {
    if (html[cursor] !== "<") {
      cursor++
      continue
    }
    const match = /^<(\/?)([a-z][a-z0-9]*)([^<>]*?)(\/?)>/.exec(
      html.slice(cursor),
    )
    if (!match || !tags.has(match[2] ?? "") || ++nodes > 10_000)
      throw new Error("COMPONENT_PREVIEW_ELEMENT_REFUSED")
    const [, closing, tag = "", attributes = "", selfClosing] = match
    if (closing) {
      if (attributes.trim() || selfClosing || stack.pop() !== tag)
        throw new Error("COMPONENT_PREVIEW_STRUCTURE_REFUSED")
    } else {
      const parsed = new Map<string, string>()
      let remaining = attributes
      while (remaining.trim()) {
        const attribute = /^\s+([a-z][a-z0-9-]*)="([^"<>]*)"/.exec(remaining)
        if (!attribute) throw new Error("COMPONENT_PREVIEW_ATTRIBUTE_REFUSED")
        const name = attribute[1] ?? ""
        const value = attribute[2] ?? ""
        if (parsed.has(name))
          throw new Error("COMPONENT_PREVIEW_ATTRIBUTE_REFUSED")
        parsed.set(name, value)
        remaining = remaining.slice(attribute[0].length)
        if (["class", "id"].includes(name)) {
          if (!/^[A-Za-z0-9 _-]{0,500}$/.test(value))
            throw new Error("COMPONENT_PREVIEW_ATTRIBUTE_REFUSED")
        } else if (name === "style") {
          const seen = new Set<string>()
          for (const item of value.split(";").filter(Boolean)) {
            const index = item.indexOf(":")
            const key = item.slice(0, index)
            const setting = item.slice(index + 1)
            if (index < 0 || seen.has(key) || frameTokens[key] !== setting)
              throw new Error("COMPONENT_PREVIEW_STYLE_REFUSED")
            seen.add(key)
          }
        } else if (name === "type") {
          if (tag !== "button" || value !== "button")
            throw new Error("COMPONENT_PREVIEW_ATTRIBUTE_REFUSED")
        } else if (name === "disabled") {
          if (tag !== "button" || value !== "")
            throw new Error("COMPONENT_PREVIEW_ATTRIBUTE_REFUSED")
        } else if (name === "data-sf-action-index") {
          if (
            tag !== "button" ||
            !/^(0|[1-9][0-9]*)$/.test(value) ||
            !input.actions[Number(value)]
          )
            throw new Error("COMPONENT_PREVIEW_ACTION_REFUSED")
        } else if (name === "src") {
          if (
            tag !== "img" ||
            !Object.values(input.data.assets).some(
              (asset) => escaped(asset.url) === value,
            )
          )
            throw new Error("COMPONENT_PREVIEW_ASSET_REFUSED")
        } else if (name === "loading") {
          if (tag !== "img" || value !== "lazy")
            throw new Error("COMPONENT_PREVIEW_ATTRIBUTE_REFUSED")
        } else if (name === "alt") {
          if (tag !== "img" || value.length > 1000)
            throw new Error("COMPONENT_PREVIEW_ATTRIBUTE_REFUSED")
        } else if (
          ![
            "aria-label",
            "aria-labelledby",
            "aria-describedby",
            "aria-hidden",
            "role",
            "title",
          ].includes(name) ||
          value.length > 1000
        )
          throw new Error("COMPONENT_PREVIEW_ATTRIBUTE_REFUSED")
      }
      if (tag === "img" && !parsed.has("alt"))
        throw new Error("COMPONENT_PREVIEW_ACCESSIBILITY_REFUSED")
      if (tag === "button") {
        if (
          parsed.get("type") !== "button" ||
          parsed.get("aria-hidden") === "true"
        )
          throw new Error("COMPONENT_PREVIEW_ACCESSIBILITY_REFUSED")
        const tail =
          html.slice(cursor + match[0].length).split("</button>")[0] ?? ""
        const text = tail
          .replace(/<[^>]*>/g, "")
          .replace(/&(?:nbsp|#0*32|#x0*20);/gi, " ")
          .trim()
        if (!parsed.get("aria-label")?.trim() && !text)
          throw new Error("COMPONENT_PREVIEW_ACCESSIBILITY_REFUSED")
        buttons++
      }
      if (selfClosing && !voidTags.has(tag))
        throw new Error("COMPONENT_PREVIEW_STRUCTURE_REFUSED")
      if (!voidTags.has(tag)) stack.push(tag)
    }
    cursor += match[0].length
  }
  if (stack.length || nodes === 0)
    throw new Error("COMPONENT_PREVIEW_STRUCTURE_REFUSED")
  return { nodes, buttons, activeContent: false as const }
}

const previewCsp =
  "default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src 'self' data:; connect-src 'none'; form-action 'none'; base-uri 'none'"
function previewDocument(name: string, html: string, stylesheet: string) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="${escaped(previewCsp)}"><title>${escaped(name)} · synthetic component fixture</title><style>body{margin:0;background:#f8fafc;color:#111827}button{font:inherit} ${stylesheet}</style></head><body>${html}</body></html>`
}
function previewIndex() {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; frame-src 'self'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>Offline component review</title><style>body{font:16px system-ui;padding:24px}iframe{width:100%;height:420px;border:1px solid #cbd5e1}section{max-width:1100px;margin:24px auto}</style></head><body><h1>Offline synthetic component review</h1><p>Inert SSR qualification only. Source is unreviewed. No business action dispatch, hydration, registry entry or publication.</p>${fixtureNames.map((name) => `<section><h2>${name}</h2><iframe sandbox="" referrerpolicy="no-referrer" title="${name} synthetic component fixture" src="preview-${name}.html"></iframe></section>`).join("")}</body></html>`
}

/** One exclusive generation/build attempt; fixtures are existing synthetic public DTOs. */
export async function runComponentPipeline(
  options: { storeRoot: string } & z.input<
    typeof componentGenerationRequestSchema
  >,
  generator?: ComponentGenerator,
): Promise<ComponentPipelineResult> {
  const started = Date.now()
  let generationDurationMs = 0
  let buildDurationMs = 0
  const { storeRoot, ...value } = options
  const request = componentGenerationRequestSchema.parse(value)
  const contexts = fixtureNames.map((name) => ({ name, ...fixture(name) }))
  const prompt = componentGenerationPrompt(request, contexts)
  if (!beginComponentAttempt(storeRoot, request.attemptId, request, prompt)) {
    const result = readAttemptStatus(
      storeRoot,
      request.attemptId,
    ) as ComponentPipelineResult
    if (result.artifactId) verifyArtifact(storeRoot, result.artifactId)
    return { ...result, replayed: true }
  }
  const files: Record<string, string | Uint8Array> = {
    "input.json": JSON.stringify(request),
    "prompt.txt": prompt,
  }
  const diagnostics: ComponentDiagnostic[] = []
  let stage: Stage = "generation"
  let status: ComponentPipelineResult["status"] = "failed"
  let generationInvoked = false
  let generationReturned = false
  try {
    if (!generator) throw new Error("COMPONENT_GENERATOR_DISABLED")
    generationInvoked = true
    const generationStarted = Date.now()
    let result: Awaited<ReturnType<typeof invokeComponentGenerator>>
    try {
      result = await invokeComponentGenerator(generator, prompt)
    } finally {
      generationDurationMs = Date.now() - generationStarted
    }
    generationReturned = true
    if (typeof result.output !== "string")
      throw new Error("COMPONENT_GENERATOR_OUTPUT_INVALID")
    const raw = Buffer.from(result.output)
    files["output.raw.json"] = raw.subarray(0, GENERATION_LIMITS.outputBytes)
    files["generation.json"] = JSON.stringify({
      kind: generator.kind,
      promptVersion: COMPONENT_PROMPT_VERSION,
      generation: componentArtifactProvenanceSchema.shape.generation.parse(
        result.generation,
      ),
      fixtureLabel: z
        .string()
        .regex(/^[A-Za-z0-9_-]{1,128}$/)
        .nullable()
        .parse(result.fixtureLabel ?? null),
      rawOutputHash: artifactHash(raw),
      rawOutputBytes: raw.length,
      retainedOutputTruncated: raw.length > GENERATION_LIMITS.outputBytes,
    })
    if (
      (generator.kind === "offline-fixture" && result.generation !== null) ||
      (generator.kind === "provider" && result.generation === null)
    )
      throw new Error("COMPONENT_GENERATION_PROVENANCE_INVALID")
    if (raw.length > GENERATION_LIMITS.outputBytes)
      throw new Error("COMPONENT_GENERATION_OUTPUT_LIMIT")
    stage = "schema"
    const source = validateComponentSource(JSON.parse(result.output))
    if (source.manifest.key !== request.brief.componentKey)
      throw new Error("COMPONENT_GENERATED_KEY_MISMATCH")
    files["component.tsx"] = source.source
    files["styles.css"] = source.stylesheet
    files["manifest.json"] = JSON.stringify(source.manifest)
    const inputs = contexts.map((context) =>
      createComponentInput({
        manifest: source.manifest,
        settings: Object.fromEntries(
          source.manifest.section.fields.map((field) => [
            field.key,
            field.default,
          ]),
        ),
        data: {
          business: context.resources.business,
          catalog: context.resources.catalog.items,
          services: context.resources.catalog.items.filter(
            (item) => item.kind === "SERVICE",
          ),
        },
        theme: {},
        availableActions: context.capabilities.conversation.available
          ? [{ type: "openConversation" }]
          : [],
        approvedAssets: new Map(),
      }),
    )
    files["fixtures.json"] = JSON.stringify(
      fixtureNames.map((name, index) => ({ name, input: inputs[index] })),
    )
    stage = "build"
    const buildStarted = Date.now()
    let build: Awaited<ReturnType<typeof runIsolatedComponentBuild>>
    try {
      build = await runIsolatedComponentBuild(source, inputs)
    } finally {
      buildDurationMs = Date.now() - buildStarted
    }
    files["qualification.mjs"] = build.bundle
    files["build-receipt.json"] = JSON.stringify(build.receipt)
    files["dependency-lock.json"] = JSON.stringify(build.receipt.dependencies)
    files["provenance.json"] = JSON.stringify(
      componentArtifactProvenanceSchema.parse({
        kind: "storefront-component-artifact",
        artifactId: request.attemptId,
        sdkVersion: COMPONENT_SDK_VERSION,
        componentKey: source.manifest.key,
        componentVersion: source.manifest.version,
        sourceRevision: request.sourceRevision,
        inputHash: artifactHash(files["input.json"] ?? ""),
        sourceHash: build.receipt.sourceHash,
        stylesheetHash: build.receipt.stylesheetHash,
        manifestHash: build.receipt.manifestHash,
        dependencyLockHash: build.receipt.dependencyLockHash,
        sdkSourceHash: build.receipt.sdkSourceHash,
        buildRecipeHash: build.receipt.buildRecipeHash,
        compilerImage: build.receipt.image,
        compilerVersion: build.receipt.compilerVersion,
        generation: result.generation,
        createdAt: new Date().toISOString(),
      }),
    )
    stage = "preview"
    const previews = build.htmlFixtures.map((html, index) => {
      const input = inputs[index]
      if (!input) throw new Error("COMPONENT_PREVIEW_FIXTURE_MISMATCH")
      const validated = validateInertComponentHtml(html, input)
      files[`preview-${fixtureNames[index]}.html`] = previewDocument(
        fixtureNames[index] ?? "fixture",
        html,
        source.stylesheet,
      )
      return {
        name: fixtureNames[index],
        htmlHash: artifactHash(html),
        ...validated,
      }
    })
    files["preview.html"] = previewIndex()
    files["preview-validation.json"] = JSON.stringify({
      csp: previewCsp,
      sandbox: "no tokens",
      sourceHtmlIsUntrusted: true,
      privilegedDomInsertionAllowed: false,
      interactionDispatch: "not executed in inert SSR preview",
      previews,
    })
    status = "ready"
  } catch (error) {
    if (generationInvoked && !generationReturned) status = "outcome-unknown"
    diagnostics.push({
      stage,
      code:
        status === "outcome-unknown"
          ? "COMPONENT_GENERATION_OUTCOME_UNKNOWN"
          : safeCode(error),
      repairable: status !== "outcome-unknown" && stage !== "generation",
    })
  }
  files["diagnostics.json"] = JSON.stringify(diagnostics)
  files["pipeline-source-hashes.json"] = JSON.stringify(
    ["generation.ts", "artifacts.ts", "pipeline.ts"].map((name) => ({
      name,
      sha256: artifactHash(
        readFileSync(fileURLToPath(new URL(name, import.meta.url))),
      ),
    })),
  )
  files["receipt.json"] = JSON.stringify({
    kind: "storefront-component-pipeline",
    status,
    attemptId: request.attemptId,
    sourceRevision: request.sourceRevision,
    sdkVersion: COMPONENT_SDK_VERSION,
    inputHash: artifactHash(files["input.json"] ?? ""),
    promptHash: artifactHash(prompt),
    repairedFrom: request.repairedFrom ?? null,
    generatorKind: generator?.kind ?? "disabled",
    generatedSourceExecutedInHost: false,
    modelCallClaimed: generator?.kind === "provider" && generationInvoked,
    durations: {
      generationMs: generationDurationMs,
      buildMs: buildDurationMs,
      totalMs: Date.now() - started,
    },
    provenanceArtifactIdIsAttemptId: true,
    diagnostics,
    createdAt: new Date().toISOString(),
  })
  const saved = saveComponentArtifact(storeRoot, files)
  const response = {
    ...saved,
    status,
    attemptId: request.attemptId,
    diagnostics,
  }
  finishComponentAttempt(storeRoot, request.attemptId, response)
  return response
}
