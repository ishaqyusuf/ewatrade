"use client"

import { createStorefrontItemPrefetchBudget } from "@/lib/storefront-prefetch"
import {
  type CommerceLinkProps,
  type CommerceNavigation,
  CommerceNavigationProvider,
} from "@ewatrade/storefront-runtime/commerce/navigation"
import Link, { useLinkStatus } from "next/link"
import { useRouter } from "next/navigation"
import {
  type ReactNode,
  createContext,
  useContext,
  useMemo,
  useRef,
  useTransition,
} from "react"

const PrefetchContext = createContext<((href: string) => void) | null>(null)

function LinkPendingHint() {
  const { pending } = useLinkStatus()
  return pending ? (
    <output
      aria-label="Loading page"
      className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-0.5 animate-pulse bg-current"
    >
      <span className="sr-only">Loading page…</span>
    </output>
  ) : null
}

function StorefrontLink({
  href = "/",
  children,
  onPointerEnter,
  onFocus,
  ...props
}: CommerceLinkProps) {
  const prefetch = useContext(PrefetchContext)
  return (
    <Link
      {...props}
      href={href}
      prefetch={
        href.includes("/receipt/") || href.includes("item=") ? false : undefined
      }
      onPointerEnter={(event) => {
        onPointerEnter?.(event)
        if (!event.defaultPrevented && event.pointerType !== "touch")
          prefetch?.(href)
      }}
      onFocus={(event) => {
        onFocus?.(event)
        if (!event.defaultPrevented) prefetch?.(href)
      }}
    >
      {children}
      <LinkPendingHint />
    </Link>
  )
}

export function StorefrontNavigation({ children }: { children: ReactNode }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const budget = useRef(createStorefrontItemPrefetchBudget())
  const prefetchItem = useMemo(
    () => (href: string) => {
      if (process.env.NODE_ENV !== "production") return
      const connection = (
        navigator as Navigator & {
          connection?: { saveData?: boolean; effectiveType?: string }
        }
      ).connection
      if (
        connection?.saveData ||
        ["slow-2g", "2g"].includes(connection?.effectiveType ?? "")
      )
        return
      if (budget.current(href)) router.prefetch(href)
    },
    [router],
  )
  const value = useMemo<CommerceNavigation>(
    () => ({
      Link: StorefrontLink,
      pending,
      refresh: () => startTransition(() => router.refresh()),
      navigate: (path, options) => {
        if (!path.startsWith("/") || path.startsWith("//")) return
        startTransition(() => {
          if (options?.replace) router.replace(path)
          else router.push(path)
          if (options?.refresh) router.refresh()
        })
      },
    }),
    [router, pending],
  )
  return (
    <PrefetchContext.Provider value={prefetchItem}>
      <CommerceNavigationProvider value={value}>
        {children}
      </CommerceNavigationProvider>
    </PrefetchContext.Provider>
  )
}
