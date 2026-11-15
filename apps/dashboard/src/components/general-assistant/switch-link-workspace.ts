import { clearDashboardDataCache } from "@/trpc/client"

/**
 * Selects the business and Store a WhatsApp or Telegram link belongs to, then
 * reloads so the link re-resolves under that workspace. Both routes recheck
 * membership and Store access; a refusal throws a plain sentence.
 */
export async function switchLinkWorkspace(target: {
  tenantId: string
  storeId: string
}) {
  for (const [path, body] of [
    [
      "/api/tenants/active",
      { tenantId: target.tenantId, path: location.pathname },
    ],
    ["/api/stores/active", { storeId: target.storeId }],
  ] as const) {
    const response = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    if (!response.ok)
      throw Error("Couldn’t switch. Check your access and try again.")
  }
  clearDashboardDataCache()
  window.location.reload()
}
