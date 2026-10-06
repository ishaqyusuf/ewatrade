"use client"
import { FormFeedback } from "@/components/forms/form-feedback"

import { clearDashboardDataCache } from "@/trpc/client"
import { DropdownMenuItem } from "@ewatrade/ui"
import { Logout01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useRouter } from "next/navigation"
import { type MouseEvent, useState } from "react"

type ErrorResponse = { error?: string }

export function SignOut() {
  const router = useRouter()
  const [isSigningOut, setIsSigningOut] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSignOut(event: MouseEvent) {
    event.preventDefault()
    if (isSigningOut) return

    setIsSigningOut(true)
    setError(null)

    try {
      const response = await fetch("/api/auth/logout", { method: "POST" })
      if (!response.ok) {
        const body = (await response
          .json()
          .catch(() => null)) as ErrorResponse | null
        throw new Error(body?.error || "Could not sign out. Please try again.")
      }
      clearDashboardDataCache()
      router.push("/login")
    } catch (signOutError) {
      setError(
        signOutError instanceof Error
          ? signOutError.message
          : "Could not sign out. Please try again.",
      )
    } finally {
      setIsSigningOut(false)
    }
  }

  return (
    <>
      <DropdownMenuItem
        closeOnClick={false}
        disabled={isSigningOut}
        className="rounded-none px-2 py-1.5 font-normal"
        onClick={handleSignOut}
      >
        <HugeiconsIcon icon={Logout01Icon} className="size-4" />
        {isSigningOut ? "Signing out…" : "Sign out"}
      </DropdownMenuItem>
      {error ? (
        <FormFeedback appearance="dashboard">{error}</FormFeedback>
      ) : null}
    </>
  )
}
