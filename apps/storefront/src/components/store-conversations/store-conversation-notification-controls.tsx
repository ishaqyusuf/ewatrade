"use client"

import {
  type StoreConversationNotificationChannel,
  type StoreConversationNotificationContactProjection,
  type StoreConversationNotificationPreferenceProjection,
  prioritizeStoreConversationNotificationChannel,
} from "@ewatrade/service-commerce"
import { useEffect, useState } from "react"

type PreferenceResponse = {
  emailEligible: boolean
  preference: StoreConversationNotificationPreferenceProjection
}

async function parseNotificationResponse<T>(response: Response): Promise<T> {
  const body = (await response.json()) as T & { message?: string }
  if (!response.ok) {
    throw new Error(body.message ?? "Notification settings are unavailable.")
  }
  return body
}

export function StoreConversationNotificationControls({
  accountAccess,
  available,
  conversationId,
  publicToken,
}: {
  accountAccess: boolean
  available: boolean
  conversationId: string
  publicToken: string
}) {
  const [busy, setBusy] = useState(false)
  const [code, setCode] = useState("")
  const [consented, setConsented] = useState(false)
  const [contacts, setContacts] = useState<
    StoreConversationNotificationContactProjection[]
  >([])
  const [destination, setDestination] = useState("")
  const [expanded, setExpanded] = useState(false)
  const [emailEligible, setEmailEligible] = useState(false)
  const [loadFailed, setLoadFailed] = useState(false)
  const [loadingSettings, setLoadingSettings] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [preference, setPreference] =
    useState<StoreConversationNotificationPreferenceProjection | null>(null)
  const [verificationId, setVerificationId] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    if (!expanded) return
    const controller = new AbortController()
    setLoadFailed(false)
    setLoadingSettings(true)
    const retryHeaders = {
      "x-ewatrade-client-retry": String(reloadKey),
    }
    const request = accountAccess
      ? fetch("/api/store-conversations/notifications/preference", {
          cache: "no-store",
          headers: retryHeaders,
          signal: controller.signal,
        })
          .then(parseNotificationResponse<PreferenceResponse>)
          .then((result) => {
            setEmailEligible(result.emailEligible)
            setPreference(result.preference)
          })
      : fetch(
          `/api/store-conversations/notifications/contacts?${new URLSearchParams({ conversationId, publicToken })}`,
          {
            cache: "no-store",
            headers: retryHeaders,
            signal: controller.signal,
          },
        )
          .then(
            parseNotificationResponse<
              StoreConversationNotificationContactProjection[]
            >,
          )
          .then(setContacts)
    void request
      .then(() => {
        if (!controller.signal.aborted) setLoadingSettings(false)
      })
      .catch((error) => {
        if (controller.signal.aborted) return
        setLoadFailed(true)
        setLoadingSettings(false)
        setNotice(
          error instanceof Error
            ? error.message
            : "Notification settings are unavailable.",
        )
      })
    return () => controller.abort()
  }, [accountAccess, conversationId, expanded, publicToken, reloadKey])

  async function updatePreference(
    next: StoreConversationNotificationPreferenceProjection,
  ) {
    setBusy(true)
    setNotice(null)
    try {
      const result = await parseNotificationResponse<{
        preference: StoreConversationNotificationPreferenceProjection
      }>(
        await fetch("/api/store-conversations/notifications/preference", {
          body: JSON.stringify({
            clientOperationId: crypto.randomUUID(),
            ...next,
          }),
          headers: { "content-type": "application/json" },
          method: "POST",
        }),
      )
      setPreference(result.preference)
      setNotice("Notification preferences updated.")
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "Notification preferences could not be saved.",
      )
    } finally {
      setBusy(false)
    }
  }

  function preferNotificationChannel(
    channel: StoreConversationNotificationChannel,
  ) {
    if (!preference) return
    void updatePreference({
      ...preference,
      orderedChannels: prioritizeStoreConversationNotificationChannel({
        channel,
        orderedChannels: preference.orderedChannels,
      }),
    })
  }

  async function requestVerification() {
    if (!consented || !destination.trim()) return
    setBusy(true)
    setNotice(null)
    try {
      const result = await parseNotificationResponse<{
        contact: StoreConversationNotificationContactProjection
        verificationId: string
      }>(
        await fetch("/api/store-conversations/notifications/contacts", {
          body: JSON.stringify({
            channel: "email",
            clientOperationId: crypto.randomUUID(),
            consentAccepted: true,
            conversationId,
            destination: destination.trim(),
            publicToken,
          }),
          headers: { "content-type": "application/json" },
          method: "POST",
        }),
      )
      setVerificationId(result.verificationId)
      setNotice(
        `Verification code sent to ${result.contact.maskedDestination}.`,
      )
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "Verification could not be started.",
      )
    } finally {
      setBusy(false)
    }
  }

  async function confirmVerification() {
    if (!verificationId || code.trim().length !== 6) return
    setBusy(true)
    setNotice(null)
    try {
      const result = await parseNotificationResponse<{
        contact: StoreConversationNotificationContactProjection
      }>(
        await fetch("/api/store-conversations/notifications/confirm", {
          body: JSON.stringify({
            clientOperationId: crypto.randomUUID(),
            code: code.trim(),
            conversationId,
            publicToken,
            verificationId,
          }),
          headers: { "content-type": "application/json" },
          method: "POST",
        }),
      )
      setContacts((current) => [
        result.contact,
        ...current.filter(
          (contact) => contact.contactId !== result.contact.contactId,
        ),
      ])
      setCode("")
      setDestination("")
      setVerificationId(null)
      setNotice("Email notifications are ready for this Store conversation.")
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "The verification code could not be confirmed.",
      )
    } finally {
      setBusy(false)
    }
  }

  async function revokeContact(contactId: string) {
    setBusy(true)
    setNotice(null)
    try {
      await parseNotificationResponse(
        await fetch("/api/store-conversations/notifications/contacts", {
          body: JSON.stringify({
            clientOperationId: crypto.randomUUID(),
            confirmed: true,
            contactId,
            conversationId,
            publicToken,
          }),
          headers: { "content-type": "application/json" },
          method: "DELETE",
        }),
      )
      setContacts((current) =>
        current.map((contact) =>
          contact.contactId === contactId
            ? { ...contact, state: "revoked" }
            : contact,
        ),
      )
      setNotice("Notification email removed.")
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "Notification email could not be removed.",
      )
    } finally {
      setBusy(false)
    }
  }

  async function notifyWhenAvailable() {
    setBusy(true)
    setNotice(null)
    try {
      await parseNotificationResponse(
        await fetch("/api/store-conversations/notifications/reopening", {
          body: JSON.stringify({
            clientOperationId: crypto.randomUUID(),
            confirmed: true,
            conversationId,
            publicToken,
          }),
          headers: { "content-type": "application/json" },
          method: "POST",
        }),
      )
      setNotice("You will be notified when this Store chat is available.")
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "Reopening notification could not be saved.",
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="grid gap-2" aria-label="Conversation notifications">
      {!available ? (
        <button
          className="min-h-11 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          disabled={busy}
          onClick={() => void notifyWhenAvailable()}
          type="button"
        >
          Notify me when available
        </button>
      ) : null}

      <button
        aria-expanded={expanded}
        className="flex min-h-11 items-center gap-3 rounded-xl px-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={() => setExpanded((current) => !current)}
        type="button"
      >
        <span aria-hidden="true" className="text-base">
          ◌
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">
            Response notifications
          </span>
          <span className="block text-xs leading-5 text-muted-foreground">
            {accountAccess
              ? "Choose how EwaTrade alerts you after unread replies."
              : "Optionally verify an email for unread Store replies."}
          </span>
        </span>
        <span aria-hidden="true" className="text-muted-foreground">
          {expanded ? "⌃" : "⌄"}
        </span>
      </button>

      {notice ? (
        <div className="flex min-h-11 items-center justify-between gap-3">
          <output className="text-xs leading-5 text-muted-foreground">
            {notice}
          </output>
          {expanded && loadFailed ? (
            <button
              className="min-h-11 shrink-0 px-2 text-xs font-semibold"
              onClick={() => {
                setNotice(null)
                setReloadKey((current) => current + 1)
              }}
              type="button"
            >
              Retry
            </button>
          ) : null}
        </div>
      ) : null}

      {expanded && loadingSettings ? (
        <output className="text-xs leading-5 text-muted-foreground">
          Loading notification settings…
        </output>
      ) : null}

      {expanded && accountAccess && preference ? (
        <div className="grid gap-3 px-1 pb-2">
          <NotificationSwitch
            checked={preference.unreadEnabled}
            disabled={busy}
            label="Unread replies"
            onChange={(unreadEnabled) =>
              void updatePreference({ ...preference, unreadEnabled })
            }
          >
            Alert me when a Store reply remains unread.
          </NotificationSwitch>
          <NotificationSwitch
            checked={preference.reopeningEnabled}
            disabled={busy}
            label="Store reopening"
            onChange={(reopeningEnabled) =>
              void updatePreference({ ...preference, reopeningEnabled })
            }
          >
            Alert me after a Store chat becomes available again.
          </NotificationSwitch>
          <fieldset className="grid gap-2">
            <legend className="text-sm">Try this channel first</legend>
            <div className="grid grid-cols-3 gap-2">
              <ChannelPreferenceButton
                active={preference.orderedChannels[0] === "push"}
                disabled={busy}
                label="App"
                onSelect={() => preferNotificationChannel("push")}
              />
              <ChannelPreferenceButton
                active={preference.orderedChannels[0] === "email"}
                disabled={busy || !emailEligible}
                label="Email"
                onSelect={() => preferNotificationChannel("email")}
              />
              <ChannelPreferenceButton
                active={preference.orderedChannels[0] === "whatsapp"}
                disabled
                label="WhatsApp"
                onSelect={() => preferNotificationChannel("whatsapp")}
              />
            </div>
          </fieldset>
          <p className="text-xs leading-5 text-muted-foreground">
            {!emailEligible
              ? "Verify your account email before choosing Email. "
              : "If your first choice is unavailable, EwaTrade safely tries the next eligible channel. "}
            WhatsApp remains unavailable until current Store policy and provider
            readiness allow it.
          </p>
        </div>
      ) : null}

      {expanded && !accountAccess ? (
        <div className="grid gap-3 px-1 pb-2">
          {contacts.map((contact) => (
            <div
              className="flex min-h-11 items-center gap-3"
              key={contact.contactId}
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm">{contact.maskedDestination}</p>
                <p className="text-xs capitalize text-muted-foreground">
                  {contact.state}
                </p>
              </div>
              {contact.state !== "revoked" ? (
                <button
                  className="min-h-11 px-2 text-sm font-semibold text-destructive"
                  disabled={busy}
                  onClick={() => void revokeContact(contact.contactId)}
                  type="button"
                >
                  Remove
                </button>
              ) : null}
            </div>
          ))}

          {!verificationId ? (
            <>
              <input
                aria-label="Notification email"
                autoComplete="email"
                className="min-h-11 rounded-xl bg-muted px-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring"
                disabled={busy}
                inputMode="email"
                onChange={(event) => setDestination(event.target.value)}
                placeholder="Email address"
                type="email"
                value={destination}
              />
              <label className="flex min-h-11 cursor-pointer items-start gap-3 text-xs leading-5 text-muted-foreground">
                <input
                  checked={consented}
                  className="mt-1 size-4 accent-primary"
                  onChange={(event) => setConsented(event.target.checked)}
                  type="checkbox"
                />
                <span>
                  Use this email only for this Store conversation’s response and
                  reopening alerts. This is not marketing consent.
                </span>
              </label>
              <button
                className="min-h-11 rounded-full bg-foreground px-4 text-sm font-semibold text-background disabled:opacity-50"
                disabled={busy || !consented || !destination.trim()}
                onClick={() => void requestVerification()}
                type="button"
              >
                Send verification code
              </button>
            </>
          ) : (
            <>
              <input
                aria-label="Six digit verification code"
                className="min-h-11 rounded-xl bg-muted px-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring"
                disabled={busy}
                inputMode="numeric"
                maxLength={6}
                onChange={(event) => setCode(event.target.value)}
                placeholder="6-digit code"
                value={code}
              />
              <div className="flex gap-2">
                <button
                  className="min-h-11 flex-1 rounded-full border border-border px-4 text-sm font-semibold"
                  disabled={busy}
                  onClick={() => {
                    setCode("")
                    setVerificationId(null)
                  }}
                  type="button"
                >
                  Cancel
                </button>
                <button
                  className="min-h-11 flex-1 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50"
                  disabled={busy || code.trim().length !== 6}
                  onClick={() => void confirmVerification()}
                  type="button"
                >
                  Verify email
                </button>
              </div>
            </>
          )}
          <p className="text-xs leading-5 text-muted-foreground">
            WhatsApp verification stays unavailable until the Store and policy
            checks allow it.
          </p>
        </div>
      ) : null}
    </section>
  )
}

