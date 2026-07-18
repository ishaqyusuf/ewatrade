export type VercelAddDomainResult = { ok: true } | { ok: false; error: string }

const VERCEL_API_BASE = "https://api.vercel.com"

function readEnv(name: string) {
  return (
    globalThis as { process?: { env?: Record<string, string | undefined> } }
  ).process?.env?.[name]
}

/**
 * Register a custom domain with a Vercel project.
 * Requires VERCEL_API_TOKEN to be set in the environment.
 * Never throws — returns { ok: false, error } on any failure.
 */
export async function addVercelDomain(
  domain: string,
  projectId: string,
): Promise<VercelAddDomainResult> {
  const token = readEnv("VERCEL_API_TOKEN")
  const trimmedProjectId = projectId.trim()

  if (!token) {
    return { ok: false, error: "VERCEL_API_TOKEN is not set" }
  }

  if (!trimmedProjectId) {
    return { ok: false, error: "projectId is required" }
  }

  try {
    const response = await fetch(
      `${VERCEL_API_BASE}/v10/projects/${trimmedProjectId}/domains`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: domain }),
      },
    )

    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as {
        error?: { message?: string }
      }
      return {
        ok: false,
        error: body?.error?.message ?? `Vercel API error: ${response.status}`,
      }
    }

    return { ok: true }
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error
          ? err.message
          : "Unknown error adding domain to Vercel",
    }
  }
}

/**
 * Provision tenant-owned public/store-operation surfaces on Vercel.
 * The dashboard is a shared platform surface and is never tenant-provisioned.
 * Non-blocking — logs results but does not throw.
 */
export async function provisionTenantVercelDomains(params: {
  storefrontDomain: string
  posDomain: string
}): Promise<void> {
  const token = readEnv("VERCEL_API_TOKEN")?.trim()

  if (!token) {
    console.warn(
      "[vercel] VERCEL_API_TOKEN is not set; skipping tenant domain provisioning.",
    )
    return
  }

  const storefrontProjectId = readEnv("VERCEL_STOREFRONT_PROJECT_ID") ?? ""
  const posProjectId = readEnv("VERCEL_POS_PROJECT_ID") ?? ""
  const configuredDomains = [
    {
      surface: "storefront",
      domain: params.storefrontDomain,
      projectId: storefrontProjectId,
    },
    { surface: "pos", domain: params.posDomain, projectId: posProjectId },
  ].filter(({ projectId }) => projectId.trim().length > 0)

  const results = await Promise.allSettled(
    configuredDomains.map(({ domain, projectId }) =>
      addVercelDomain(domain, projectId),
    ),
  )

  for (const [index, result] of results.entries()) {
    const surface = configuredDomains[index]?.surface ?? "unknown"

    if (result.status === "rejected") {
      console.error(`[vercel] Failed to add ${surface} domain:`, result.reason)
    } else if (result.value.ok === false) {
      console.warn(
        `[vercel] Could not add ${surface} domain:`,
        result.value.error,
      )
    }
  }
}
