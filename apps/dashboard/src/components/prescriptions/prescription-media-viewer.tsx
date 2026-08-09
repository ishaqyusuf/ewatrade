"use client"

import { Badge, Button } from "@ewatrade/ui"
import { useEffect, useState } from "react"

type PrescriptionMediaItem = {
  id: string
  mediaType: string
  pageNumber: number
  status: string
}

function formatStatus(value: string) {
  return value.toLowerCase().replaceAll("_", " ")
}

export function PrescriptionMediaViewer({
  isAuthorizing,
  media,
  mediaUrls,
  onAuthorize,
}: {
  isAuthorizing: boolean
  media: PrescriptionMediaItem[]
  mediaUrls: Record<string, string>
  onAuthorize: (mediaId: string) => void
}) {
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [rotation, setRotation] = useState(0)
  const selected = media[selectedIndex]
  const selectedUrl = selected ? mediaUrls[selected.id] : undefined

  useEffect(() => {
    if (selectedIndex >= media.length) setSelectedIndex(0)
  }, [media.length, selectedIndex])

  if (!selected) return null

  return (
    <section className="grid gap-3" aria-labelledby="prescription-media-title">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h4 id="prescription-media-title" className="font-medium">
            Private media
          </h4>
          <p className="text-sm text-muted-foreground">
            Page {selected.pageNumber} of {media.length}
          </p>
        </div>
        <Badge className="rounded-full">{formatStatus(selected.status)}</Badge>
      </div>

      <div className="flex min-h-80 items-center justify-center overflow-auto rounded-lg border border-border bg-muted/30 p-3">
        {selectedUrl ? (
          <object
            aria-label={`Authorized prescription page ${selected.pageNumber}`}
            className="h-96 w-full origin-center transition-transform"
            data={selectedUrl}
            style={{ transform: `rotate(${rotation}deg)` }}
            type={selected.mediaType}
          >
            <a href={selectedUrl} rel="noreferrer" target="_blank">
              Open authorized page {selected.pageNumber}
            </a>
          </object>
        ) : (
          <div className="grid max-w-sm justify-items-center gap-3 text-center">
            <p className="text-sm text-muted-foreground">
              Authorize a short-lived private view before opening this page.
            </p>
            <Button
              type="button"
              variant="outline"
              disabled={selected.status !== "SAFE" || isAuthorizing}
              onClick={() => onAuthorize(selected.id)}
            >
              Authorize view
            </Button>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={selectedIndex === 0}
            onClick={() => {
              setSelectedIndex((index) => index - 1)
              setRotation(0)
            }}
          >
            Previous page
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={selectedIndex === media.length - 1}
            onClick={() => {
              setSelectedIndex((index) => index + 1)
              setRotation(0)
            }}
          >
            Next page
          </Button>
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!selectedUrl}
            onClick={() => setRotation((degrees) => degrees - 90)}
          >
            Rotate left
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!selectedUrl}
            onClick={() => setRotation((degrees) => degrees + 90)}
          >
            Rotate right
          </Button>
        </div>
      </div>

      <ol className="flex flex-wrap gap-2" aria-label="Prescription pages">
        {media.map((item, index) => (
          <li key={item.id}>
            <Button
              type="button"
              size="sm"
              variant={index === selectedIndex ? "default" : "outline"}
              aria-current={index === selectedIndex ? "page" : undefined}
              onClick={() => {
                setSelectedIndex(index)
                setRotation(0)
              }}
            >
              Page {item.pageNumber}
            </Button>
          </li>
        ))}
      </ol>
    </section>
  )
}
