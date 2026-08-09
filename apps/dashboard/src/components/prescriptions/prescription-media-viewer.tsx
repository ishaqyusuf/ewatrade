"use client"

import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import { Badge, Button } from "@ewatrade/ui"
import { useEffect, useState } from "react"

import { formatPrescriptionStatus } from "./prescription-presentation"

type PrescriptionMediaItem =
  RouterOutputs["prescriptions"]["detail"]["media"][number]
export type PrescriptionMediaGrant = Pick<
  RouterOutputs["prescriptions"]["mediaAccess"],
  "expiresAt" | "url"
>

export function isPrescriptionMediaGrantUsable(
  grant: PrescriptionMediaGrant | undefined,
  now: number,
  failed: boolean,
) {
  return Boolean(grant && !failed && grant.expiresAt.getTime() > now)
}

export function PrescriptionMediaViewer({
  isAuthorizing,
  media,
  mediaGrants,
  onAuthorize,
}: {
  isAuthorizing: boolean
  media: PrescriptionMediaItem[]
  mediaGrants: Record<string, PrescriptionMediaGrant>
  onAuthorize: (mediaId: string) => void
}) {
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [rotation, setRotation] = useState(0)
  const [failedGrantKey, setFailedGrantKey] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const selected = media[selectedIndex]
  const selectedGrant = selected ? mediaGrants[selected.id] : undefined
  const selectedGrantKey =
    selected && selectedGrant
      ? `${selected.id}:${selectedGrant.url}`
      : undefined
  const grantUsable = isPrescriptionMediaGrantUsable(
    selectedGrant,
    now,
    failedGrantKey === selectedGrantKey,
  )
  const selectedUrl = grantUsable ? selectedGrant?.url : undefined

  useEffect(() => {
    if (selectedIndex >= media.length) setSelectedIndex(0)
  }, [media.length, selectedIndex])

  useEffect(() => {
    if (!selectedGrant) return
    const remaining = selectedGrant.expiresAt.getTime() - Date.now()
    if (remaining <= 0) {
      setNow(Date.now())
      return
    }
    const timeout = window.setTimeout(() => setNow(Date.now()), remaining + 50)
    return () => window.clearTimeout(timeout)
  }, [selectedGrant])

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
        <Badge className="rounded-full">
          {formatPrescriptionStatus(selected.status)}
        </Badge>
      </div>

      <div className="flex min-h-80 items-center justify-center overflow-auto rounded-lg border border-border bg-muted/30 p-3">
        {selectedUrl ? (
          <object
            aria-label={`Authorized prescription page ${selected.pageNumber}`}
            className="h-96 w-full origin-center transition-transform"
            data={selectedUrl}
            onError={() => setFailedGrantKey(selectedGrantKey ?? null)}
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
              {failedGrantKey === selectedGrantKey
                ? "The private view could not be loaded. Authorize a new link and try again."
                : selectedGrant
                  ? "This private view expired. Authorize a new short-lived link."
                  : "Authorize a short-lived private view before opening this page."}
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
          {selectedUrl ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={isAuthorizing}
              onClick={() => onAuthorize(selected.id)}
            >
              Reauthorize view
            </Button>
          ) : null}
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
