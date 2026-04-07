export type VercelAddDomainResult = { ok: true } | { ok: false; error: string }

const VERCEL_API_BASE = "https://api.vercel.com"

/**
 * Register a custom domain with a Vercel project.
 * Requires VERCEL_API_TOKEN to be set in the environment.
 * Never throws — returns { ok: false, error } on any failure.
 */
export async function addVercelDomain(
  domain: string,
  projectId: string
): Promise<VercelAddDomainResult> {
  const token = process.env.VERCEL_API_TOKEN

  if (!token) {
    return { ok: false, error: "VERCEL_API_TOKEN is not set" }
  }

  if (!projectId) {
    return { ok: false, error: "projectId is required" }
  }

  try {
    const response = await fetch(`${VERCEL_API_BASE}/v10/projects/${projectId}/domains`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ name: domain })
    })

    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as { error?: { message?: string } }
      return {
        ok: false,
        error: body?.error?.message ?? `Vercel API error: ${response.status}`
      }
    }

    return { ok: true }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Unknown error adding domain to Vercel"
    }
  }
}

/**
 * Provision all three tenant surfaces (storefront, pos, dashboard) on Vercel.
 * Uses the three project IDs from environment variables.
 * Non-blocking — logs results but does not throw.
 */
export async function provisionTenantVercelDomains(params: {
  storefrontDomain: string
  posDomain: string
  dashboardDomain: string
}): Promise<void> {
  const storefrontProjectId = process.env.VERCEL_STOREFRONT_PROJECT_ID ?? ""
  const posProjectId = process.env.VERCEL_POS_PROJECT_ID ?? ""
  const dashboardProjectId = process.env.VERCEL_DASHBOARD_PROJECT_ID ?? ""

  const results = await Promise.allSettled([
    addVercelDomain(params.storefrontDomain, storefrontProjectId),
    addVercelDomain(params.posDomain, posProjectId),
    addVercelDomain(params.dashboardDomain, dashboardProjectId)
  ])

  for (const [index, result] of results.entries()) {
    const surface = ["storefront", "pos", "dashboard"][index]

    if (result.status === "rejected") {
      console.error(`[vercel] Failed to add ${surface} domain:`, result.reason)
    } else if (!result.value.ok) {
      console.warn(`[vercel] Could not add ${surface} domain:`, result.value.error)
    }
  }
}
