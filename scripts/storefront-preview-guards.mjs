export const STOREFRONT_PREVIEW = Object.freeze({
  alias: "ewatrade-storefront-preview-ishaqyusufs-projects.vercel.app",
  orgId: "team_BV5rgKHJH4fMyFL1YfscZIZK",
  projectId: "prj_jkmPCKSdIpnGYQnFS32WcNgBni2a",
  projectName: "ewatrade-storefront-preview",
  scope: "ishaqyusufs-projects",
  androidPackageName: "com.ewatrade.preview",
  androidCertificateSha256:
    "3F:55:E6:45:A1:E2:3E:05:EA:CD:1B:8F:DB:31:22:79:BA:07:78:57:E9:DF:20:19:9B:D9:DE:FD:75:C7:DB:3A",
})

/** Deploy and alias promotion require exact clean source; read-only verification does not. */
export function assertStorefrontPreviewSource({
  expectedRevision,
  head,
  dirty,
}) {
  if (
    !/^[a-f0-9]{40}$/.test(expectedRevision ?? "") ||
    head.trim() !== expectedRevision
  )
    throw new Error("STOREFRONT_PREVIEW_EXACT_RELEASE_SOURCE_REQUIRED")
  if (dirty.trim()) throw new Error("STOREFRONT_PREVIEW_SOURCE_NOT_CLEAN")
  return expectedRevision
}

export function assertStorefrontPreviewMode(args, environment) {
  const [mode] = args
  if (
    ![
      "--prepare-only",
      "--verify-only",
      "--verify-deployment",
      "--promote-existing",
      "--deploy",
    ].includes(mode) ||
    args.length !==
      (["--verify-deployment", "--promote-existing"].includes(mode) ? 2 : 1)
  )
    throw new Error("Choose one explicit Storefront Preview mode.")
  if (
    environment.APP_ENV === "production" ||
    environment.DEV_PROFILE === "prod" ||
    environment.VERCEL_ENV === "production" ||
    environment.VERCEL_TARGET === "production"
  )
    throw new Error(
      "Production environment selected; Preview operation stopped.",
    )
  return mode
}

export function assertStorefrontPreviewProjectLink(link) {
  if (
    link?.projectId !== STOREFRONT_PREVIEW.projectId ||
    link?.orgId !== STOREFRONT_PREVIEW.orgId ||
    link?.projectName !== STOREFRONT_PREVIEW.projectName
  ) {
    throw new Error("STOREFRONT_PREVIEW_PROJECT_LINK_MISMATCH")
  }
}

export function assertStorefrontPreviewUrl(value) {
  const url = typeof value === "string" ? value : ""
  if (
    !/^https:\/\/ewatrade-storefront-preview-[a-z0-9-]+-ishaqyusufs-projects\.vercel\.app$/.test(
      url,
    ) ||
    url === `https://${STOREFRONT_PREVIEW.alias}`
  ) {
    throw new Error("STOREFRONT_PREVIEW_DEPLOYMENT_URL_INVALID")
  }
  return url
}

export function assertStorefrontPreviewDeployment(inspected, expectedRevision) {
  const projectId = inspected?.projectId ?? inspected?.project?.id
  if (
    inspected?.name !== STOREFRONT_PREVIEW.projectName ||
    projectId !== STOREFRONT_PREVIEW.projectId ||
    inspected?.target?.toLowerCase() !== "preview" ||
    inspected?.readyState !== "READY" ||
    !/^dpl_[A-Za-z0-9]+$/.test(inspected?.id ?? "")
  ) {
    throw new Error("STOREFRONT_PREVIEW_DEPLOYMENT_MISMATCH")
  }
  if (
    expectedRevision !== undefined &&
    (!/^[a-f0-9]{40}$/.test(expectedRevision ?? "") ||
      inspected.meta?.githubCommitSha !== expectedRevision)
  )
    throw new Error("STOREFRONT_PREVIEW_DEPLOYMENT_SOURCE_MISMATCH")
  return inspected.id
}

export function assertStorefrontPreviewAlias(
  inspected,
  expectedId,
  expectedRevision,
) {
  if (
    assertStorefrontPreviewDeployment(inspected, expectedRevision) !==
    expectedId
  )
    throw new Error("STOREFRONT_PREVIEW_ALIAS_MISMATCH")
}

