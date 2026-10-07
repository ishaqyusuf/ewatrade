"use client"

import type { TenantContext } from "@/lib/tenant"
import { clearDashboardDataCache } from "@/trpc/client"
import { usePathname } from "next/navigation"
import { useState } from "react"

type WorkspaceSwitchResponse = {
  dashboardUrl?: string | null
  error?: string
}

type SwitchResult =
  | { status: "unchanged" | "success" }
  | { error: string; status: "error" }

type SwitchDependencies = {
  assign: (url: string) => void
  clearCache: () => void
  fetcher: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  pathname: string
}

async function responseError(response: Response, fallback: string) {
  const body = (await response
    .json()
    .catch(() => null)) as WorkspaceSwitchResponse | null

  return body?.error || fallback
}

export function createWorkspaceSwitchActions(
  ctx: TenantContext,
  { assign, clearCache, fetcher, pathname }: SwitchDependencies,
) {
  async function requestSwitch(
    url: string,
    body:
      | { storeId: string }
      | { scope: "all" }
      | { path: string; tenantId: string },
    fallback: string,
    onNavigate?: () => void,
  ): Promise<SwitchResult> {
    try {
      const response = await fetcher(url, {
        body: JSON.stringify(body),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      })

      if (!response.ok) {
        return {
          error: await responseError(response, fallback),
          status: "error",
        }
      }

      const result =
        url === "/api/tenants/active"
          ? ((await response.json()) as WorkspaceSwitchResponse)
          : null
      clearCache()
      onNavigate?.()
      assign(
        result?.dashboardUrl ||
          ("scope" in body && !pathname.startsWith("/inventory")
            ? "/inventory"
            : pathname),
      )
      return { status: "success" }
    } catch (switchError) {
      return {
        error: switchError instanceof Error ? switchError.message : fallback,
        status: "error",
      }
    }
  }

  return {
    switchAllStores(onNavigate?: () => void) {
      return requestSwitch(
        "/api/stores/active",
        { scope: "all" },
        "Could not show all stores.",
        onNavigate,
      )
    },
    switchStore(storeId: string, onNavigate?: () => void) {
      if (
        !storeId ||
        (storeId === ctx.activeStore?.id &&
          ctx.inventoryScope !== "all" &&
          !ctx.storeSelectionNeedsRepair)
      ) {
        return Promise.resolve<SwitchResult>({ status: "unchanged" })
      }

      return requestSwitch(
        "/api/stores/active",
        { storeId },
        "Could not switch store.",
        onNavigate,
      )
    },
    switchTenant(tenantId: string, onNavigate?: () => void) {
      if (!tenantId || tenantId === ctx.tenant.id) {
        return Promise.resolve<SwitchResult>({ status: "unchanged" })
      }

      return requestSwitch(
        "/api/tenants/active",
        { path: pathname, tenantId },
        "Could not switch business.",
        onNavigate,
      )
    },
  }
}

export function useWorkspaceSwitch(ctx: TenantContext) {
  const pathname = usePathname()
  const [isSwitching, setIsSwitching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const actions = createWorkspaceSwitchActions(ctx, {
    assign: (url) => window.location.assign(url),
    clearCache: clearDashboardDataCache,
    fetcher: (input, init) => fetch(input, init),
    pathname,
  })

  async function runSwitch(switchAction: () => Promise<SwitchResult>) {
    if (isSwitching) return

    setError(null)
    setIsSwitching(true)
    const result = await switchAction()
    if (result.status === "error") setError(result.error)
    setIsSwitching(false)
  }

  return {
    error,
    isSwitching,
    switchAllStores(onNavigate?: () => void) {
      return runSwitch(() => actions.switchAllStores(onNavigate))
    },
    switchStore(storeId: string, onNavigate?: () => void) {
      return runSwitch(() => actions.switchStore(storeId, onNavigate))
    },
    switchTenant(tenantId: string, onNavigate?: () => void) {
      return runSwitch(() => actions.switchTenant(tenantId, onNavigate))
    },
  }
}
