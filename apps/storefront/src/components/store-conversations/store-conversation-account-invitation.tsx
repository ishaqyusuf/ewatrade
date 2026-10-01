"use client"

import {
  type StoreConversationAccountCandidateListProjection,
  type StoreConversationAccountInvitationProjection,
  canSelectStoreConversationAccountCandidate,
} from "@ewatrade/service-commerce"
import { useEffect, useMemo, useRef, useState } from "react"
import { StoreConversationAccountDialog } from "./store-conversation-account-dialog"

type Account = { user: { email: string; id: string; name: string } }
type AuthMode = "sign_in" | "sign_up"
type LegalPublication = {
  effective: boolean
  signupAvailable: boolean
  version: string | null
  effectiveDate: string | null
}
const legalOrigin =
  process.env.NODE_ENV === "production"
    ? "https://www.ewatrade.com"
    : "https://ewatrade.localhost"

async function responseJson<T>(response: Response) {
  const body = (await response.json()) as T & { message?: string }
  if (!response.ok) throw new Error(body.message ?? "Request failed.")
  return body
}

export function StoreConversationAccountInvitation({
  conversationId,
  invitation,
  messageId,
  onRefresh,
  publicToken,
}: {
  conversationId: string
  invitation: StoreConversationAccountInvitationProjection
  messageId: string
  onRefresh: () => Promise<void>
  publicToken: string
}) {
  const [account, setAccount] = useState<Account | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [mode, setMode] = useState<AuthMode>("sign_in")
  const [phase, setPhase] = useState<"auth" | "review">("auth")
  const [email, setEmail] = useState("")
  const [name, setName] = useState("")
  const [password, setPassword] = useState("")
  const [legalPublication, setLegalPublication] =
    useState<LegalPublication | null>(null)
  const [acceptedTerms, setAcceptedTerms] = useState(false)
  const [acknowledgedPrivacyNotice, setAcknowledPrivacyNotice] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [candidates, setCandidates] =
    useState<StoreConversationAccountCandidateListProjection | null>(null)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const dismissOperation = useRef<string | null>(null)
  const linkOperation = useRef<{ id: string; key: string } | null>(null)
  const selected = useMemo(() => new Set(selectedIds), [selectedIds])

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

  useEffect(() => {
    if (!dialogOpen || mode !== "sign_up" || account) return
    const controller = new AbortController()
    void fetch("/api/store-conversations/account/legal-publication", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then((response) => responseJson<LegalPublication>(response))
      .then((publication) => {
        if (controller.signal.aborted) return
        setLegalPublication(publication)
        setAcceptedTerms(false)
        setAcknowledPrivacyNotice(false)
      })
      .catch(() => {
        if (!controller.signal.aborted) setLegalPublication(null)
      })
    return () => controller.abort()
  }, [account, dialogOpen, mode])

  const loadCandidates = async () => {
    setBusy(true)
    setError(null)
    try {
      const result =
        await responseJson<StoreConversationAccountCandidateListProjection>(
          await fetch("/api/store-conversations/account/candidates", {
            cache: "no-store",
          }),
        )
      setCandidates(result)
      setSelectedIds(
        result.items
          .filter(
            (candidate) =>
              canSelectStoreConversationAccountCandidate(candidate) &&
              candidate.conversationId === conversationId,
          )
          .map((candidate) => candidate.conversationId),
      )
      setPhase("review")
    } catch (candidateError) {
      setError(
        candidateError instanceof Error
          ? candidateError.message
          : "Conversations could not be loaded.",
      )
    } finally {
      setBusy(false)
    }
  }

  const open = (nextMode: AuthMode) => {
    setMode(nextMode)
    setLegalPublication(null)
    setAcceptedTerms(false)
    setAcknowledPrivacyNotice(false)
    setError(null)
    setDialogOpen(true)
    if (account) void loadCandidates()
    else setPhase("auth")
  }

  const authenticate = async () => {
    if (mode === "sign_up") {
      if (!legalPublication?.signupAvailable) {
        setError(
          "Account creation is paused until the current policies are available.",
        )
        return
      }
      if (
        legalPublication.effective &&
        (!legalPublication.version ||
          !acceptedTerms ||
          !acknowledgedPrivacyNotice)
      ) {
        setError(
          "Review the Terms and Privacy Notice before creating an account.",
        )
        return
      }
    }
    setBusy(true)
    setError(null)
    try {
      const result = await responseJson<{ account: Account }>(
        await fetch("/api/store-conversations/account/auth", {
          body: JSON.stringify({
            email,
            mode,
            name,
            password,
            ...(mode === "sign_up" && legalPublication?.effective
              ? {
                  legalVersion: legalPublication.version,
                  acceptedTerms: true,
                  acknowledgedPrivacyNotice: true,
                }
              : {}),
          }),
          headers: { "content-type": "application/json" },
          method: "POST",
        }),
      )
      setAccount(result.account)
      setPassword("")
      await loadCandidates()
    } catch (authError) {
      setError(
        authError instanceof Error
          ? authError.message
          : "Your account could not be opened.",
      )
      setBusy(false)
    }
  }

  const link = async () => {
    if (selectedIds.length === 0) return
    const key = [...selectedIds].sort().join(":")
    const operation =
      linkOperation.current?.key === key
        ? linkOperation.current
        : { id: `account-link-${crypto.randomUUID()}`, key }
    linkOperation.current = operation
    setBusy(true)
    setError(null)
    try {
      await responseJson(
        await fetch("/api/store-conversations/account/link", {
          body: JSON.stringify({
            clientOperationId: operation.id,
            confirmed: true,
            conversationIds: selectedIds,
          }),
          headers: { "content-type": "application/json" },
          method: "POST",
        }),
      )
      linkOperation.current = null
      await onRefresh()
      setDialogOpen(false)
    } catch (linkError) {
      setError(
        linkError instanceof Error
          ? linkError.message
          : "These conversations could not be linked.",
      )
    } finally {
      setBusy(false)
    }
  }

  const dismiss = async () => {
    dismissOperation.current ??= `account-dismiss-${crypto.randomUUID()}`
    setError(null)
    try {
      await responseJson(
        await fetch("/api/store-conversations/account/invitations/dismiss", {
          body: JSON.stringify({
            clientOperationId: dismissOperation.current,
            conversationId,
            invitationId: invitation.id,
            messageId,
            publicToken,
          }),
          headers: { "content-type": "application/json" },
          method: "POST",
        }),
      )
      dismissOperation.current = null
      await onRefresh()
    } catch (dismissError) {
      setError(
        dismissError instanceof Error
          ? dismissError.message
          : "This invitation could not be dismissed.",
      )
    }
  }

  if (invitation.state !== "offered") {
    return (
      <article className="mr-auto grid max-w-[88%] gap-1 rounded-2xl rounded-bl-md border border-border bg-card px-4 py-3 text-sm">
        <p className="font-semibold">{invitation.title}</p>
        <p className="leading-6 text-muted-foreground">{invitation.body}</p>
      </article>
    )
  }

  return (
    <>
      <article className="mr-auto grid max-w-[92%] gap-3 rounded-2xl rounded-bl-md border border-border bg-card px-4 py-4 text-sm">
        <div className="grid size-10 place-items-center rounded-full bg-primary/10 text-primary">
          <span aria-hidden="true" className="text-lg">
            ✓
          </span>
        </div>
        <div className="grid gap-1">
          <p className="font-semibold">{invitation.title}</p>
          <p className="leading-6 text-muted-foreground">{invitation.body}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            className="min-h-11 rounded-full bg-primary px-4 font-semibold text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => open("sign_up")}
            type="button"
          >
            {account ? "Review conversations" : "Create account"}
          </button>
          {!account ? (
            <button
              className="min-h-11 rounded-full bg-muted px-4 font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => open("sign_in")}
              type="button"
            >
              Sign in
            </button>
          ) : null}
          <button
            className="min-h-11 px-3 font-semibold text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => void dismiss()}
            type="button"
          >
            Not now
          </button>
        </div>
        {error && !dialogOpen ? (
          <p aria-live="polite" className="text-xs text-destructive">
            {error}
          </p>
        ) : null}
      </article>

      <StoreConversationAccountDialog
        onClose={() => {
          setPassword("")
          setDialogOpen(false)
        }}
        open={dialogOpen}
        title={phase === "auth" ? "Customer account" : "Link conversations"}
      >
        {phase === "auth" ? (
          <form
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault()
              void authenticate()
            }}
          >
            <div className="grid gap-1">
              <h3 className="text-xl font-semibold">
                {mode === "sign_up" ? "Create your account" : "Welcome back"}
              </h3>
              <p className="text-sm leading-6 text-muted-foreground">
                Your guest chat remains available. Linking happens only after
                you review and confirm it.
              </p>
            </div>
            {error ? (
              <p
                aria-live="polite"
                className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive"
              >
                {error}
              </p>
            ) : null}
            {mode === "sign_up" ? (
              <label className="grid gap-1.5 text-sm font-medium">
                Name
                <input
                  autoComplete="name"
                  className="min-h-12 rounded-xl border border-border bg-background px-3 outline-none focus:ring-2 focus:ring-ring"
                  onChange={(event) => setName(event.target.value)}
                  required
                  value={name}
                />
              </label>
            ) : null}
            <label className="grid gap-1.5 text-sm font-medium">
              Email
              <input
                autoComplete="email"
                className="min-h-12 rounded-xl border border-border bg-background px-3 outline-none focus:ring-2 focus:ring-ring"
                onChange={(event) => setEmail(event.target.value)}
                required
                type="email"
                value={email}
              />
            </label>
            <label className="grid gap-1.5 text-sm font-medium">
              Password
              <input
                autoComplete={
                  mode === "sign_up" ? "new-password" : "current-password"
                }
                className="min-h-12 rounded-xl border border-border bg-background px-3 outline-none focus:ring-2 focus:ring-ring"
                minLength={8}
                onChange={(event) => setPassword(event.target.value)}
                required
                type="password"
                value={password}
              />
            </label>
            {mode === "sign_up" ? (
              <div className="grid gap-3 border-t border-border pt-4 text-sm">
                {!legalPublication ? (
                  <p className="text-muted-foreground">
                    Checking the current Terms and Privacy Notice…
                  </p>
                ) : legalPublication.effective ? (
                  <>
                    <p className="text-muted-foreground">
                      Version {legalPublication.version} · Effective{" "}
                      {legalPublication.effectiveDate}
                    </p>
                    <label className="flex items-start gap-3">
                      <input
                        checked={acceptedTerms}
                        className="mt-1"
                        onChange={(event) =>
                          setAcceptedTerms(event.target.checked)
                        }
                        type="checkbox"
                      />
                      <span>
                        I agree to the{" "}
                        <a
                          className="underline"
                          href={`${legalOrigin}/terms`}
                          rel="noreferrer"
                          target="_blank"
                        >
                          Terms of Service
                        </a>
                        .
                      </span>
                    </label>
                    <label className="flex items-start gap-3">
                      <input
                        checked={acknowledgedPrivacyNotice}
                        className="mt-1"
                        onChange={(event) =>
                          setAcknowledPrivacyNotice(event.target.checked)
                        }
                        type="checkbox"
                      />
                      <span>
                        I acknowledge the{" "}
                        <a
                          className="underline"
                          href={`${legalOrigin}/privacy`}
                          rel="noreferrer"
                          target="_blank"
                        >
                          Privacy Notice
                        </a>
                        .
                      </span>
                    </label>
                    <p className="text-xs text-muted-foreground">
                      Privacy acknowledgment is not consent to optional
                      marketing.
                    </p>
                  </>
                ) : (
                  <p className="text-muted-foreground">
                    {legalPublication.signupAvailable
                      ? "The policies are under review. No legal acceptance is recorded in this test environment."
                      : "Account creation is paused until the Terms and Privacy Notice are effective."}
                  </p>
                )}
              </div>
            ) : null}
            <button
              className="min-h-12 rounded-xl bg-primary px-4 font-semibold text-primary-foreground disabled:opacity-60"
              disabled={
                busy ||
                (mode === "sign_up" &&
                  (!legalPublication?.signupAvailable ||
                    (legalPublication.effective &&
                      (!acceptedTerms || !acknowledgedPrivacyNotice))))
              }
              type="submit"
            >
              {busy
                ? "Opening account…"
                : mode === "sign_up"
                  ? "Create account"
                  : "Sign in"}
            </button>
            <button
              className="min-h-11 font-semibold"
              onClick={() => {
                setLegalPublication(null)
                setAcceptedTerms(false)
                setAcknowledPrivacyNotice(false)
                setMode(mode === "sign_up" ? "sign_in" : "sign_up")
              }}
              type="button"
            >
              {mode === "sign_up"
                ? "I already have an account"
                : "Create a new account"}
            </button>
          </form>
        ) : (
          <div className="grid gap-4">
            <div className="grid gap-1">
              <h3 className="text-xl font-semibold">Choose what to link</h3>
              <p className="text-sm leading-6 text-muted-foreground">
                Only conversations already available in this browser appear.
                Nothing is matched by email or phone.
              </p>
            </div>
            {error ? (
              <p
                aria-live="polite"
                className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive"
              >
                {error}
              </p>
            ) : null}
            {busy && !candidates ? (
              <p className="py-6 text-center text-muted-foreground">
                Loading conversations…
              </p>
            ) : null}
            {candidates?.items.map((candidate) => {
              const checked = selected.has(candidate.conversationId)
              const selectable =
                canSelectStoreConversationAccountCandidate(candidate)
              return (
                <label
                  className="flex min-h-14 items-center gap-3 rounded-xl border border-border px-4 py-3 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring"
                  key={candidate.conversationId}
                >
                  <input
                    checked={checked}
                    className="size-5 accent-primary"
                    disabled={!selectable}
                    onChange={() => {
                      linkOperation.current = null
                      setSelectedIds((current) =>
                        current.includes(candidate.conversationId)
                          ? current.filter(
                              (id) => id !== candidate.conversationId,
                            )
                          : [...current, candidate.conversationId],
                      )
                    }}
                    type="checkbox"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">
                      {candidate.storeName}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {candidate.linked
                        ? "Already linked"
                        : candidate.state === "restricted"
                          ? "Linked to another account"
                          : "Available in this browser"}
                    </span>
                  </span>
                </label>
              )
            })}
            <button
              className="min-h-12 rounded-xl bg-primary px-4 font-semibold text-primary-foreground disabled:opacity-60"
              disabled={busy || selectedIds.length === 0}
              onClick={() => void link()}
              type="button"
            >
              {busy ? "Linking conversations…" : "Link selected conversations"}
            </button>
            <button
              className="min-h-11 font-semibold"
              onClick={() => setDialogOpen(false)}
              type="button"
            >
              Continue as guest
            </button>
          </div>
        )}
      </StoreConversationAccountDialog>
    </>
  )
}
