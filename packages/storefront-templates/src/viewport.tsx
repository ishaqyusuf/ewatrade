import type { ReactNode } from "react"

/**
 * The named `storefront` inline-size container every template's `@container` rules
 * query. Exactly one per rendered storefront surface: the full renderer adds it, and
 * a host that keeps a template shell outside that renderer must add it itself.
 */
export function StorefrontViewport({ children }: { children: ReactNode }) {
  return <div className="sf-template-viewport">{children}</div>
}
