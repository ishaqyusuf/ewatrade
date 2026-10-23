/** Offline review export only: never reads environment values or calls a provider/database. */
import { createHash } from "node:crypto"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
import {
  whatsAppFlowDefinitions,
  whatsAppFlowFirstScreen,
  whatsAppFlowRequiredOptions,
} from "../packages/assistant/src/channels/flows/definitions"

const root = fileURLToPath(new URL("../", import.meta.url))
const kinds = [
  "registration",
  "sale",
  "customer",
  "product",
  "expense",
  "stock_receive",
] as const
const sourcePaths = [
  "packages/assistant/src/channels/flows/definitions.ts",
  "packages/assistant/src/channels/flows/contracts.ts",
  "scripts/whatsapp-flow-review-bundle.ts",
]
const hash = (value: string | Uint8Array) =>
  createHash("sha256").update(value).digest("hex")
const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`
function ensure(condition: unknown, message: string): asserts condition {
  if (!condition) throw Error(message)
}
function object(value: unknown): Record<string, unknown> {
  ensure(
    value !== null && typeof value === "object" && !Array.isArray(value),
    "Expected object",
  )
  return Object.fromEntries(Object.entries(value))
}
function components(value: unknown): Record<string, unknown>[] {
  ensure(Array.isArray(value), "Expected component array")
  return value.flatMap((item) => {
    const component = object(item)
    return [
      component,
      ...["children", "then", "else"].flatMap((key) =>
        Array.isArray(component[key]) ? components(component[key]) : [],
      ),
    ]
  })
}
const fields = new Set(["TextInput", "Dropdown", "DatePicker", "OptIn"])
const supportedComponents = new Set([
  "Form",
  "TextBody",
  "TextSubheading",
  "TextCaption",
  "Footer",
  "If",
  ...fields,
])

function validate(kind: (typeof kinds)[number]) {
  const definition = whatsAppFlowDefinitions[kind]
  const screens = definition.screens
  ensure(screens.length > 0, `${kind}: no screens`)
  ensure(
    screens[0]?.id === whatsAppFlowFirstScreen[kind],
    `${kind}: start screen mismatch`,
  )
  ensure(
    new Set(screens.map((screen) => screen.id)).size === screens.length,
    `${kind}: repeated screen`,
  )
  const seenFields = new Set<string>()
  let completions = 0
  for (const [index, screen] of screens.entries()) {
    const data = object(screen.data)
    const list = components(screen.layout.children)
    const currentFields = new Set<string>()
    for (const component of list) {
      ensure(
        typeof component.type === "string" &&
          supportedComponents.has(component.type),
        `${kind}/${screen.id}: unexpected component`,
      )
      if (fields.has(component.type)) {
        ensure(
          typeof component.name === "string" && !seenFields.has(component.name),
          `${kind}/${screen.id}: duplicate field`,
        )
        seenFields.add(component.name)
        currentFields.add(component.name)
      }
    }
    for (const match of json(screen).matchAll(
      /\$\{(data|form)\.([A-Za-z0-9_]+)\}/g,
    )) {
      ensure(
        match[1] === "data"
          ? Object.hasOwn(data, match[2] ?? "")
          : currentFields.has(match[2] ?? ""),
        `${kind}/${screen.id}: unresolved ${match[0]}`,
      )
    }
    const footer = list.filter((component) => component.type === "Footer")
    ensure(footer.length === 1, `${kind}/${screen.id}: expected one Footer`)
    const action = object(footer[0]?.["on-click-action"])
    const payload = object(action.payload)
    const terminal = index === screens.length - 1
    if (terminal) {
      completions++
      ensure(
        screen.terminal === true &&
          screen.success === true &&
          action.name === "complete",
        `${kind}: expected final completion`,
      )
      ensure(
        payload.form_kind === kind && payload.form_version === "1",
        `${kind}: completion envelope mismatch`,
      )
      ensure(
        Object.keys(payload).sort().join() ===
          [...seenFields, "form_kind", "form_version"].sort().join(),
        `${kind}: completion field mismatch`,
      )
    } else {
      ensure(
        !screen.terminal && action.name === "navigate",
        `${kind}/${screen.id}: expected static navigation`,
      )
      const next = object(action.next)
      ensure(
        next.type === "screen" && next.name === screens[index + 1]?.id,
        `${kind}: broken screen transition`,
      )
      ensure(
        Object.keys(payload).sort().join() ===
          Object.keys(screens[index + 1]?.data ?? {})
            .sort()
            .join(),
        `${kind}: next-screen data mismatch`,
      )
      const nextData = object(screens[index + 1]?.data)
      for (const [key, expression] of Object.entries(payload)) {
        ensure(
          typeof expression === "string",
          `${kind}: expected data reference`,
        )
        const match = /^\$\{(form|data)\.([A-Za-z0-9_]+)\}$/.exec(expression)
        ensure(match, `${kind}: expected exact navigation reference`)
        const sourceField = list.find(
          (component) => component.name === match[2],
        )
        const sourceType =
          match[1] === "data"
            ? object(data[match[2] ?? ""]).type
            : sourceField?.type === "OptIn"
              ? "boolean"
              : sourceField?.["input-type"] === "number"
                ? "number"
                : "string"
        ensure(
          object(nextData[key]).type === sourceType,
          `${kind}/${screen.id}: ${key} navigation value type mismatch`,
        )
      }
    }
  }
  ensure(completions === 1, `${kind}: expected one terminal completion`)
  ensure(
    !/"(?:flow_id|access_token|data_exchange|data_api_version|routing_model)"/.test(
      json(definition),
    ),
    `${kind}: not an offline static Flow`,
  )
  const dynamicOptions = Object.entries(object(screens[0]?.data))
    .filter(([, value]) => object(value).type === "array")
    .map(([name]) => ({
      name,
      required: whatsAppFlowRequiredOptions[kind].includes(name),
    }))
  for (const name of whatsAppFlowRequiredOptions[kind])
    ensure(
      dynamicOptions.some((option) => option.name === name),
      `${kind}: missing required launch options`,
    )
  return { definition, dynamicOptions, completionFields: [...seenFields] }
}

async function main() {
  const args = process.argv.slice(2)
  const check = args.includes("--check")
  const outAt = args.indexOf("--out")
  ensure(
    args.every(
      (arg, index) =>
        arg === "--check" ||
        arg === "--out" ||
        (outAt >= 0 && index === outAt + 1),
    ),
    "Use [--out path] [--check]",
  )
  ensure(
    outAt < 0 || Boolean(args[outAt + 1] && !args[outAt + 1]?.startsWith("--")),
    "Missing output path",
  )
  const output = resolve(
    root,
    outAt < 0
      ? ".scratch/whatsapp-flow-acceptance-20261021"
      : (args[outAt + 1] ?? ""),
  )
  const assets = new Map<string, string>()
  const flows = kinds.map((kind) => {
    const result = validate(kind)
    const file = `${kind}.json`
    const bytes = json(result.definition)
    assets.set(file, bytes)
    return {
      kind,
      file,
      sha256: hash(bytes),
      flowJsonVersion: result.definition.version,
      formVersion: "1",
      startScreen: whatsAppFlowFirstScreen[kind],
      screens: result.definition.screens.map((screen) => screen.id),
      optionalConfigurationName: `ASSISTANT_WHATSAPP_FLOW_${kind.toUpperCase()}_ID`,
      launchOptions: result.dynamicOptions,
      completionFields: result.completionFields,
      reviewBoundary:
        kind === "registration"
          ? "email_proof_then_connection_consent"
          : kind === "stock_receive"
            ? "authenticated_app_review"
            : "canonical_draft_then_explicit_confirmation",
    }
  })
  const sourceFiles = await Promise.all(
    sourcePaths.map(async (path) => ({
      path,
      sha256: hash(await readFile(resolve(root, path))),
    })),
  )
  assets.set(
    "manifest.json",
    json({
      version: "whatsapp-flow-offline-review-v1",
      localStructuralChecks: "passed",
      metaValidation: "pending",
      nativeClientAcceptance: "pending",
      mode: "static_navigate_complete",
      returnTransport: "existing_signature_verified_whatsapp_webhook",
      dataExchangeEndpointRequiredByThisSource: false,
      sourceFiles,
      flows,
      remainingAcceptance: [
        "Meta upload/schema validation of these exact hashes",
        "Authorised Flow publication and per-kind ID mapping",
        "Native-client rendering, required/optional inputs, exact amount review, close/reopen and completion delivery",
        "Current identity/scope, durable worker and canonical effect acceptance on an explicitly authorised isolated target",
      ],
      noDeploymentOrProviderConfigurationPerformed: true,
    }),
  )
  if (!check) await mkdir(output, { recursive: true })
  for (const [file, bytes] of assets) {
    if (check)
      ensure(
        (await readFile(resolve(output, file), "utf8")) === bytes,
        `Stale bundle: ${file}`,
      )
    else await writeFile(resolve(output, file), bytes)
  }
  console.log(
    json({
      status: "passed",
      mode: check ? "verify_existing" : "export",
      output,
      flows: flows.length,
      assets: assets.size,
      metaValidation: "pending",
      nativeClientAcceptance: "pending",
    }),
  )
}

main().catch((error: unknown) => {
  console.error(
    error instanceof Error ? error.message : "Offline export failed",
  )
  process.exitCode = 1
})
