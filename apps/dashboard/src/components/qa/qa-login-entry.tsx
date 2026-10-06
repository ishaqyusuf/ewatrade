"use client"

import { LoginForm } from "@/components/auth/login-form"
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Field,
  FieldLabel,
  Input,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectRoot,
  SelectTrigger,
  SelectValue,
} from "@ewatrade/ui"
import { useCallback, useEffect, useRef, useState } from "react"

type Profile = {
  business: { id: string; name: string }
  identity: { id: string; email: string; name: string }
  membership: { role: string }
  store: { id: string; name: string }
  profileReference: string
}
type AccessState = { qaDomain: string; expiresAt: string; profiles: Profile[] }

function profileKey(profile: Profile) {
  return JSON.stringify([
    profile.business.id,
    profile.identity.id,
    profile.store.id,
    profile.membership.role,
  ])
}

export function QaLoginEntry(props: {
  next?: string
  initialError?: string
  marketingUrl: string
}) {
  const [open, setOpen] = useState(false)
  const [domain, setDomain] = useState("")
  const [access, setAccess] = useState<AccessState | null>(null)
  const [choice, setChoice] = useState("")
  const selectedProfile = access?.profiles.find(
    (profile) => profileKey(profile) === choice,
  )
  const selected = selectedProfile?.profileReference ?? ""
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [signingIn, setSigningIn] = useState(false)
  const [capabilityError, setCapabilityError] = useState<string | null>(null)
  const generation = useRef(0)
  const operationPending = useRef(false)

  const refresh = useCallback(async () => {
    if (operationPending.current) return
    const current = ++generation.current
    try {
      const response = await fetch("/api/qa-access", { cache: "no-store" })
      const body = await response.json()
      if (current !== generation.current) return
      if (!response.ok || !body.available) {
        setAccess(null)
        setChoice("")
        setCapabilityError(
          body.message || "QA access is unavailable in this environment.",
        )
        return
      }
      setCapabilityError(null)
      setAccess(body.access)
      if (body.access) setDomain(body.access.qaDomain)
      setChoice((value) =>
        body.access?.profiles.some(
          (profile: Profile) => profileKey(profile) === value,
        )
          ? value
          : "",
      )
    } catch {
      if (current !== generation.current) return
      setAccess(null)
      setChoice("")
      setCapabilityError("Reconnect, then retry loading QA accounts.")
    }
  }, [])

  useEffect(() => {
    void refresh()
    window.addEventListener("focus", refresh)
    const interval = window.setInterval(() => void refresh(), 60_000)
    return () => {
      generation.current += 1
      window.removeEventListener("focus", refresh)
      window.clearInterval(interval)
    }
  }, [refresh])

  useEffect(() => {
    if (!access) return
    const timeout = window.setTimeout(
      () => {
        generation.current += 1
        setAccess(null)
        setChoice("")
      },
      Math.max(0, new Date(access.expiresAt).getTime() - Date.now()),
    )
    return () => window.clearTimeout(timeout)
  }, [access])

  async function load(event: React.FormEvent) {
    event.preventDefault()
    const current = ++generation.current
    operationPending.current = true
    setPending(true)
    setAccess(null)
    setChoice("")
    setError(null)
    try {
      const response = await fetch("/api/qa-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "authorize", qaDomain: domain }),
      })
      const body = await response.json()
      if (current !== generation.current) return
      if (!response.ok)
        throw new Error(body.message || "Could not load QA accounts.")
      setAccess(body.access)
      setCapabilityError(null)
      setOpen(false)
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not load QA accounts.",
      )
    } finally {
      operationPending.current = false
      setPending(false)
    }
  }

  async function signIn() {
    if (!selected || !access) throw new Error("Choose a QA email address.")
    operationPending.current = true
    generation.current += 1
    setSigningIn(true)
    try {
      const response = await fetch("/api/qa-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "select",
          profileReference: selected,
          next: props.next,
        }),
      })
      const body = await response.json()
      if (!response.ok) {
        setChoice("")
        setAccess(null)
        throw new Error(
          body.message || "This QA account is no longer available.",
        )
      }
      window.location.assign(body.redirectTo)
    } finally {
      operationPending.current = false
      setSigningIn(false)
    }
  }

  const items =
    access?.profiles.map((profile) => ({
      value: profile.profileReference,
      label: [
        profile.identity.email,
        profile.business.name,
        ...(profile.store.name !== profile.business.name
          ? [profile.store.name]
          : []),
        profile.membership.role,
      ].join(" · "),
    })) ?? []

  return (
    <>
      <LoginForm
        {...props}
        accountEntry={
          access
            ? {
                canSignIn: Boolean(selected) && !pending && !signingIn,
                signIn,
                emailField: (
                  <SelectRoot
                    items={items}
                    value={selected || null}
                    onValueChange={(value) => {
                      const profile = access.profiles.find(
                        (item) => item.profileReference === value,
                      )
                      setChoice(profile ? profileKey(profile) : "")
                    }}
                  >
                    <SelectTrigger
                      id="email"
                      aria-label="Email address"
                      appearance="form"
                      disabled={pending || signingIn}
                    >
                      <SelectValue placeholder="Choose a QA email address">
                        {selectedProfile?.identity.email}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent alignItemWithTrigger={false}>
                      <SelectGroup>
                        {items.map((item) => (
                          <SelectItem
                            key={item.value}
                            value={item.value}
                            className="whitespace-normal break-words"
                          >
                            {item.label}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </SelectRoot>
                ),
              }
            : undefined
        }
      />
      <Dialog
        open={open}
        onOpenChange={(value) => {
          if (!pending) setOpen(value)
        }}
      >
        <div className="fixed bottom-5 right-5 z-40">
          <DialogTrigger
            render={<Button type="button" variant="outline" />}
            aria-label="QA Quick Fill"
            disabled={signingIn}
            onClick={() => void refresh()}
          >
            Quick Fill <Badge variant="secondary">QA</Badge>
          </DialogTrigger>
        </div>
        <DialogContent className="p-6">
          <DialogHeader>
            <DialogTitle>Load QA accounts</DialogTitle>
            <DialogDescription>
              Enter the domain that receives your QA email.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={load} className="mt-6 flex flex-col gap-4">
            <Field>
              <FieldLabel htmlFor="qa-login-domain">QA domain</FieldLabel>
              <Input
                id="qa-login-domain"
                value={domain}
                onChange={(event) => setDomain(event.target.value)}
                autoCapitalize="none"
                autoCorrect="off"
                placeholder="Enter your QA domain"
                required
                disabled={pending}
              />
            </Field>
            {error || capabilityError ? (
              <p role="alert" className="text-sm text-destructive">
                {error || capabilityError}
              </p>
            ) : null}
            <Button type="submit" disabled={pending || !domain.trim()}>
              {pending ? "Loading…" : "Load QA accounts"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
