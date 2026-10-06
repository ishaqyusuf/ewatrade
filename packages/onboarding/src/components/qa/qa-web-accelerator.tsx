"use client"

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Field,
  FieldDescription,
  FieldLabel,
  Input,
} from "@ewatrade/ui"
import {
  Building02Icon,
  Search01Icon,
  UserGroupIcon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react"
import {
  type QaWebStatus,
  statusForQaWebCapability,
  statusForQaWebRevalidation,
} from "../../lib/qa-web-recovery"

const CONTRACT_VERSION = 1

type QaAuthorization = {
  expiresAt: string
  qaDomain: string
  testerIdentity: string
}

type QaProfile = {
  business: { id: string; name: string; slug: string }
  identity: { email: string; id: string; name: string }
  membership: { role: string }
  profileReference: string
  store: { id: string; name: string; slug: string }
}

type QaWebContextValue = {
  authorization: QaAuthorization | null
  authorize(input: { qaDomain: string }): Promise<void>
  error: string | null
  profiles: QaProfile[]
  refreshProfiles(): Promise<void>
  retry(): Promise<void>
  revoke(): Promise<void>
  selectProfile(profileReference: string): Promise<void>
  selectingReference: string | null
  status: QaWebStatus
}

const QaWebContext = createContext<QaWebContextValue | null>(null)

async function readJson<T>(response: Response): Promise<T> {
  const body = (await response.json().catch(() => ({}))) as T & {
    message?: string
  }
  if (!response.ok) {
    throw new Error(body.message || "QA access is unavailable.")
  }
  return body
}

export function QaWebAccelerator({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<QaWebStatus>("checking")
  const [authorization, setAuthorization] = useState<QaAuthorization | null>(
    null,
  )
  const [profiles, setProfiles] = useState<QaProfile[]>([])
  const [error, setError] = useState<string | null>(null)
  const [selectingReference, setSelectingReference] = useState<string | null>(
    null,
  )

  const refreshProfiles = useCallback(async () => {
    const response = await fetch("/api/qa-access/profiles", {
      cache: "no-store",
      credentials: "same-origin",
    })
    const body = await readJson<{ profiles: QaProfile[] }>(response)
    setProfiles(body.profiles)
  }, [])

  const bootstrap = useCallback(async () => {
    setStatus("checking")
    setError(null)
    try {
      const capabilityResponse = await fetch(
        `/api/qa-access/capability?contractVersion=${CONTRACT_VERSION}`,
        { cache: "no-store" },
      )
      const capability = capabilityResponse.ok
        ? ((await capabilityResponse.json().catch(() => null)) as {
            available: boolean
            category?: string
          } | null)
        : null
      const capabilityStatus = statusForQaWebCapability(capability)
      if (capabilityStatus !== "revalidate") {
        setStatus(capabilityStatus)
        return
      }

      const response = await fetch("/api/qa-access/revalidate", {
        cache: "no-store",
        credentials: "same-origin",
      })
      const revalidationStatus = statusForQaWebRevalidation(response.status)
      if (revalidationStatus !== "authorized") {
        setAuthorization(null)
        setProfiles([])
        setStatus(revalidationStatus)
        return
      }
      const currentAuthorization = await readJson<QaAuthorization>(response)
      setAuthorization(currentAuthorization)
      setStatus("authorized")
      await refreshProfiles()
    } catch (bootstrapError) {
      setError(
        bootstrapError instanceof Error
          ? bootstrapError.message
          : "QA access is unavailable.",
      )
      setStatus("network_unavailable")
    }
  }, [refreshProfiles])

  useEffect(() => {
    let active = true
    async function runBootstrap() {
      try {
        await bootstrap()
      } catch {
        // bootstrap owns its safe recovery state.
      }
    }
    if (active) void runBootstrap()
    return () => {
      active = false
    }
  }, [bootstrap])

  useEffect(() => {
    if (status !== "authorized") return
    let active = true
    const channel =
      typeof BroadcastChannel === "undefined"
        ? null
        : new BroadcastChannel("ewatrade-qa-access-v1")

    async function revalidate() {
      const response = await fetch("/api/qa-access/revalidate", {
        cache: "no-store",
        credentials: "same-origin",
      }).catch(() => null)
      if (!active || response?.ok) return
      const nextStatus = statusForQaWebRevalidation(response?.status ?? null)
      if (nextStatus !== "authorized") {
        setAuthorization(null)
        setProfiles([])
        setStatus(nextStatus)
        if (!response) {
          setError(
            "Reconnect to this preview server, then retry QA authorization.",
          )
        }
      }
    }
    const onFocus = () => void revalidate()
    const onVisibility = () => {
      if (document.visibilityState === "visible") void revalidate()
    }
    const interval = window.setInterval(() => void revalidate(), 60_000)
    channel?.addEventListener("message", (event) => {
      if (event.data !== "revoked") return
      setAuthorization(null)
      setProfiles([])
      setStatus("needs_authorization")
    })
    window.addEventListener("focus", onFocus)
    document.addEventListener("visibilitychange", onVisibility)
    return () => {
      active = false
      window.clearInterval(interval)
      channel?.close()
      window.removeEventListener("focus", onFocus)
      document.removeEventListener("visibilitychange", onVisibility)
    }
  }, [status])

  const authorize = useCallback(
    async (input: { qaDomain: string }) => {
      setError(null)
      const response = await fetch("/api/qa-access/exchange", {
        body: JSON.stringify({ ...input, contractVersion: CONTRACT_VERSION }),
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        method: "POST",
      })
      try {
        const body = await readJson<{ authorization: QaAuthorization }>(
          response,
        )
        setAuthorization(body.authorization)
        setStatus("authorized")
        await refreshProfiles()
      } catch (authorizeError) {
        setError(
          authorizeError instanceof Error
            ? authorizeError.message
            : "QA access could not be authorized.",
        )
      }
    },
    [refreshProfiles],
  )

  const revoke = useCallback(async () => {
    await fetch("/api/qa-access/revoke", {
      credentials: "same-origin",
      method: "POST",
    }).catch(() => undefined)
    setAuthorization(null)
    setProfiles([])
    setError(null)
    setStatus("needs_authorization")
    if (typeof BroadcastChannel !== "undefined") {
      const channel = new BroadcastChannel("ewatrade-qa-access-v1")
      channel.postMessage("revoked")
      channel.close()
    }
  }, [])

  const selectProfile = useCallback(
    async (profileReference: string) => {
      setSelectingReference(profileReference)
      setError(null)
      try {
        const response = await fetch("/api/qa-access/select", {
          body: JSON.stringify({ profileReference }),
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          method: "POST",
        })
        const body = await readJson<{ dashboardUrl: string }>(response)
        window.location.assign(body.dashboardUrl)
      } catch (selectionError) {
        setError(
          selectionError instanceof Error
            ? selectionError.message
            : "This QA business is unavailable.",
        )
        await refreshProfiles().catch(() => undefined)
        setSelectingReference(null)
      }
    },
    [refreshProfiles],
  )

  const value = useMemo<QaWebContextValue>(
    () => ({
      authorization,
      authorize,
      error,
      profiles,
      refreshProfiles,
      retry: bootstrap,
      revoke,
      selectProfile,
      selectingReference,
      status,
    }),
    [
      authorization,
      authorize,
      error,
      profiles,
      refreshProfiles,
      bootstrap,
      revoke,
      selectProfile,
      selectingReference,
      status,
    ],
  )

  return (
    <QaWebContext.Provider value={value}>
      {children}
      <div className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] right-[max(1rem,env(safe-area-inset-right))] z-40">
        <QaAuthorizationDialog />
        <QaWebAccountChooser />
      </div>
    </QaWebContext.Provider>
  )
}

function QaAuthorizationDialog() {
  const qa = useQaWebAccelerator()
  const [qaDomain, setQaDomain] = useState(qa.authorization?.qaDomain ?? "")
  const [submitting, setSubmitting] = useState(false)
  const [open, setOpen] = useState(false)

  if (qa.status === "authorized") return null

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!qaDomain.trim()) return
    setSubmitting(true)
    await qa.authorize({ qaDomain: qaDomain.trim() }).finally(() => {
      setSubmitting(false)
    })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen)
        if (!nextOpen) setQaDomain(qa.authorization?.qaDomain ?? "")
      }}
    >
      <DialogTrigger
        render={
          <Button type="button" className="h-12 rounded-full px-5 shadow-lg" />
        }
        aria-label="Set up QA"
      >
        <HugeiconsIcon icon={UserGroupIcon} className="size-5" />
        Set QA
      </DialogTrigger>
      <DialogContent className="max-w-lg p-6 text-foreground">
        <DialogHeader>
          <DialogTitle className="text-lg font-medium">
            Connect QA workspace
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            Use the domain that receives your QA email.
          </DialogDescription>
        </DialogHeader>

        {qa.status === "checking" ? (
          <p className="mt-6 bg-muted px-4 py-4 text-sm text-muted-foreground">
            Checking this preview environment…
          </p>
        ) : qa.status === "upgrade_required" ? (
          <p className="mt-6 bg-muted px-4 py-4 text-sm">
            This preview is out of date. Open the latest preview deployment.
          </p>
        ) : qa.status === "network_unavailable" ? (
          <div className="mt-6 flex flex-col gap-3 bg-muted px-4 py-4 text-sm">
            <p>
              Reconnect to this preview server. QA access stays blocked while
              authorization cannot be checked.
            </p>
            <Button type="button" onClick={() => void qa.retry()}>
              Retry connection
            </Button>
          </div>
        ) : qa.status === "unavailable" ? (
          <div className="mt-6 flex flex-col gap-3 bg-muted px-4 py-4 text-sm">
            <p>
              This preview server has not enabled the QA accelerator. Check its
              private configuration, then retry.
            </p>
            <Button type="button" onClick={() => void qa.retry()}>
              Retry configuration
            </Button>
          </div>
        ) : (
          <form className="mt-6 flex flex-col gap-4" onSubmit={submit}>
            <Field>
              <FieldLabel htmlFor="qa-workspace-domain">QA domain</FieldLabel>
              <Input
                id="qa-workspace-domain"
                autoCapitalize="none"
                autoCorrect="off"
                onChange={(event) => setQaDomain(event.target.value)}
                placeholder="Enter your QA domain"
                required
                type="text"
                value={qaDomain}
                disabled={submitting}
                aria-describedby="qa-workspace-domain-description"
              />
              <FieldDescription id="qa-workspace-domain-description">
                QA businesses only. The domain limits the list to its registered
                QA businesses.
              </FieldDescription>
            </Field>
            {qa.error ? (
              <p role="alert" className="text-sm text-destructive">
                {qa.error}
              </p>
            ) : null}
            <Button
              className="w-full"
              disabled={submitting || !qaDomain.trim()}
              type="submit"
            >
              {submitting ? "Authorizing…" : "Load QA businesses"}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}

export function QaWebAccountChooser() {
  const qa = useContext(QaWebContext)
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")
  const filteredProfiles = useMemo(() => {
    if (!qa) return []
    const query = search.trim().toLowerCase()
    if (!query) return qa.profiles
    return qa.profiles.filter((profile) =>
      [
        profile.business.name,
        profile.identity.email,
        profile.identity.name,
        profile.membership.role,
        profile.store.name,
      ].some((value) => value.toLowerCase().includes(query)),
    )
  }, [qa, search])

  if (!qa || qa.status !== "authorized" || !qa.authorization) return null

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen)
        if (!nextOpen) setSearch("")
      }}
    >
      <DialogTrigger
        render={
          <Button type="button" className="h-12 rounded-full px-5 shadow-lg" />
        }
        aria-label={`Open ${qa.profiles.length} QA businesses`}
      >
        <HugeiconsIcon className="size-5" icon={UserGroupIcon} />
        QA · {qa.profiles.length}
      </DialogTrigger>
      <DialogContent className="max-w-xl p-6 text-foreground">
        <DialogHeader>
          <DialogTitle className="text-lg font-medium">
            QA businesses
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            {qa.authorization.qaDomain} · ordinary authenticated sessions
          </DialogDescription>
        </DialogHeader>
        <div className="mt-6">
          <label className="relative block">
            <HugeiconsIcon
              className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              icon={Search01Icon}
            />
            <span className="sr-only">Search QA businesses</span>
            <input
              className="h-11 w-full rounded-2xl border border-border bg-background pl-10 pr-4 text-sm outline-none focus:border-primary/50 focus:ring-4 focus:ring-primary/10"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Business, owner, role, or store"
              value={search}
            />
          </label>
          {qa.error ? (
            <p className="mt-3 rounded-2xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {qa.error}
            </p>
          ) : null}
          <div className="mt-4 max-h-[48vh] space-y-2 overflow-y-auto pr-1">
            {filteredProfiles.map((profile) => (
              <button
                className="flex min-h-16 w-full items-center gap-3 rounded-2xl border border-border bg-background px-4 py-3 text-left transition hover:bg-muted/60 disabled:opacity-60"
                disabled={Boolean(qa.selectingReference)}
                key={profile.profileReference}
                onClick={() => void qa.selectProfile(profile.profileReference)}
                type="button"
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-sm font-black text-primary">
                  {profile.business.name.slice(0, 1).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold">
                    {profile.business.name}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {profile.store.name} · {profile.identity.name}
                  </span>
                </span>
                <span className="rounded-full bg-muted px-2.5 py-1 text-[10px] font-black uppercase text-muted-foreground">
                  {qa.selectingReference === profile.profileReference
                    ? "Opening"
                    : profile.membership.role}
                </span>
              </button>
            ))}
            {!filteredProfiles.length ? (
              <div className="flex items-center gap-3 rounded-2xl bg-muted/60 p-4 text-sm text-muted-foreground">
                <HugeiconsIcon className="size-5" icon={Building02Icon} />
                No active QA businesses match this domain and search.
              </div>
            ) : null}
          </div>
          <div className="mt-4 flex flex-col items-stretch gap-1 border-t border-border pt-3 sm:flex-row sm:items-center sm:justify-between">
            <button
              className="min-h-11 rounded-xl px-3 text-left text-sm font-bold text-destructive hover:bg-destructive/5 sm:text-center"
              onClick={() => void qa.revoke()}
              type="button"
            >
              Clear QA data
            </button>
            <button
              className="min-h-11 rounded-xl px-3 text-left text-sm font-bold text-primary hover:bg-primary/5 sm:text-center"
              onClick={() => void qa.revoke()}
              type="button"
            >
              Change QA domain
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function useQaWebAccelerator() {
  const context = useContext(QaWebContext)
  if (!context) throw new Error("useQaWebAccelerator requires QaWebAccelerator")
  return context
}

export function useOptionalQaWebAccelerator() {
  return useContext(QaWebContext)
}
