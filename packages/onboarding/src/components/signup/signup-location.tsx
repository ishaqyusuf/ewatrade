"use client"

import {
  GEO_ADDRESS_ATTRIBUTION,
  type ResolvedAddress,
  mapsUrl,
} from "@ewatrade/utils/geo-address"
import {
  LinkSquare02Icon,
  Loading03Icon,
  Location01Icon,
  Navigation03Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useState } from "react"

/**
 * "Use my current location" for web sign-up: the browser shares its position,
 * the dashboard looks up the address, and the caller fills the fields.
 */
export function SignupUseLocation({
  onLocated,
}: {
  onLocated: (address: ResolvedAddress) => void
}) {
  const [status, setStatus] = useState<"idle" | "busy" | "found">("idle")
  const [address, setAddress] = useState<ResolvedAddress | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const locate = () => {
    if (!("geolocation" in navigator)) {
      setMessage("This browser can’t share its location. Type the address.")
      return
    }
    setStatus("busy")
    setMessage(null)
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const response = await fetch("/api/location/reverse", {
            body: JSON.stringify({
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
            }),
            headers: { "Content-Type": "application/json" },
            method: "POST",
          })
          const data = (await response.json().catch(() => null)) as {
            address?: ResolvedAddress
            message?: string
          } | null
          if (!response.ok || !data?.address)
            throw new Error(
              data?.message ?? "We couldn’t look up this location. Try again.",
            )
          setAddress(data.address)
          setStatus("found")
          onLocated(data.address)
        } catch (error) {
          setStatus("idle")
          setMessage(
            error instanceof Error
              ? error.message
              : "We couldn’t look up this location. Try again.",
          )
        }
      },
      (error) => {
        setStatus("idle")
        setMessage(
          error.code === error.PERMISSION_DENIED
            ? "Location is off for this site. Allow it in your browser, or type the address."
            : "We couldn’t get your location. Try again, or type the address.",
        )
      },
      { enableHighAccuracy: true, maximumAge: 60_000, timeout: 15_000 },
    )
  }

  if (status === "found" && address)
    return (
      <div aria-live="polite" className="signup-location-card">
        <span className="signup-location-pin" aria-hidden>
          <HugeiconsIcon icon={Location01Icon} size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">Using your current location</p>
          <p className="text-muted-foreground text-sm">{address.label}</p>
          <div className="mt-1.5 flex gap-4 font-semibold text-primary text-sm">
            <a
              className="inline-flex items-center gap-1 hover:underline"
              href={mapsUrl(address.latitude, address.longitude)}
              rel="noopener noreferrer"
              target="_blank"
            >
              Open in Maps
              <HugeiconsIcon icon={LinkSquare02Icon} size={13} />
            </a>
            <button
              className="hover:underline"
              onClick={() => {
                setStatus("idle")
                setAddress(null)
              }}
              type="button"
            >
              Clear
            </button>
          </div>
          <p className="mt-1 text-muted-foreground text-xs">
            {GEO_ADDRESS_ATTRIBUTION}
          </p>
        </div>
      </div>
    )

  return (
    <div>
      <button
        aria-busy={status === "busy"}
        className="signup-location-button"
        disabled={status === "busy"}
        onClick={locate}
        type="button"
      >
        <HugeiconsIcon
          className={status === "busy" ? "animate-spin" : undefined}
          icon={status === "busy" ? Loading03Icon : Navigation03Icon}
          size={18}
        />
        {status === "busy"
          ? "Finding your location…"
          : "Use my current location"}
      </button>
      {message ? (
        <p className="mt-1.5 text-destructive text-sm" role="alert">
          {message}
        </p>
      ) : null}
    </div>
  )
}
