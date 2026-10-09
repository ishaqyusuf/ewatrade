import { useTRPC } from "@/trpc/client"
import type { ResolvedAddress } from "@ewatrade/utils/geo-address"
import { useMutation } from "@tanstack/react-query"
import * as Location from "expo-location"
import { useState } from "react"

export type CurrentAddressStatus = "idle" | "busy" | "found"

/**
 * "Use my current location": asks for foreground location once, reads the
 * position and looks up its address through the API.
 */
export function useCurrentAddress() {
  const trpc = useTRPC()
  const lookup = useMutation(trpc.location.reverseGeocode.mutationOptions())
  const [status, setStatus] = useState<CurrentAddressStatus>("idle")
  const [address, setAddress] = useState<ResolvedAddress | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function locate(): Promise<ResolvedAddress | null> {
    setError(null)
    setStatus("busy")
    try {
      const permission = await Location.requestForegroundPermissionsAsync()
      if (!permission.granted) {
        setError(
          permission.canAskAgain
            ? "Allow location to fill the address, or type it below."
            : "Location is off for ẸwáTrade. Turn it on in Settings, or type the address.",
        )
        setStatus("idle")
        return null
      }
      // No Google "Location Accuracy" prompt: use the location the phone
      // already has (GPS), then the last known position.
      const position =
        (await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
          mayShowUserSettingsDialog: false,
        }).catch(() => null)) ??
        (await Location.getLastKnownPositionAsync().catch(() => null))
      if (!position)
        throw new Error(
          "Turn on location on your phone, or type the address below.",
        )
      const result = await lookup.mutateAsync({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      })
      setAddress(result)
      setStatus("found")
      return result
    } catch (failure) {
      setError(
        failure instanceof Error && failure.message
          ? failure.message
          : "We couldn’t look up this location. Try again.",
      )
      setStatus("idle")
      return null
    }
  }

  function clear() {
    setAddress(null)
    setError(null)
    setStatus("idle")
  }

  return { address, clear, error, locate, status }
}
