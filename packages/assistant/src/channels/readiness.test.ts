import { expect, test } from "bun:test"
import { capabilityManifest } from "../capabilities/manifest"
import {
  WHATSAPP_EXTERNAL_EVIDENCE_MAX_AGE_MS,
  assistantWhatsAppReadiness,
  whatsAppReleaseEvidenceGates,
} from "./readiness"

const now = new Date("2026-10-15T12:00:00.000Z")
const sourceFingerprint = "a".repeat(64)
const environment = {
  APP_ENV: "local",
  NODE_ENV: "test",
  ASSISTANT_WHATSAPP_ENABLED: "true",
  ASSISTANT_WHATSAPP_READS_ENABLED: "true",
  ASSISTANT_WHATSAPP_WRITES_ENABLED: "true",
  WHATSAPP_OTP_PHONE_NUMBER_ID: "90000000000001",
  WHATSAPP_OTP_ACCESS_TOKEN: "private-provider-token",
  ASSISTANT_WHATSAPP_DISPLAY_NUMBER: "2348000000000",
  META_APP_SECRET: "private-meta-secret",
  WHATSAPP_WEBHOOK_VERIFY_TOKEN: "private-webhook-token",
  INTERNAL_API_KEY: "private-internal-key",
  API_URL: "https://private-api.example.test",
  DASHBOARD_URL: "https://private-dashboard.example.test",
  ASSISTANT_APPROVAL_SIGNING_KEY: "private-approval-signing-key-0000000000",
  ASSISTANT_WHATSAPP_PILOT_USER_IDS:
    "private-user-one,private-user-one,private-user-two",
  ASSISTANT_WHATSAPP_PILOT_TENANT_IDS:
    "private-tenant-one,private-tenant-one,private-tenant-two",
}
const evaluate = (
  extra: Partial<Parameters<typeof assistantWhatsAppReadiness>[0]> = {},
) =>
  assistantWhatsAppReadiness({
    environment,
    capabilities: capabilityManifest,
    sourceFingerprint,
    now,
    ...extra,
  })
const evidence = {
  version: 1,
  environment: "local",
  sourceFingerprint,
  checkedAt: now.toISOString(),
  gates: Object.fromEntries(
    whatsAppReleaseEvidenceGates.map((gate) => [gate, "verified"]),
  ),
}

test("default off and shared OTP configuration never imply an enabled or available assistant", () => {
  const empty = evaluate({ environment: {} })
  expect(empty.configuration.status).toBe("disabled")
  expect(empty.flags).toEqual({
    channel: false,
    reads: false,
    writes: false,
    media: false,
    setup: false,
    product: false,
    workflowNativeWrites: false,
    localSource: false,
  })
  const otpOnly = evaluate({
    environment: {
      ...environment,
      ASSISTANT_WHATSAPP_ENABLED: "false",
      WHATSAPP_OTP_ENABLED: "true",
    },
  })
  expect(otpOnly.configuration.status).toBe("disabled")
  expect(otpOnly.provider.availability).toBe("not_probed")
  expect(otpOnly.externalEvidence.complete).toBe(false)
  expect(otpOnly.release.activationPermitted).toBe(false)
})

test("logical readiness reports presence and counts without phone, token, URL, pilot identity or approval disclosure", () => {
  const report = evaluate()
  expect(report.configuration.status).toBe("configured")
  expect(report.configuration.pilotCount).toBe(2)
  expect(report.configuration.pilotTenantCount).toBe(2)
  expect(report.configuration.checks.pilotTenantEnrollment).toBe(true)
  expect(report.capabilities.nativeEnabled).toBeGreaterThan(0)
  expect(report.externalEvidence.complete).toBe(false)
  const serialized = JSON.stringify(report)
  for (const privateValue of [
    environment.WHATSAPP_OTP_PHONE_NUMBER_ID,
    environment.WHATSAPP_OTP_ACCESS_TOKEN,
    environment.ASSISTANT_WHATSAPP_DISPLAY_NUMBER,
    environment.META_APP_SECRET,
    environment.WHATSAPP_WEBHOOK_VERIFY_TOKEN,
    environment.INTERNAL_API_KEY,
    environment.API_URL,
    environment.DASHBOARD_URL,
    environment.ASSISTANT_APPROVAL_SIGNING_KEY,
    "private-user-one",
    "private-user-two",
    "private-tenant-one",
    "private-tenant-two",
    sourceFingerprint,
  ])
    expect(serialized.includes(privateValue)).toBe(false)
})