function ChannelPreferenceButton({
  active,
  disabled,
  label,
  onSelect,
}: {
  active: boolean
  disabled: boolean
  label: string
  onSelect(): void
}) {
  return (
    <button
      aria-pressed={active}
      className={`min-h-11 rounded-full border px-2 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40 ${active ? "border-primary bg-primary text-primary-foreground" : "border-border"}`}
      disabled={disabled}
      onClick={onSelect}
      type="button"
    >
      {label}
    </button>
  )
}

function NotificationSwitch({
  checked,
  children,
  disabled,
  label,
  onChange,
}: {
  checked: boolean
  children: React.ReactNode
  disabled: boolean
  label: string
  onChange(checked: boolean): void
}) {
  return (
    <div className="flex min-h-11 items-center gap-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm">{label}</p>
        <p className="text-xs leading-5 text-muted-foreground">{children}</p>
      </div>
      <button
        aria-checked={checked}
        aria-label={label}
        className={`relative h-7 w-12 shrink-0 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${checked ? "bg-primary" : "bg-muted"}`}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        role="switch"
        type="button"
      >
        <span
          aria-hidden="true"
          className={`absolute top-1 size-5 rounded-full bg-background transition-transform ${checked ? "translate-x-6" : "translate-x-1"}`}
        />
      </button>
    </div>
  )
}
