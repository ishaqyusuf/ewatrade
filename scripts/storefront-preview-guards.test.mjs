import { expect, test } from "bun:test"
import {
  STOREFRONT_PREVIEW,
  assertStorefrontPreviewAlias,
  assertStorefrontPreviewAsset,
  assertStorefrontPreviewDeployment,
  assertStorefrontPreviewMode,
  assertStorefrontPreviewProjectLink,
  assertStorefrontPreviewSmoke,
  assertStorefrontPreviewSource,
  assertStorefrontPreviewUrl,
  storefrontPreviewAssetPath,
} from "./storefront-preview-guards.mjs"

const inspected = {
  id: "dpl_Example123",
  name: STOREFRONT_PREVIEW.projectName,
  projectId: STOREFRONT_PREVIEW.projectId,
  target: "preview",
  readyState: "READY",
}

test("alias promotion binds a clean committed source and exact owned deployment", () => {
  const revision = "a".repeat(40)
  const source = {
    expectedRevision: revision,
    head: `${revision}\n`,
    dirty: "",
  }
  expect(assertStorefrontPreviewSource(source)).toBe(revision)
  for (const mutation of [
    { expectedRevision: undefined },
    { expectedRevision: "a".repeat(12) },
    { head: "b".repeat(40) },
    { dirty: "?? unrelated-file.txt\n" },
  ]) {
    expect(() =>
      assertStorefrontPreviewSource({ ...source, ...mutation }),
    ).toThrow()
  }
  const deployment = { ...inspected, meta: { githubCommitSha: revision } }
  expect(() =>
    assertStorefrontPreviewAlias(deployment, inspected.id, revision),
  ).not.toThrow()
  for (const mutation of [
    { meta: undefined },
    { meta: { githubCommitSha: "b".repeat(40) } },
  ]) {
    expect(() =>
      assertStorefrontPreviewAlias(
        { ...deployment, ...mutation },
        inspected.id,
        revision,
      ),
    ).toThrow("STOREFRONT_PREVIEW_DEPLOYMENT_SOURCE_MISMATCH")
  }
  expect(() => assertStorefrontPreviewDeployment(inspected)).not.toThrow()
  expect(() => assertStorefrontPreviewDeployment(deployment, null)).toThrow(
    "STOREFRONT_PREVIEW_DEPLOYMENT_SOURCE_MISMATCH",
  )
})

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

test("requires the source-matched legal policy, surface and invalid-token/app-link gates", () => {
  const safe = {
    rootResponse:
      "HTTP/2 200\r\nx-tenant-surface: customer-chat\r\n\r\n<!doctype html>",
    legal: { effective: false, signupAvailable: false },
    invalidTokenResponse:
      "HTTP/2 404\r\ncache-control: no-store\r\n\r\nNot Found",
    associationResponse: "HTTP/2 503\r\n\r\nUnavailable",
    androidAssociationResponse: `HTTP/2 200\r\ncontent-type: application/json\r\n\r\n${JSON.stringify(
      [
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
      ],
    )}`,
  }
  expect(() => assertStorefrontPreviewSmoke(safe)).not.toThrow()
  const factory = {
    ...safe,
    legal: {
      effective: true,
      signupAvailable: true,
      version: "2026-10-15-adult-chat-1",
      effectiveDate: "2026-10-15",
    },
    rootMode: "factory-unavailable",
    rootResponse:
      'HTTP/2 404\r\nx-tenant-surface: customer-chat\r\ncache-control: private, no-store\r\n\r\n<link href="/_next/static/chunks/example.css"><h1>This shop isn’t available</h1>',
  }
  expect(() => assertStorefrontPreviewSmoke(factory)).not.toThrow()
  for (const legal of [
    safe.legal,
    { ...factory.legal, version: "unapproved" },
    { ...factory.legal, effectiveDate: "2026-10-16" },
    { ...factory.legal, signupAvailable: false },
  ]) {
    expect(() => assertStorefrontPreviewSmoke({ ...factory, legal })).toThrow(
      "STOREFRONT_PREVIEW_LEGAL_GATE_MISMATCH",
    )
  }
  expect(() =>
    assertStorefrontPreviewSmoke({
      ...factory,
      expectedSurface: "storefront",
      rootResponse: factory.rootResponse.replace("customer-chat", "storefront"),
    }),
  ).not.toThrow()
  for (const rootResponse of [
    factory.rootResponse.replace("HTTP/2 404", "HTTP/2 200"),
    factory.rootResponse.replace("private, no-store", "public, max-age=300"),
    factory.rootResponse.replace(
      "This shop isn’t available",
      "Internal server error",
    ),
  ]) {
    expect(() =>
      assertStorefrontPreviewSmoke({ ...factory, rootResponse }),
    ).toThrow("STOREFRONT_PREVIEW_UNREGISTERED_HOST_MISMATCH")
  }
  expect(() =>
    assertStorefrontPreviewSmoke({ ...factory, rootMode: "historical" }),
  ).toThrow("STOREFRONT_PREVIEW_SURFACE_MISMATCH")
  expect(storefrontPreviewAssetPath(factory.rootResponse)).toBe(
    "/_next/static/chunks/example.css",
  )
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

test("factory asset smoke accepts only an actual same-origin Next build asset", () => {
  for (const html of [
    '<link href="https://other.example/_next/static/chunks/style.css">',
    '<script src="/_next/static/../private.js">',
    "<h1>This shop isn’t available</h1>",
  ]) {
    expect(() => storefrontPreviewAssetPath(html)).toThrow(
      "STOREFRONT_PREVIEW_ASSET_MISSING",
    )
  }
  expect(() =>
    assertStorefrontPreviewAsset(
      "HTTP/2 200\r\ncontent-type: text/css; charset=utf-8\r\n\r\nbody{}",
    ),
  ).not.toThrow()
  for (const response of [
    "HTTP/2 404\r\ncontent-type: text/css\r\n\r\nNot found",
    "HTTP/2 200\r\ncontent-type: text/html\r\n\r\nLogin",
  ]) {
    expect(() => assertStorefrontPreviewAsset(response)).toThrow(
      "STOREFRONT_PREVIEW_ASSET_MISMATCH",
    )
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
