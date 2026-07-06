"use client"

import NextLink from "next/link"
import { useRouter } from "next/navigation"
import { forwardRef, type ComponentPropsWithoutRef } from "react"
import { useTenantHref } from "./react"

const isDev = process.env.NODE_ENV !== "production"

export type TenantLinkProps = ComponentPropsWithoutRef<typeof NextLink>

export const LocalTenantLink = forwardRef<HTMLAnchorElement, TenantLinkProps>(
  function LocalTenantLink({ href, ...props }, ref) {
    const buildHref = useTenantHref()
    const nextHref = typeof href === "string" ? buildHref(href) : href

    return <NextLink ref={ref} href={nextHref} {...props} />
  },
)

export const TenantLink = isDev ? LocalTenantLink : NextLink

export function useLocalTenantRouter() {
  const router = useRouter()
  const buildHref = useTenantHref()

  return {
    ...router,
    push: (href: string, options?: Parameters<typeof router.push>[1]) =>
      router.push(buildHref(href), options),
    replace: (href: string, options?: Parameters<typeof router.replace>[1]) =>
      router.replace(buildHref(href), options),
    prefetch: (href: string, options?: Parameters<typeof router.prefetch>[1]) =>
      router.prefetch(buildHref(href), options),
  }
}

export const useTenantRouter = isDev ? useLocalTenantRouter : useRouter

export function createTenantLink(Link = NextLink) {
  const LocalLink = forwardRef<HTMLAnchorElement, TenantLinkProps>(
    function LocalLink({ href, ...props }, ref) {
      const buildHref = useTenantHref()
      const nextHref = typeof href === "string" ? buildHref(href) : href

      return <Link ref={ref} href={nextHref} {...props} />
    },
  )

  return isDev ? LocalLink : Link
}

export function createTenantRouterHook(baseUseRouter = useRouter) {
  function useLocalRouter() {
    const router = baseUseRouter()
    const buildHref = useTenantHref()

    return {
      ...router,
      push: (href: string, options?: Parameters<typeof router.push>[1]) =>
        router.push(buildHref(href), options),
      replace: (href: string, options?: Parameters<typeof router.replace>[1]) =>
        router.replace(buildHref(href), options),
      prefetch: (
        href: string,
        options?: Parameters<typeof router.prefetch>[1],
      ) => router.prefetch(buildHref(href), options),
    }
  }

  return isDev ? useLocalRouter : baseUseRouter
}
