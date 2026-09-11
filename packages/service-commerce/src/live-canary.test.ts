import { describe, expect, test } from "bun:test"

import {
  SERVICE_COMMERCE_LIVE_CANARY_KINDS,
  evaluateServiceCommerceLiveCanaryPreflight,
} from "./live-canary"

const configuredMetaEnvironment = Object.fromEntries(
  [
    "TRIGGER_PROJECT_ID",
    "TRIGGER_SECRET_KEY",
    "META_APP_ID",
    "META_APP_SECRET",
    "WHATSAPP_WEBHOOK_VERIFY_TOKEN",
    "COMMUNICATIONS_CREDENTIAL_ENCRYPTION_KEY",
    "REDIS_URL",
  ].map((key) => [key, "configured"]),
)

Object.assign(configuredMetaEnvironment, {
  APP_ENV: "production",
  DATABASE_PROFILE_VERIFIED: "true",
  EWATRADE_DATABASE_URL: "postgresql://user:password@database.example.com:5432/ewatrade",
})

const metaEvidence = {
  connectionReferencePresent: true,
  consentedTestRecipientPresent: true,
  neutralTemplateApprovalPresent: true,
  productionProfileConfirmed: true,
  storeReferencePresent: true,
  tenantReferencePresent: true,
}

describe("Service Commerce live-canary offline preflight", () => {
  test("allowlists only the bounded canary kinds", () => {
    expect(SERVICE_COMMERCE_LIVE_CANARY_KINDS).toEqual([
      "meta_whatsapp",
      "payment",
      "generic_media_safety",
      "pharmacy_media_ocr",
      "courier_manual",
    ])
    expect(
      evaluateServiceCommerceLiveCanaryPreflight({
        environment: {},
        kind: "customer-phone-should-not-be-echoed",
      }),
    ).toEqual({
      executionAuthorized: false,
      kind: null,
      missingEvidence: [],
      missingEnvironmentKeys: [],
      reasonCodes: ["UNSUPPORTED_CANARY_KIND"],
      status: "BLOCKED",
    })
  })

  test("reports Meta offline preflight readiness without authorizing execution", () => {
    expect(
      evaluateServiceCommerceLiveCanaryPreflight({
        environment: configuredMetaEnvironment,
        evidence: metaEvidence,
        kind: "meta_whatsapp",
      }),
    ).toEqual({
      executionAuthorized: false,
      kind: "meta_whatsapp",
      missingEvidence: [],
      missingEnvironmentKeys: [],
      reasonCodes: ["OFFLINE_PREFLIGHT_ONLY"],
      status: "READY",
    })
  })

  test("returns only missing key names and safe evidence labels", () => {
    const result = evaluateServiceCommerceLiveCanaryPreflight({
      environment: { APP_ENV: "production" },
      evidence: { productionProfileConfirmed: true },
      kind: "meta_whatsapp",
    })

    expect(result).toMatchObject({
      executionAuthorized: false,
      missingEvidence: [
        "tenant_reference",
        "store_reference",
        "connection_reference",
        "consented_test_recipient",
        "neutral_template_approval",
      ],
      missingEnvironmentKeys: [
        "DATABASE_PROFILE_VERIFIED",
        "EWATRADE_DATABASE_URL",
        "TRIGGER_PROJECT_ID",
        "TRIGGER_SECRET_KEY",
        "META_APP_ID",
        "META_APP_SECRET",
        "WHATSAPP_WEBHOOK_VERIFY_TOKEN",
        "COMMUNICATIONS_CREDENTIAL_ENCRYPTION_KEY",
        "REDIS_URL",
      ],
      status: "BLOCKED",
    })
    expect(result.reasonCodes).toEqual([
      "ENVIRONMENT_PREREQUISITES_MISSING",
      "EVIDENCE_PREREQUISITES_MISSING",
      "DATABASE_PROFILE_UNVERIFIED",
      "DATABASE_URL_INVALID_OR_LOCAL",
      "OFFLINE_PREFLIGHT_ONLY",
    ])
  })

  test("keeps unsupported payment, media, OCR, and courier canaries blocked", () => {
    for (const kind of [
      "payment",
      "generic_media_safety",
      "pharmacy_media_ocr",
      "courier_manual",
    ] as const) {
      const result = evaluateServiceCommerceLiveCanaryPreflight({
        environment: {
          APP_ENV: "production",
          DATABASE_PROFILE_VERIFIED: "1",
          EWATRADE_DATABASE_URL: "postgresql://database.example.com/ewatrade",
          PAYSTACK_SECRET_KEY: "configured",
          PRESCRIPTION_DATA_ENCRYPTION_KEY: "configured",
          PRESCRIPTION_MEDIA_SAFETY_PROVIDER: "configured",
          PRESCRIPTION_OCR_PROVIDER: "configured",
        },
        evidence: {
          deliverySopApprovalReferencePresent: true,
          pharmacyApprovalReferencePresent: true,
          productionProfileConfirmed: true,
          storeReferencePresent: true,
          tenantReferencePresent: true,
        },
        kind,
      })

      expect(result.executionAuthorized).toBe(false)
      expect(result.status).toBe("BLOCKED")
      expect(result.reasonCodes).toContain("OFFLINE_PREFLIGHT_ONLY")
      expect(
        result.reasonCodes.some((code) => code.endsWith("ADAPTER_UNSUPPORTED")),
      ).toBe(true)
    }
  })

  test("requires a Pharmacy approval reference without treating it as approval", () => {
    const result = evaluateServiceCommerceLiveCanaryPreflight({
      environment: {},
      evidence: {
        productionProfileConfirmed: true,
        storeReferencePresent: true,
        tenantReferencePresent: true,
      },
      kind: "pharmacy_media_ocr",
    })

    expect(result.missingEvidence).toContain("pharmacy_approval_reference")
    expect(result.executionAuthorized).toBe(false)
    expect(result.status).toBe("BLOCKED")
  })

  test("blocks empty secrets, non-production profiles, and unsafe database URLs without exposing values", () => {
    const secret = "never-print-this-secret"
    const result = evaluateServiceCommerceLiveCanaryPreflight({
      environment: {
        APP_ENV: "development",
        COMMUNICATIONS_CREDENTIAL_ENCRYPTION_KEY: "",
        DATABASE_PROFILE_VERIFIED: "0",
        EWATRADE_DATABASE_URL: "postgresql://user:password@localhost:5432/ewatrade",
        META_APP_ID: "configured",
        META_APP_SECRET: secret,
        REDIS_URL: "configured",
        TRIGGER_PROJECT_ID: "configured",
        TRIGGER_SECRET_KEY: "configured",
        WHATSAPP_WEBHOOK_VERIFY_TOKEN: "configured",
      },
      evidence: metaEvidence,
      kind: "meta_whatsapp",
    })

    expect(result).toMatchObject({
      executionAuthorized: false,
      missingEnvironmentKeys: ["COMMUNICATIONS_CREDENTIAL_ENCRYPTION_KEY"],
      status: "BLOCKED",
    })
    expect(result.reasonCodes).toEqual(
      expect.arrayContaining([
        "APP_ENV_NOT_PRODUCTION",
        "DATABASE_PROFILE_UNVERIFIED",
        "DATABASE_URL_INVALID_OR_LOCAL",
      ]),
    )
    expect(JSON.stringify(result)).not.toContain(secret)
  })

  test("requires exact production and database-profile values", () => {
    const result = evaluateServiceCommerceLiveCanaryPreflight({
      environment: {
        ...configuredMetaEnvironment,
        APP_ENV: "PRODUCTION",
        DATABASE_PROFILE_VERIFIED: " true ",
      },
      evidence: metaEvidence,
      kind: "meta_whatsapp",
    })

    expect(result.status).toBe("BLOCKED")
    expect(result.reasonCodes).toEqual(
      expect.arrayContaining([
        "APP_ENV_NOT_PRODUCTION",
        "DATABASE_PROFILE_UNVERIFIED",
      ]),
    )
  })

  test("requires a hosted PostgreSQL database target", () => {
    for (const databaseUrl of [
      "https://database.example.com/ewatrade",
      "postgresql://postgres:5432/ewatrade",
      "postgresql://127.1.2.3:5432/ewatrade",
      "postgresql://[::1]:5432/ewatrade",
    ]) {
      const result = evaluateServiceCommerceLiveCanaryPreflight({
        environment: {
          ...configuredMetaEnvironment,
          EWATRADE_DATABASE_URL: databaseUrl,
        },
        evidence: metaEvidence,
        kind: "meta_whatsapp",
      })

      expect(result.status).toBe("BLOCKED")
      expect(result.reasonCodes).toContain("DATABASE_URL_INVALID_OR_LOCAL")
    }
  })
})
