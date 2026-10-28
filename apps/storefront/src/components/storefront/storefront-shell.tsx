"use client"

import type { StorefrontPresentation } from "@/lib/storefront-presentation"
import {
  CommerceStudioProvider,
  CommerceStudioShell,
  type StorefrontCommerceAdapter,
} from "@ewatrade/storefront-templates/commerce-studio"
import { usePathname } from "next/navigation"
import {
  type ReactNode,
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react"
import { StorefrontLoading } from "./storefront-loading"

const PresentationContext = createContext<{
  revision: string
  synchronize(data: StorefrontPresentation): void
} | null>(null)

export function StorefrontShell({
  data,
  adapter,
  children,
}: {
  data: StorefrontPresentation
  adapter: StorefrontCommerceAdapter
  children: ReactNode
}) {
  const [presentation, setPresentation] = useState(data)
  const [serverRevision, setServerRevision] = useState(data.revision)
  // A server refresh can update the layout; ordinary navigation updates via its page.
  if (serverRevision !== data.revision) {
    setServerRevision(data.revision)
    setPresentation(data)
  }
  const pathname = usePathname() ?? "/"
  const routeKind = pathname.startsWith("/receipt/")
    ? "receipt"
    : pathname === "/checkout"
      ? "checkout"
      : pathname === "/account"
        ? "account"
        : "page"
  const current =
    pathname === "/"
      ? (presentation.activePage ?? "home")
      : (pathname.split("/")[1] ?? "home")
  const context = useMemo(
    () => ({ revision: presentation.revision, synchronize: setPresentation }),
    [presentation.revision],
  )
  return (
    <PresentationContext.Provider value={context}>
      {presentation.snapshot.composition.template.key === "commerce-studio" ? (
        <CommerceStudioProvider
          key={presentation.snapshot.resources.business.slug}
          snapshot={presentation.snapshot}
          customer={presentation.customer}
          adapter={adapter}
          preview={false}
        >
          <CommerceStudioShell current={current} routeKind={routeKind}>
            {children}
          </CommerceStudioShell>
        </CommerceStudioProvider>
      ) : (
        children
      )}
    </PresentationContext.Provider>
  )
}

/** Fresh server page data updates the retained shell without another server read. */
export function StorefrontPageBoundary({
  data,
  children,
}: { data: StorefrontPresentation; children: ReactNode }) {
  const presentation = useContext(PresentationContext)
  const synchronize = presentation?.synchronize
  useEffect(() => {
    synchronize?.(data)
  }, [data, synchronize])
  if (!presentation || presentation.revision !== data.revision)
    return <StorefrontLoading />
  return children
}
