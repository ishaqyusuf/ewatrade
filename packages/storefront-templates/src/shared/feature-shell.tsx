"use client"

import { CommerceLink } from "@ewatrade/storefront-runtime/commerce/navigation"
import { useStorefrontCommerce } from "@ewatrade/storefront-runtime/commerce/provider"
import { StorefrontFeatureActions } from "@ewatrade/storefront-runtime/features/actions"
import { BagSheet } from "@ewatrade/storefront-runtime/features/bag"
import { Toaster } from "@ewatrade/ui"
import type { ReactNode } from "react"

/** Shared feature-page chrome; each family injects its brand through the adapter. */
export function StorefrontFeatureShell({
  children,
  featurePage,
}: { children: ReactNode; featurePage: boolean }) {
  const { snapshot, themeStyle, href, preview } = useStorefrontCommerce()
  return (
    <>
      {featurePage ? (
        <div
          className="sf-feature-root"
          style={themeStyle}
          data-font={snapshot.composition.theme.font}
        >
          <header className="sf-feature-header">
            <CommerceLink
              href={href("/")}
              className="sf-feature-brand"
              onClick={(event) => {
                if (preview) event.preventDefault()
              }}
            >
              {snapshot.resources.business.name}
            </CommerceLink>
            <nav aria-label="Storefront">
              <CommerceLink
                href={href("/")}
                onClick={(event) => {
                  if (preview) event.preventDefault()
                }}
              >
                Storefront
              </CommerceLink>
            </nav>
            <StorefrontFeatureActions />
          </header>
          {snapshot.mode === "preview" && !preview ? (
            <aside className="sf-feature-qa-banner">
              Local QA preview · test data · no messages are sent
            </aside>
          ) : null}
          <main id="storefront-feature-main">{children}</main>
          <footer className="sf-feature-footer">
            {snapshot.resources.business.name}
          </footer>
        </div>
      ) : (
        <>
          {children}
          <div className="sf-feature-root sf-feature-dock" style={themeStyle}>
            <StorefrontFeatureActions />
          </div>
        </>
      )}
      <BagSheet />
      {preview ? null : <Toaster position="top-center" />}
    </>
  )
}