test("incomplete, malformed and nonlocal source-workflow configurations fail the logical configuration gate", () => {
  for (const changed of [
    { WHATSAPP_OTP_ACCESS_TOKEN: "" },
    { META_APP_SECRET: "" },
    { INTERNAL_API_KEY: "" },
    {
      API_URL:
        "https://private-user:private-password@api.example.test?secret=1",
    },
    { DASHBOARD_URL: "https://dash.example.test/path?token=private" },
    { ASSISTANT_WHATSAPP_ENABLED: "TRUE" },
    { ASSISTANT_WHATSAPP_PILOT_TENANT_IDS: "" },
    { APP_ENV: "production", ASSISTANT_WHATSAPP_SETUP_ENABLED: "true" },
  ])
    expect(
      evaluate({ environment: { ...environment, ...changed } }).configuration
        .status,
    ).toBe("invalid")
  expect(
    evaluate({ environment: { ...environment, APP_ENV: "production" } })
      .capabilities.nativeEnabled,
  ).toBe(0)
})

test("a configured sender and user pilot cannot replace explicit Tenant enrollment", () => {
  for (const enrollment of [undefined, "", " , ", "x".repeat(129)]) {
    const report = evaluate({
      environment: {
        ...environment,
        ASSISTANT_WHATSAPP_PILOT_TENANT_IDS: enrollment,
      },
    })
    expect(report.configuration.status).toBe("invalid")
    expect(report.configuration.pilotCount).toBe(2)
    expect(report.configuration.pilotTenantCount).toBe(0)
    expect(report.configuration.checks.pilotTenantEnrollment).toBe(false)
    expect(report.release.activationPermitted).toBe(false)
  }
})

test("external evidence is source-, target- and time-bound and never becomes provider or release authority", () => {
  const recorded = evaluate({ evidence })
  expect(recorded.externalEvidence.complete).toBe(true)
  expect(recorded.provider).toEqual({
    availability: "not_probed",
    monetaryCost: "not_verified",
  })
  expect(recorded.release).toEqual({
    authorization: "none",
    activationPermitted: false,
    deploymentVerified: false,
  })
  for (const changed of [
    { sourceFingerprint: "b".repeat(64) },
    { environment: "production" },
    { checkedAt: new Date(now.getTime() + 1).toISOString() },
    {
      checkedAt: new Date(
        now.getTime() - WHATSAPP_EXTERNAL_EVIDENCE_MAX_AGE_MS - 1,
      ).toISOString(),
    },
    { gates: { ...evidence.gates, target_release_approval: "blocked" } },
    { approvalToken: "not-an-evidence-field" },
  ])
    expect(
      evaluate({ evidence: { ...evidence, ...changed } }).externalEvidence
        .complete,
    ).toBe(false)
})

test("native workflow write toggle is validated, visible and restricted to local source", () => {
  const configured = evaluate({
    environment: {
      ...environment,
      ASSISTANT_WHATSAPP_WORKFLOW_WRITES_ENABLED: "true",
    },
  })
  expect(configured.configuration.status).toBe("configured")
  expect(configured.flags.workflowNativeWrites).toBe(true)
  expect(configured.configuration.checks.sourceWorkflowScope).toBe(true)
  expect(configured.release.activationPermitted).toBe(false)
  const invalid = evaluate({
    environment: {
      ...environment,
      ASSISTANT_WHATSAPP_WORKFLOW_WRITES_ENABLED: "TRUE",
    },
  })
  expect(invalid.configuration.status).toBe("invalid")
  expect(invalid.configuration.invalidToggleCount).toBe(1)
  expect(invalid.flags.workflowNativeWrites).toBe(false)
  for (const appEnvironment of ["dev", "preview", "production"]) {
    const hosted = evaluate({
      environment: {
        ...environment,
        APP_ENV: appEnvironment,
        ASSISTANT_WHATSAPP_WORKFLOW_WRITES_ENABLED: "true",
      },
    })
    expect(hosted.configuration.status).toBe("invalid")
    expect(hosted.configuration.checks.sourceWorkflowScope).toBe(false)
    expect(hosted.flags.workflowNativeWrites).toBe(false)
  }
})
