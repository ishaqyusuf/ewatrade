"use client"

import {
  type CommerceLinkProps,
  type CommerceNavigation,
  CommerceNavigationProvider,
} from "@ewatrade/storefront-templates/commerce-studio"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { type ReactNode, useMemo, useTransition } from "react"

function StorefrontLink({ href = "/", ...props }: CommerceLinkProps) {
  return (
    <Link
      {...props}
      href={href}
      prefetch={
        href.includes("/receipt/") || href.includes("item=") ? false : undefined
      }
    />
  )
}

export function StorefrontNavigation({ children }: { children: ReactNode }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
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
    <CommerceNavigationProvider value={value}>
      {children}
    </CommerceNavigationProvider>
  )
}
