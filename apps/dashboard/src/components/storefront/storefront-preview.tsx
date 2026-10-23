"use client"

import { useTRPC } from "@/trpc/client"
import {
  type StorefrontComposition,
  validateComposition,
} from "@ewatrade/storefront-contracts/manifest"
import {
  type CatalogQuery,
  catalogQuerySchema,
} from "@ewatrade/storefront-contracts/resources"
import { validateDesignAssets } from "@ewatrade/storefront-runtime/design-assets"
import { getTemplateManifest } from "@ewatrade/storefront-templates"
import { StorefrontTemplate } from "@ewatrade/storefront-templates/render"
import { useQuery } from "@tanstack/react-query"
import { useEffect, useState } from "react"
import { StorefrontCanvasSkeleton } from "./storefront-skeleton"

export function StorefrontPreview({ session }: { session: string }) {
  const trpc = useTRPC()
  const [query, setQuery] = useState<CatalogQuery>({})
  const [resourceDesign, setResourceDesign] =
    useState<StorefrontComposition | null>(null)
  const preview = useQuery(
    trpc.storefront.preview.queryOptions(
      {
        session,
        query,
        designs: resourceDesign ? [resourceDesign] : undefined,
      },
      {
        retry: false,
        staleTime: 0,
        gcTime: 0,
        refetchOnWindowFocus: false,
      },
    ),
  )
  const [composition, setComposition] = useState<StorefrontComposition | null>(
    null,
  )
  const [notice, setNotice] = useState("")
  const [readOnly, setReadOnly] = useState(false)
  const [expired, setExpired] = useState(false)
  useEffect(() => {
    if (!preview.data) return
    const timer = setTimeout(
      () => setExpired(true),
      Math.max(0, preview.data.expiresAt - Date.now()),
    )
    return () => clearTimeout(timer)
  }, [preview.data])
  useEffect(() => {
    const timer = setTimeout(() => setExpired(true), 5 * 60_000)
    const receive = (event: MessageEvent) => {
      if (
        event.origin !== location.origin ||
        event.source !== window.parent ||
        event.data?.type !== "storefront-design"
      )
        return
      try {
        const manifest = getTemplateManifest(event.data.composition)
        const design = validateComposition(event.data.composition, manifest)
        validateDesignAssets(design, manifest)
        // Copy/theme edits remain local. Reload declared resources only when layout access changes.
        const accessKey = (value: StorefrontComposition | null) =>
          value
            ? JSON.stringify([
                value.template,
                value.pages.map((page) =>
                  page.sections.map((section) => [
                    section.type,
                    section.visible,
                  ]),
                ),
              ])
            : ""
        setResourceDesign((prior) =>
          accessKey(prior) === accessKey(design) ? prior : design,
        )
        setComposition(design)
        setReadOnly(event.data.readOnly === true)
        setNotice("")
      } catch {
        setNotice("Some settings are invalid. The last valid preview is shown.")
      }
    }
    window.addEventListener("message", receive)
    window.parent.postMessage(
      { type: "storefront-preview-ready" },
      location.origin,
    )
    return () => {
      clearTimeout(timer)
      window.removeEventListener("message", receive)
    }
  }, [])
  if (expired)
    return (
      <p className="p-6">Preview expired. Refresh preview in the studio.</p>
    )
  if (preview.error)
    return (
      <p role="alert" className="p-6">
        {preview.error.message}
      </p>
    )
  if (!preview.data) return <StorefrontCanvasSkeleton />
  const snapshot = preview.data.designSnapshots[0] ?? preview.data.snapshot
  const { business } = snapshot.resources
  return (
    <div
      onClickCapture={(event) => {
        const anchor = (event.target as HTMLElement).closest("a")
        if (anchor) {
          if (anchor.getAttribute("href")?.startsWith("#")) return
          event.preventDefault()
          event.stopPropagation()
          const url = new URL(anchor.href, location.origin)
          if (url.origin === location.origin && url.pathname === "/") {
            const next = catalogQuerySchema.safeParse({
              category: url.searchParams.get("category") ?? undefined,
              after: url.searchParams.get("after") ?? undefined,
              item: url.searchParams.get("item") ?? undefined,
            })
            if (next.success) {
              setQuery(next.data)
              setNotice("")
              return
            }
          }
          setNotice("Preview only — no request or navigation was sent.")
        }
      }}
    >
      {notice ? (
        <output className="border-b bg-white p-3 text-sm text-black">
          {notice}
        </output>
      ) : null}
      <StorefrontTemplate
        snapshot={{
          ...snapshot,
          composition: composition ?? snapshot.composition,
        }}
        draftPreview
        domain={`${business.slug}.ewatrade.com`}
        customerChatOrigin=""
        onTaglineChange={
          readOnly
            ? undefined
            : (value) =>
                window.parent.postMessage(
                  { type: "storefront-tagline", value },
                  location.origin,
                )
        }
      />
    </div>
  )
}
