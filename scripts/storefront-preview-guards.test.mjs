import { expect, test } from "bun:test"
import {
  STOREFRONT_PREVIEW,
  assertStorefrontPreviewAlias,
  assertStorefrontPreviewDeployment,
  assertStorefrontPreviewMode,
  assertStorefrontPreviewProjectLink,
  assertStorefrontPreviewSmoke,
  assertStorefrontPreviewUrl,
} from "./storefront-preview-guards.mjs"

const inspected = {
  id: "dpl_Example123",
  name: STOREFRONT_PREVIEW.projectName,
  projectId: STOREFRONT_PREVIEW.projectId,
  target: "preview",
  readyState: "READY",
}

test("requires the exact isolated project link and Preview deployment", () => {
  expect(() =>
    assertStorefrontPreviewProjectLink({
      projectId: STOREFRONT_PREVIEW.projectId,
      orgId: STOREFRONT_PREVIEW.orgId,
      projectName: STOREFRONT_PREVIEW.projectName,
    }),
  ).not.toThrow()
  expect(() =>
    assertStorefrontPreviewProjectLink({
      projectId: "production-project",
      orgId: STOREFRONT_PREVIEW.orgId,
      projectName: STOREFRONT_PREVIEW.projectName,
    }),
  ).toThrow("STOREFRONT_PREVIEW_PROJECT_LINK_MISMATCH")
  expect(assertStorefrontPreviewDeployment(inspected)).toBe("dpl_Example123")
  for (const mutation of [
    { target: "production" },
    { readyState: "BUILDING" },
    { projectId: "production-project" },
    { name: "ewatrade-storefront" },
  ]) {
    expect(() =>
      assertStorefrontPreviewDeployment({ ...inspected, ...mutation }),
    ).toThrow("STOREFRONT_PREVIEW_DEPLOYMENT_MISMATCH")
  }
})

test("rejects the stable alias or another host as a new deployment URL", () => {
  expect(
    assertStorefrontPreviewUrl(
      "https://ewatrade-storefront-preview-abc123-ishaqyusufs-projects.vercel.app",
    ),
  ).toContain("abc123")
  for (const url of [
    `https://${STOREFRONT_PREVIEW.alias}`,
    "https://chat.ewatrade.com",
    "https://ewatrade-api-preview-abc-ishaqyusufs-projects.vercel.app",
  ]) {
    expect(() => assertStorefrontPreviewUrl(url)).toThrow(
      "STOREFRONT_PREVIEW_DEPLOYMENT_URL_INVALID",
    )
  }
  expect(() =>
    assertStorefrontPreviewAlias(
      { ...inspected, id: "dpl_Other" },
      inspected.id,
    ),
  ).toThrow("STOREFRONT_PREVIEW_ALIAS_MISMATCH")
})

test("requires Customer Chat and closed legal, invalid-token, app-link gates", () => {
  const safe = {
    rootResponse:
      "HTTP/2 200\r\nx-tenant-surface: customer-chat\r\n\r\n<!doctype html>",
    legal: { effective: false, signupAvailable: false },
    invalidTokenResponse:
      "HTTP/2 404\r\ncache-control: no-store\r\n\r\nNot Found",
    associationResponse: "HTTP/2 503\r\n\r\nUnavailable",
    androidAssociationResponse: `HTTP/2 200\r\ncontent-type: application/json\r\n\r\n${JSON.stringify([
      {
        relation: ["delegate_permission/common.handle_all_urls"],
        target: {
          namespace: "android_app",
          package_name: STOREFRONT_PREVIEW.androidPackageName,
          sha256_cert_fingerprints: [
            STOREFRONT_PREVIEW.androidCertificateSha256,
          ],
        },
      },
    ])}`,
  }
  expect(() => assertStorefrontPreviewSmoke(safe)).not.toThrow()
  expect(() =>
    assertStorefrontPreviewSmoke({
      ...safe,
      expectedSurface: "storefront",
      rootResponse: safe.rootResponse.replace("customer-chat", "storefront"),
    }),
  ).not.toThrow()
  expect(() =>
    assertStorefrontPreviewSmoke({ ...safe, legal: { effective: true } }),
  ).toThrow("STOREFRONT_PREVIEW_LEGAL_GATE_MISMATCH")
  expect(() =>
    assertStorefrontPreviewSmoke({
      ...safe,
      rootResponse: safe.rootResponse.replace("customer-chat", "storefront"),
    }),
  ).toThrow("STOREFRONT_PREVIEW_SURFACE_MISMATCH")
  expect(() =>
    assertStorefrontPreviewSmoke({
      ...safe,
      invalidTokenResponse: "HTTP/2 200\r\n\r\n",
    }),
  ).toThrow("STOREFRONT_PREVIEW_INVALID_TOKEN_MISMATCH")
  for (const androidAssociationResponse of [
    safe.androidAssociationResponse.replace("HTTP/2 200", "HTTP/2 503"),
    safe.androidAssociationResponse.replace(
      STOREFRONT_PREVIEW.androidPackageName,
      "com.ewatrade.app",
    ),
    safe.androidAssociationResponse.replace(
      STOREFRONT_PREVIEW.androidCertificateSha256,
      "AB:".repeat(31) + "AB",
    ),
  ]) {
    expect(() =>
      assertStorefrontPreviewSmoke({ ...safe, androidAssociationResponse }),
    ).toThrow("STOREFRONT_PREVIEW_ANDROID_ASSOCIATION_MISMATCH")
  }
})

test("CLI refuses implicit or Production operations before running commands", () => {
  expect(() => assertStorefrontPreviewMode([], {})).toThrow(
    "Choose one explicit Storefront Preview mode",
  )
  expect(() => assertStorefrontPreviewMode(["--prod"], {})).toThrow(
    "Choose one explicit Storefront Preview mode",
  )
  expect(() =>
    assertStorefrontPreviewMode(["--prepare-only"], {
      VERCEL_ENV: "production",
    }),
  ).toThrow("Production environment selected; Preview operation stopped")
  expect(assertStorefrontPreviewMode(["--prepare-only"], {})).toBe(
    "--prepare-only",
  )
})
