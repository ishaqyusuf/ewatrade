"use client"
import { useReceiptDownload } from "@/hooks/use-receipt-download"
import { useTRPC } from "@/trpc/client"
import { Button } from "@ewatrade/ui"
import { useQuery } from "@tanstack/react-query"
import dynamic from "next/dynamic"
import { useEffect, useState } from "react"

const ReceiptPdfPreview = dynamic(() => import("./pdf-preview"), {
  ssr: false,
  loading: () => <p className="py-8 text-sm">Loading preview…</p>,
})

export function ReceiptContent({
  storeId,
  orderIds,
}: { storeId: string; orderIds: string[] }) {
  const trpc = useTRPC()
  const [online, setOnline] = useState(true)
  useEffect(() => {
    const update = () => setOnline(navigator.onLine)
    update()
    window.addEventListener("online", update)
    window.addEventListener("offline", update)
    return () => {
      window.removeEventListener("online", update)
      window.removeEventListener("offline", update)
    }
  }, [])
  const query = useQuery(
    trpc.orders.prepareReceipts.queryOptions(
      { storeId, orderIds },
      {
        enabled: orderIds.length > 0 && orderIds.length <= 20 && online,
        staleTime: 0,
        gcTime: 0,
        refetchOnWindowFocus: false,
        retry: false,
      },
    ),
  )
  const output = useReceiptDownload(
    query.data?.pdfBase64,
    query.data?.orderNumbers ?? [],
  )
  if (!online)
    return (
      <div role="alert" className="py-8 text-sm">
        Reconnect to prepare a receipt from current Order records.
      </div>
    )
  if (orderIds.length > 20)
    return <div role="alert">Select up to 20 Orders per export.</div>
  if (query.isError)
    return (
      <div role="alert" className="grid gap-4 py-8">
        <p>
          {!query.error.data ||
          query.error.data.code === "INTERNAL_SERVER_ERROR"
            ? "Receipt preparation failed. Please try again."
            : query.error.message}
        </p>
        <Button variant="outline" onClick={() => void query.refetch()}>
          Try again
        </Button>
      </div>
    )
  if (!query.data || !output.url || query.isFetching)
    return (
      <output className="block py-8" aria-live="polite">
        Preparing{" "}
        {orderIds.length === 1 ? "receipt" : `${orderIds.length} receipts`}…
      </output>
    )
  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-medium">{query.data.orderNumbers.join(", ")}</p>
          <p className="text-xs text-muted-foreground">
            {query.data.settingsSource === "store"
              ? "Store settings"
              : "Business defaults"}{" "}
            · One receipt per Order
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            disabled={output.pending}
            onClick={() => void output.download("image")}
          >
            Download images
          </Button>
          <Button
            disabled={output.pending}
            onClick={() => void output.download("pdf")}
          >
            Download PDF
          </Button>
        </div>
      </div>
      {output.error ? (
        <p role="alert" className="text-sm text-destructive">
          {output.error}
        </p>
      ) : null}
      <output aria-live="polite" className="text-xs text-muted-foreground">
        {output.message ||
          "Images use the same layout as this PDF. Multi-page and group images download as a ZIP."}
      </output>
      <ReceiptPdfPreview key={output.url} url={output.url} />
    </div>
  )
}
