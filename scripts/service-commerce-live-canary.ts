#!/usr/bin/env bun

import {
  SERVICE_COMMERCE_LIVE_CANARY_KINDS,
  evaluateServiceCommerceLiveCanaryPreflight,
} from "../packages/service-commerce/src/live-canary"

type CliEvidence = {
  connectionReferencePresent?: boolean
  consentedTestRecipientPresent?: boolean
  deliverySopApprovalReferencePresent?: boolean
  neutralTemplateApprovalPresent?: boolean
  pharmacyApprovalReferencePresent?: boolean
  productionProfileConfirmed?: boolean
  storeReferencePresent?: boolean
  tenantReferencePresent?: boolean
}

type CliOptions = {
  evidence: CliEvidence
  kind: string | null
}

const EVIDENCE_FLAGS: Record<string, keyof CliEvidence> = {
  "--connection-reference-present": "connectionReferencePresent",
  "--consented-test-recipient-present": "consentedTestRecipientPresent",
  "--delivery-sop-approval-reference-present":
    "deliverySopApprovalReferencePresent",
  "--neutral-template-approval-present": "neutralTemplateApprovalPresent",
  "--pharmacy-approval-reference-present": "pharmacyApprovalReferencePresent",
  "--production-profile-confirmed": "productionProfileConfirmed",
  "--store-reference-present": "storeReferencePresent",
  "--tenant-reference-present": "tenantReferencePresent",
}

export function parseServiceCommerceLiveCanaryArgs(argv: string[]): CliOptions {
  const evidence: CliEvidence = {}
  let kind: string | null = null

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    const evidenceKey = EVIDENCE_FLAGS[argument]
    if (evidenceKey) {
      evidence[evidenceKey] = true
      continue
    }
    if (argument === "--kind") {
      const next = argv[index + 1]
      if (!next || next.startsWith("--")) {
        throw new Error("Missing canary kind.")
      }
      kind = next
      index += 1
      continue
    }
    throw new Error("Unsupported live-canary option.")
  }

  return { evidence, kind }
}

export function runServiceCommerceLiveCanaryPreflight(
  argv: string[],
  environment: Readonly<Record<string, string | undefined>>,
) {
  const options = parseServiceCommerceLiveCanaryArgs(argv)
  return evaluateServiceCommerceLiveCanaryPreflight({
    evidence: options.evidence,
    environment,
    kind: options.kind,
  })
}

function usage() {
  return [
    "Usage: bun scripts/service-commerce-live-canary.ts --kind <kind> [presence flags]",
    `Kinds: ${SERVICE_COMMERCE_LIVE_CANARY_KINDS.join(", ")}`,
    "This command is offline-only and never authorizes execution.",
  ].join("\n")
}

if (import.meta.main) {
  try {
    const result = runServiceCommerceLiveCanaryPreflight(
      Bun.argv.slice(2),
      Bun.env,
    )
    console.log(JSON.stringify(result))
    process.exit(result.status === "READY" ? 0 : 1)
  } catch {
    console.error(usage())
    process.exit(1)
  }
}
