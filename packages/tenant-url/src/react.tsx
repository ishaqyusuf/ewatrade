"use client"

import { type ReactNode, createContext, useCallback, useContext } from "react"
import { type TenantUrlConfig, type TenantUrlContext, buildTenantHref } from "."

export type TenantUrlProviderValue = {
  config: TenantUrlConfig
  context: TenantUrlContext
}

const TenantUrlContextValue = createContext<TenantUrlProviderValue | null>(null)

export function TenantUrlProvider({
  children,
  config,
  context,
}: TenantUrlProviderValue & { children: ReactNode }) {
  return (
    <TenantUrlContextValue.Provider value={{ config, context }}>
      {children}
    </TenantUrlContextValue.Provider>
  )
}

export function useTenantUrl() {
  return useContext(TenantUrlContextValue)
}

export function useTenantHref() {
  return useLocalTenantHref()
}

export function useLocalTenantHref() {
  const value = useTenantUrl()

  return useCallback(
    (href: string) => {
      if (!value) return href
      return buildTenantHref(value.context, href, value.config)
    },
    [value],
  )
}
