"use client"

import { getDataCacheGeneration, useTRPC, useTRPCClient } from "@/trpc/client"
import { shareStorefrontLink } from "@ewatrade/storefront-runtime/share"
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Input,
  Skeleton,
} from "@ewatrade/ui"
import { Copy01Icon, Share01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useQuery } from "@tanstack/react-query"
import { useEffect, useRef, useState } from "react"
import { useCatalogThemeClass } from "./catalog-appearance"
import {
  catalogProductShareAdapter,
  catalogProductShareMessages,
  currentCatalogProductShare,
} from "./catalog-product-share"
import { catalogDetailReadIsFresh } from "./detail/read-access"
import { DetailError } from "./detail/states"

export function CatalogProductShareDialog({
  itemId,
  itemName,
  storeId,
  open,
  onOpenChange,
}: {
  itemId: string
  itemName: string
  /** The Store the opener belongs to, when known; a read for another Store is dropped. */
  storeId?: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const themeClass = useCatalogThemeClass()
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={`max-w-[455px] ${themeClass}`}
        // Portalled clicks still bubble through React to the row that opens details.
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
      >
        <div className="grid gap-4 p-6">
          <DialogHeader>
            <DialogTitle>Share product</DialogTitle>
            <DialogDescription className="break-words">
              {itemName}
            </DialogDescription>
          </DialogHeader>
          {open ? (
            <ShareLink
              key={`${itemId}:${storeId ?? ""}`}
              itemId={itemId}
              storeId={storeId}
            />
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function ShareLink({ itemId, storeId }: { itemId: string; storeId?: string }) {
  const trpc = useTRPC()
  const client = useTRPCClient()
  const generation = useRef(getDataCacheGeneration())
  const [visit] = useState(() => crypto.randomUUID())
  const query = useQuery({
    queryKey: [
      ...trpc.catalog.productShare.queryKey({ itemId }),
      "catalog-share-scope",
      generation.current,
      storeId ?? null,
      visit,
    ],
    queryFn: ({ signal }) =>
      client.catalog.productShare.query({ itemId }, { signal }),
    enabled: generation.current === getDataCacheGeneration(),
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: "always",
    retry: false,
  })
  const read = catalogDetailReadIsFresh(
    query,
    { key: visit, generation: generation.current },
    getDataCacheGeneration(),
  )
    ? currentCatalogProductShare(query.data, {
        storeId,
        generation: generation.current,
        currentGeneration: getDataCacheGeneration(),
      })
    : undefined

  if (generation.current !== getDataCacheGeneration())
    return (
      <DetailError
        message="Your business or Store changed. Reopen this product to share it."
        retry={() => window.location.reload()}
      />
    )
  if (query.isError)
    return (
      <DetailError
        message={query.error.message}
        retry={() => void query.refetch()}
      />
    )
  if (
    query.data?.status === "available" &&
    storeId !== undefined &&
    query.data.storeId !== storeId
  )
    return (
      <output className="text-sm text-muted-foreground">
        Your Store changed. Reopen this product to share it.
      </output>
    )
  if (!read)
    return (
      <output aria-label="Loading product link" className="grid gap-2">
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-40" />
      </output>
    )
  if (read.status === "unavailable")
    return <p className="text-sm text-muted-foreground">{read.reason}</p>
  return (
    <ShareActions
      url={read.url}
      title={read.title}
      generation={generation.current}
    />
  )
}

function ShareActions({
  url,
  title,
  generation,
}: { url: string; title: string; generation: number }) {
  const [message, setMessage] = useState<string | null>(null)
  const [canShare] = useState(
    () => typeof navigator !== "undefined" && "share" in navigator,
  )
  const input = useRef<HTMLInputElement>(null)
  const attempt = useRef(0)
  useEffect(
    () => () => {
      attempt.current += 1
    },
    [],
  )
  async function run(mode: "share" | "copy") {
    if (generation !== getDataCacheGeneration()) return
    const current = ++attempt.current
    const isCurrent = () =>
      current === attempt.current && generation === getDataCacheGeneration()
    setMessage(null)
    const result = await shareStorefrontLink(
      { title, url },
      catalogProductShareAdapter(
        {
          share:
            mode === "share" && canShare
              ? (request) => navigator.share(request)
              : undefined,
          copy: (value) => navigator.clipboard.writeText(value),
        },
        isCurrent,
      ),
    )
    // A closed dialog or a newer attempt owns the status now.
    if (!isCurrent()) return
    setMessage(catalogProductShareMessages[result])
    if (result === "unavailable") {
      input.current?.focus()
      input.current?.select()
    }
  }
  return (
    <div className="grid gap-2">
      <Input
        ref={input}
        readOnly
        aria-label="Product link"
        value={url}
        className="font-mono text-xs"
        onFocus={(event) => event.currentTarget.select()}
      />
      <output aria-live="polite" className="text-xs text-muted-foreground">
        {message ?? ""}
      </output>
      <div className="flex flex-wrap gap-2">
        {canShare ? (
          <Button type="button" onClick={() => void run("share")}>
            <HugeiconsIcon icon={Share01Icon} data-icon="inline-start" />
            Share
          </Button>
        ) : null}
        <Button
          type="button"
          variant={canShare ? "outline" : "default"}
          onClick={() => void run("copy")}
        >
          <HugeiconsIcon icon={Copy01Icon} data-icon="inline-start" />
          Copy link
        </Button>
      </div>
    </div>
  )
}
