"use client"

import { useTRPC } from "@/trpc/client"
import { validateComposition } from "@ewatrade/storefront-contracts/manifest"
import { getTemplateManifest } from "@ewatrade/storefront-templates"
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@ewatrade/ui"
import { useQuery } from "@tanstack/react-query"
import Link from "next/link"
import { useMemo, useState } from "react"
import { StorefrontCanvasPreview } from "../storefront-canvas-preview"
import { StorefrontCanvasSkeleton } from "../storefront-skeleton"
import "../studio.css"

const sizes = [
  { value: "mobile", label: "Phone" },
  { value: "desktop", label: "Computer" },
] as const

/**
 * Full-screen look at the saved design, as customers will see it once
 * published. Reads the draft and a private preview only while open.
 */
export function StorePreviewDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[100svh] max-h-none w-screen max-w-none flex-col gap-0 overflow-hidden rounded-none p-0 sm:h-[calc(100svh-2rem)] sm:w-[calc(100vw-2rem)] sm:max-w-6xl sm:rounded-[var(--ui-radius-surface)]">
        {open ? <PreviewBody /> : null}
      </DialogContent>
    </Dialog>
  )
}

function PreviewBody() {
  const trpc = useTRPC()
  const draft = useQuery(
    trpc.storefront.draft.queryOptions(undefined, {
      retry: false,
      refetchOnWindowFocus: false,
    }),
  )
  const [viewport, setViewport] = useState<"mobile" | "desktop">(() =>
    typeof window !== "undefined" && window.innerWidth >= 1024
      ? "desktop"
      : "mobile",
  )
  const [pageKey, setPageKey] = useState("home")
  const composition = useMemo(() => {
    if (!draft.data) return null
    try {
      return validateComposition(
        draft.data.draft.composition,
        getTemplateManifest(draft.data.draft.composition),
      )
    } catch {
      return null
    }
  }, [draft.data])
  return (
    <>
      <div className="flex min-h-16 flex-wrap items-center gap-3 border-b border-border px-4 py-2 pr-14">
        <DialogTitle className="mr-auto text-lg">Preview</DialogTitle>
        <DialogDescription className="sr-only">
          Your saved design, as customers see it once it is published.
        </DialogDescription>
        <fieldset
          aria-label="Screen size"
          className="hidden rounded-[var(--ui-radius-control)] border border-border bg-[var(--canvas)] p-1 lg:flex"
        >
          {sizes.map((size) => (
            <Button
              key={size.value}
              size="sm"
              variant={viewport === size.value ? "outline" : "ghost"}
              aria-pressed={viewport === size.value}
              onClick={() => setViewport(size.value)}
            >
              {size.label}
            </Button>
          ))}
        </fieldset>
        <Button variant="outline" render={<Link href="/storefront/studio" />}>
          Edit design
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto bg-[var(--canvas)] sm:p-6">
        {draft.error ? (
          <div className="grid gap-3 p-6" role="alert">
            <p>Couldn’t load your design.</p>
            <Button
              className="w-fit"
              variant="outline"
              onClick={() => void draft.refetch()}
            >
              Try again
            </Button>
          </div>
        ) : !draft.data ? (
          <StorefrontCanvasSkeleton />
        ) : !composition ? (
          <p className="p-6" role="alert">
            This design can’t be shown. Open the studio to fix it.
          </p>
        ) : (
          <StorefrontCanvasPreview
            siteId={draft.data.siteId}
            storeId={draft.data.storeId}
            revision={draft.data.draft.revision}
            composition={composition}
            pageKey={pageKey}
            viewport={viewport}
            onPageChange={setPageKey}
            onSnapshot={noop}
          />
        )}
      </div>
    </>
  )
}

function noop() {}
