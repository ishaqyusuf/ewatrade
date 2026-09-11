"use client"

import type { StoreConversationAccountDeviceProjection } from "@ewatrade/service-commerce"
import { useEffect, useRef, useState } from "react"
import { StoreConversationAccountDialog } from "./store-conversation-account-dialog"

type Account = { user: { email: string; id: string; name: string } }
type PrivacyStatus = {
  id: string
  outcomes: Array<{ classification: string; status: string }>
  status: string
}

const deviceDate = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
})

async function responseJson<T>(response: Response) {
  const body = (await response.json()) as T & { message?: string }
  if (!response.ok) throw new Error(body.message ?? "Request failed.")
  return body
}

export function StoreConversationAccountSecurity({
  conversationId,
  publicToken,
}: {
  conversationId: string
  publicToken: string
}) {
  const [account, setAccount] = useState<Account | null>(null)
  const [open, setOpen] = useState(false)
  const [devices, setDevices] = useState<
    StoreConversationAccountDeviceProjection[] | null
  >(null)
  const [busyDeviceId, setBusyDeviceId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [privacyBusy, setPrivacyBusy] = useState(false)
  const [privacyStatus, setPrivacyStatus] = useState<PrivacyStatus | null>(null)
  const operations = useRef(new Map<string, string>())
  const privacyOperation = useRef(`privacy-${crypto.randomUUID()}`)

  useEffect(() => {
    const controller = new AbortController()
    void fetch("/api/store-conversations/account/session", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then((response) => responseJson<{ account: Account | null }>(response))
      .then((result) => setAccount(result.account))
      .catch(() => undefined)
    return () => controller.abort()
  }, [])

  const loadDevices = async () => {
    setError(null)
    try {
      setDevices(
        await responseJson<StoreConversationAccountDeviceProjection[]>(
          await fetch("/api/store-conversations/account/devices", {
            cache: "no-store",
          }),
        ),
      )
    } catch (deviceError) {
      setError(
        deviceError instanceof Error
          ? deviceError.message
          : "Linked devices could not be loaded.",
      )
    }
  }

  const revoke = async (device: StoreConversationAccountDeviceProjection) => {
    if (
      !window.confirm(
        device.current
          ? "Remove guest access from this browser? Your signed-in account and conversation remain available."
          : "Remove guest access from this device? Your account and conversation remain available.",
      )
    )
      return
    const clientOperationId =
      operations.current.get(device.deviceId) ??
      `account-device-${crypto.randomUUID()}`
    operations.current.set(device.deviceId, clientOperationId)
    setBusyDeviceId(device.deviceId)
    setError(null)
    try {
      await responseJson(
        await fetch("/api/store-conversations/account/devices", {
          body: JSON.stringify({
            clientOperationId,
            confirmed: true,
            deviceId: device.deviceId,
          }),
          headers: { "content-type": "application/json" },
          method: "POST",
        }),
      )
      operations.current.delete(device.deviceId)
      if (device.current) {
        window.location.reload()
        return
      }
      await loadDevices()
    } catch (revokeError) {
      setError(
        revokeError instanceof Error
          ? revokeError.message
          : "This device could not be removed.",
      )
    } finally {
      setBusyDeviceId(null)
    }
  }

  const refreshPrivacy = async (privacyRequestId: string) => {
    const query = new URLSearchParams({
      access: "account",
      conversationId,
      privacyRequestId,
      publicToken,
    })
    setPrivacyStatus(
      await responseJson<PrivacyStatus>(
        await fetch(`/api/store-conversations/privacy?${query}`, {
          cache: "no-store",
        }),
      ),
    )
  }

  const requestPrivacyRemoval = async () => {
    if (
      !window.confirm(
        "Remove eligible chat presentation data, generic attachments and notification contacts? Required commercial, clinical and audit records will be retained and reported.",
      )
    )
      return
    setError(null)
    setPrivacyBusy(true)
    try {
      const request = await responseJson<PrivacyStatus>(
        await fetch("/api/store-conversations/privacy", {
          body: JSON.stringify({
            access: "account",
            classifications: [
              "presentation_message",
              "generic_media",
              "verified_contact",
              "commercial_record",
              "clinical_record",
              "immutable_audit",
            ],
            clientOperationId: privacyOperation.current,
            conversationId,
            publicToken,
          }),
          headers: { "content-type": "application/json" },
          method: "POST",
        }),
      )
      setPrivacyStatus(request)
    } catch (privacyError) {
      setError(
        privacyError instanceof Error
          ? privacyError.message
          : "Privacy request could not be submitted.",
      )
    } finally {
      setPrivacyBusy(false)
    }
  }

  if (!account) return null

  return (
    <>
      <button
        aria-label="Customer Account security"
        className="grid size-11 place-items-center rounded-full border border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={() => {
          setOpen(true)
          void loadDevices()
        }}
        title="Customer Account security"
        type="button"
      >
        <svg
          aria-hidden="true"
          className="size-5"
          fill="none"
          viewBox="0 0 24 24"
        >
          <path
            d="M12 3 5 6v5c0 4.7 2.9 8.2 7 10 4.1-1.8 7-5.3 7-10V6l-7-3Z"
            stroke="currentColor"
            strokeLinejoin="round"
            strokeWidth="1.7"
          />
          <path
            d="m9 12 2 2 4-4"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.7"
          />
        </svg>
      </button>

      <StoreConversationAccountDialog
        onClose={() => setOpen(false)}
        open={open}
        title="Linked devices"
      >
        <div className="grid gap-4">
          <p className="text-sm leading-6 text-muted-foreground">
            These guest browsers and app installations proved access to a
            conversation linked to {account.user.name}. Removing one does not
            delete the conversation or Customer Account.
          </p>
          <div className="grid gap-3 rounded-2xl bg-muted/60 p-4">
            <div className="grid gap-1">
              <h3 className="font-semibold">Conversation privacy</h3>
              <p className="text-sm leading-5 text-muted-foreground">
                Remove eligible presentation data while required records stay
                protected under their own retention rules.
              </p>
            </div>
            {privacyStatus ? (
              <div
                aria-live="polite"
                className="grid gap-2 text-sm text-muted-foreground"
              >
                <p className="font-medium capitalize text-foreground">
                  Request {privacyStatus.status}
                </p>
                {privacyStatus.outcomes.length > 0 ? (
                  <ul className="grid gap-1">
                    {privacyStatus.outcomes.map((outcome) => (
                      <li key={outcome.classification}>
                        {outcome.classification.replaceAll("_", " ")}:{" "}
                        {outcome.status.replaceAll("_", " ")}
                      </li>
                    ))}
                  </ul>
                ) : null}
                <button
                  className="min-h-11 justify-self-start rounded-full border border-border px-4 font-semibold text-foreground"
                  onClick={() => void refreshPrivacy(privacyStatus.id)}
                  type="button"
                >
                  Refresh status
                </button>
              </div>
            ) : (
              <button
                className="min-h-11 justify-self-start rounded-full border border-border px-4 font-semibold text-foreground disabled:opacity-60"
                disabled={privacyBusy}
                onClick={() => void requestPrivacyRemoval()}
                type="button"
              >
                {privacyBusy ? "Submitting…" : "Request data removal"}
              </button>
            )}
          </div>
          {error ? (
            <div
              aria-live="polite"
              className="grid gap-2 rounded-xl bg-destructive/10 p-3 text-sm text-destructive"
            >
              <p>{error}</p>
              <button
                className="min-h-11 justify-self-start rounded-full border border-destructive/30 px-4 font-semibold"
                onClick={() => void loadDevices()}
                type="button"
              >
                Retry
              </button>
            </div>
          ) : null}
          {!devices && !error ? (
            <p className="py-6 text-center text-muted-foreground">
              Loading linked devices…
            </p>
          ) : null}
          {devices?.length === 0 ? (
            <p className="py-6 text-center text-muted-foreground">
              No guest devices are linked to these conversations.
            </p>
          ) : null}
          {devices?.map((device) => (
            <div
              className="flex min-h-20 items-center gap-3 rounded-2xl bg-muted/60 px-4 py-3"
              key={device.deviceId}
            >
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-background font-semibold uppercase">
                {device.purpose === "mobile" ? "M" : "W"}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold capitalize">
                  {device.purpose} device
                  {device.current ? " · This browser" : ""}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {device.status} · Last used{" "}
                  {deviceDate.format(new Date(device.lastUsedAt))}
                </span>
              </span>
              {device.status === "active" ? (
                <button
                  className="min-h-11 rounded-full px-3 font-semibold text-destructive hover:bg-destructive/10 disabled:opacity-60"
                  disabled={busyDeviceId !== null}
                  onClick={() => void revoke(device)}
                  type="button"
                >
                  {busyDeviceId === device.deviceId ? "Removing…" : "Remove"}
                </button>
              ) : null}
            </div>
          ))}
        </div>
      </StoreConversationAccountDialog>
    </>
  )
}