/** Probe one same-origin build asset actually referenced by the refusal document. */
export function storefrontPreviewAssetPath(rootResponse) {
  const asset =
    /(?:src|href)="(\/_next\/static\/[A-Za-z0-9_./%-]+\.(?:css|js)(?:\?[^"<>]*)?)"/.exec(
      rootResponse,
    )?.[1]
  if (!asset || asset.length > 2048 || asset.includes(".."))
    throw new Error("STOREFRONT_PREVIEW_ASSET_MISSING")
  return asset.replaceAll("&amp;", "&")
}

export function assertStorefrontPreviewAsset(response) {
  if (
    !/^HTTP\/[\d.]+ 200\b/m.test(response) ||
    !/^content-type:\s*(?:text\/(?:css|javascript)|application\/(?:javascript|x-javascript))\b/im.test(
      response,
    )
  )
    throw new Error("STOREFRONT_PREVIEW_ASSET_MISMATCH")
}

export function assertStorefrontPreviewSmoke({
  rootResponse,
  legal,
  invalidTokenResponse,
  associationResponse,
  androidAssociationResponse,
  expectedSurface = "customer-chat",
  rootMode = "historical",
}) {
  if (
    !["customer-chat", "storefront"].includes(expectedSurface) ||
    !new RegExp(`^x-tenant-surface:\\s*${expectedSurface}\\s*$`, "im").test(
      rootResponse,
    )
  )
    throw new Error("STOREFRONT_PREVIEW_SURFACE_MISMATCH")
  if (rootMode === "factory-unavailable") {
    // Neither the deployment URL nor the chat alias is a published merchant host.
    if (
      !/^HTTP\/[\d.]+ 404\b/m.test(rootResponse) ||
      !/^cache-control:\s*[^\r\n]*no-store\b/im.test(rootResponse) ||
      !/This shop isn(?:’|'|&#x27;|&#39;)t available/.test(rootResponse)
    )
      throw new Error("STOREFRONT_PREVIEW_UNREGISTERED_HOST_MISMATCH")
  } else if (
    rootMode !== "historical" ||
    !/^HTTP\/[\d.]+ 200\b/m.test(rootResponse)
  ) {
    throw new Error("STOREFRONT_PREVIEW_SURFACE_MISMATCH")
  }
  // The factory source includes the owner-approved publication and Preview's
  // existing legal testing policy. Historical deployments retain their closed
  // contract; neither mode changes runtime signup/provider configuration.
  const legalMatches =
    rootMode === "factory-unavailable"
      ? legal?.effective === true &&
        legal?.signupAvailable === true &&
        legal?.version === "2026-10-15-adult-chat-1" &&
        legal?.effectiveDate === "2026-10-15"
      : legal?.effective === false && legal?.signupAvailable === false
  if (!legalMatches) throw new Error("STOREFRONT_PREVIEW_LEGAL_GATE_MISMATCH")
  if (
    !/^HTTP\/[\d.]+ 404\b/m.test(invalidTokenResponse) ||
    !/^cache-control:\s*[^\r\n]*no-store\b/im.test(invalidTokenResponse)
  )
    throw new Error("STOREFRONT_PREVIEW_INVALID_TOKEN_MISMATCH")
  if (!/^HTTP\/[\d.]+ 503\b/m.test(associationResponse))
    throw new Error("STOREFRONT_PREVIEW_ASSOCIATION_GATE_MISMATCH")
  const separator = /\r?\n\r?\n/.exec(androidAssociationResponse ?? "")
  let statements
  try {
    statements = separator
      ? JSON.parse(
          androidAssociationResponse.slice(
            separator.index + separator[0].length,
          ),
        )
      : null
  } catch {
    statements = null
  }
  const target = statements?.[0]?.target
  if (
    !/^HTTP\/[\d.]+ 200\b/m.test(androidAssociationResponse ?? "") ||
    !/^content-type:\s*application\/json\b/im.test(
      androidAssociationResponse,
    ) ||
    !Array.isArray(statements) ||
    statements.length !== 1 ||
    !Array.isArray(statements[0].relation) ||
    statements[0].relation.length !== 1 ||
    statements[0].relation[0] !==
      "delegate_permission/common.handle_all_urls" ||
    target?.namespace !== "android_app" ||
    target.package_name !== STOREFRONT_PREVIEW.androidPackageName ||
    !Array.isArray(target.sha256_cert_fingerprints) ||
    target.sha256_cert_fingerprints.length !== 1 ||
    target.sha256_cert_fingerprints[0] !==
      STOREFRONT_PREVIEW.androidCertificateSha256
  )
    throw new Error("STOREFRONT_PREVIEW_ANDROID_ASSOCIATION_MISMATCH")
}
