"use client"

import { useState } from "react"
import { Document, Page, pdfjs } from "react-pdf"

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString()

export default function ReceiptPdfPreview({ url }: { url: string }) {
  const [pages, setPages] = useState(0)
  return (
    <section
      aria-label="Receipt PDF preview"
      className="max-h-[65dvh] min-h-[420px] overflow-auto border border-border bg-muted p-3"
    >
      <Document
        file={url}
        onLoadSuccess={({ numPages }) => setPages(numPages)}
        loading={<p className="p-5 text-sm">Loading preview…</p>}
        error={
          <p role="alert" className="p-5 text-sm">
            Preview could not load. You can still download the PDF.
          </p>
        }
        className="grid justify-items-center gap-3"
      >
        {Array.from({ length: pages }, (_, index) => index + 1).map(
          (pageNumber) => (
            <div
              key={pageNumber}
              className="w-full max-w-[595px] bg-white shadow-sm"
            >
              <Page
                pageNumber={pageNumber}
                width={595}
                renderAnnotationLayer={false}
                renderTextLayer={false}
                className="[&_canvas]:!h-auto [&_canvas]:!w-full"
              />
              <p className="py-2 text-center text-xs text-neutral-500">
                Page {pageNumber} of {pages}
              </p>
            </div>
          ),
        )}
      </Document>
    </section>
  )
}
