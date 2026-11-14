"use client"
import { loadSheetCode } from "@/components/sheets/load-sheet-code"
import { useReceiptDownload } from "@/hooks/use-receipt-download"
import { useTRPC } from "@/trpc/client"
import { Button } from "@ewatrade/ui"
import { useQuery } from "@tanstack/react-query"
import dynamic from "next/dynamic"
import { useEffect, useState } from "react"

const ReceiptPdfPreview = dynamic(
  () =>
    loadSheetCode(
      () => import("./pdf-preview").then((mod) => mod.default),
      "body",
    ),
  {
    ssr: false,
    loading: () => <p className="py-8 text-sm">Loading preview…</p>,
  },
)

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
        You’re offline. Reconnect to make the receipt.
      </div>
    )
  if (orderIds.length > 20)
    return <div role="alert">Choose up to 20 orders at a time.</div>
  if (query.isError)
    return (
      <div role="alert" className="grid gap-4 py-8">
        <p>
          {!query.error.data ||
          query.error.data.code === "INTERNAL_SERVER_ERROR"
            ? "The receipt couldn’t be made. Try again."
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
  const canShare = Boolean(output.canShare)
  return (
    <div className="grid gap-5">
      <div className="grid gap-3">
        <p className="font-medium">{query.data.orderNumbers.join(", ")}</p>
        <div className="flex flex-wrap gap-2">
          {canShare ? (
            <Button
              className="max-sm:flex-1"
              disabled={output.pending}
              onClick={() => void output.share?.()}
            >
              Share
            </Button>
          ) : null}
          <Button
            className="max-sm:flex-1"
            variant={canShare ? "outline" : "default"}
            disabled={output.pending}
            onClick={() => void output.download("pdf")}
          >
            Download PDF
          </Button>
          <Button
            variant="outline"
            className="max-sm:hidden"
            disabled={output.pending}
            onClick={() => output.print?.()}
          >
            Print
          </Button>
          <Button
            variant="outline"
            disabled={output.pending}
            onClick={() => void output.download("image")}
          >
            {query.data.orderNumbers.length === 1 ? "Image" : "Images"}
          </Button>
        </div>
      </div>
      {output.error ? (
        <p role="alert" className="text-sm text-destructive">
          {output.error}
        </p>
      ) : null}
      {output.message ? (
        <output aria-live="polite" className="text-sm text-muted-foreground">
          {output.message}
        </output>
      ) : null}
      <ReceiptPdfPreview key={output.url} url={output.url} />
    </div>
  )
}
