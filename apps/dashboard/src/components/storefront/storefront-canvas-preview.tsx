"use client"

import { getDataCacheGeneration, useTRPC, useTRPCClient } from "@/trpc/client"
import type { StorefrontComposition } from "@ewatrade/storefront-contracts/manifest"
import type { CatalogQuery } from "@ewatrade/storefront-contracts/resources"
import type { StorefrontClientSnapshot } from "@ewatrade/storefront-runtime/server"
import { canvasDefaults, canvasManifest } from "@ewatrade/storefront-templates"
import type { CanvasEditing } from "@ewatrade/storefront-templates/canvas"
import { StorefrontTemplate } from "@ewatrade/storefront-templates/render"
import { useQuery } from "@tanstack/react-query"
import { useEffect, useState } from "react"
import {
  storefrontPreviewFormQuery,
  storefrontPreviewQuery,
} from "./storefront-preview-navigation"
import { StorefrontCanvasSkeleton } from "./storefront-skeleton"
import "@ewatrade/storefront-templates/styles.css"

export function StorefrontCanvasPreview({
  siteId,
  storeId,
  revision,
  composition,
  pageKey,
  viewport,
  editing,
  onPageChange,
  onSnapshot,
}: {
  siteId: string
  storeId: string
  revision: number
  composition: StorefrontComposition
  pageKey: string
  viewport: string
  editing?: CanvasEditing
  onPageChange: (key: string) => void
  onSnapshot: (snapshot: StorefrontClientSnapshot | null) => void
}) {
  const api = useTRPCClient()
  const trpc = useTRPC()
  const [retry, setRetry] = useState(0)
  const [query, setQuery] = useState<CatalogQuery>({})
  const [now, setNow] = useState(Date.now())
  const session = useQuery({
    queryKey: [
      "storefront-canvas-session",
      siteId,
      revision,
      retry,
      getDataCacheGeneration(),
    ],
    queryFn: () => api.storefront.previewSession.mutate(),
    retry: false,
    staleTime: 0,
    gcTime: 0,
    refetchOnWindowFocus: false,
  })
  // A reviewed default blueprint always declares the bounded catalog/contact projection,
  // even when the saved composition has hidden or removed its collection.
  // Copy/theme/reorder changes never request another database projection.
  const [resourceDesign] = useState(() =>
    canvasDefaults(canvasManifest(composition.template.key)),
  )
  const preview = useQuery(
    trpc.storefront.preview.queryOptions(
      {
        session: session.data?.session ?? "",
        designs: [resourceDesign],
        query,
      },
      {
        enabled: !!session.data && session.data.expiresAt > now,
        retry: false,
        staleTime: Number.POSITIVE_INFINITY,
        gcTime: 0,
        refetchOnWindowFocus: false,
      },
    ),
  )
  const snapshot = preview.data?.designSnapshots[0] ?? preview.data?.snapshot
  const scopeChanged = !!preview.data && preview.data.store.id !== storeId
  useEffect(() => {
    onSnapshot(scopeChanged ? null : (snapshot ?? null))
  }, [snapshot, scopeChanged, onSnapshot])
  useEffect(() => {
    if (!session.data) return
    const timer = setTimeout(
      () => setNow(Date.now()),
      Math.max(0, session.data.expiresAt - Date.now()),
    )
    return () => clearTimeout(timer)
  }, [session.data])
  const refresh = () => {
    setNow(Date.now())
    setRetry((value) => value + 1)
  }
  if (scopeChanged)
    return (
      <div className="sf-studio-preview-message" role="alert">
        <p>The business workspace changed. Reload before continuing.</p>
        <button type="button" onClick={() => window.location.reload()}>
          Reload workspace
        </button>
      </div>
    )
  if (session.error || preview.error)
    return (
      <div className="sf-studio-preview-message" role="alert">
        <p>{session.error?.message ?? preview.error?.message}</p>
        <button type="button" onClick={refresh}>
          Reload private preview
        </button>
      </div>
    )
  if (session.data && session.data.expiresAt <= now)
    return (
      <div className="sf-studio-preview-message">
        <p>Private preview expired. Your edits are kept.</p>
        <button type="button" onClick={refresh}>
          Refresh private preview
        </button>
      </div>
    )
  if (!snapshot) return <StorefrontCanvasSkeleton />
  return (
    <div className={`sf-canvas-device sf-device-${viewport}`}>
      <div className="sf-canvas-url">
        {snapshot.resources.business.slug}.ewatrade.com
        {pageKey === "home" ? "" : `/${pageKey}`}
        <span>Private draft</span>
      </div>
      <div
        onSubmitCapture={(event) => {
          event.preventDefault()
          event.stopPropagation()
          const form = event.target
          if (!(form instanceof HTMLFormElement)) return
          const next = storefrontPreviewFormQuery(
            form.action,
            form.method,
            new FormData(form),
            location.origin,
          )
          if (next) setQuery(next)
        }}
        onClickCapture={(event) => {
          const link = (event.target as HTMLElement).closest("a")
          if (link && !link.getAttribute("href")?.startsWith("#")) {
            event.preventDefault()
            event.stopPropagation()
            if (link.closest('nav[aria-label="Storefront pages"]')) {
              onPageChange(
                link.getAttribute("href") === "/about" ? "about" : "home",
              )
              return
            }
            const next = storefrontPreviewQuery(link.href, location.origin)
            if (next) setQuery(next)
          }
        }}
      >
        <StorefrontTemplate
          snapshot={{ ...snapshot, composition, mode: "preview" }}
          domain={`${snapshot.resources.business.slug}.ewatrade.com`}
          customerChatOrigin=""
          pageKey={pageKey}
          editing={editing}
          onPageChange={onPageChange}
        />
      </div>
    </div>
  )
}
