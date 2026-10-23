"use client"
import { useEffect, useRef, useState } from "react"
import {
  SIGNUP_CHAT_MESSAGE,
  type SignupChatDetails,
  signupChatDetails,
} from "../../lib/signup-chat"
type Settings = {
  publication: {
    signupAvailable: boolean
    effective: boolean
    version: string | null
  }
}
type Stage = "details" | "review" | "code" | "success" | "unknown"
const blank = {
  businessName: "",
  name: "",
  email: "",
  requestedSlug: "",
  ageBand: "",
}

async function jsonRequest(path: string, init?: RequestInit) {
  const response = await fetch(path, { ...init, cache: "no-store" })
  const body = await response.json().catch(() => null)
  if (!response.ok)
    throw Object.assign(
      new Error(body?.message ?? "Registration could not connect. Try again."),
      { uncertain: response.status >= 500 },
    )
  return body
}

export function useSignupChat(marketingUrl: string) {
  const [details, setDetails] = useState(blank)
  const [review, setReview] = useState<SignupChatDetails>()
  const [settings, setSettings] = useState<Settings>()
  const [stage, setStage] = useState<Stage>("details")
  const [consent, setConsent] = useState(false)
  const [code, setCode] = useState("")
  const [pending, setPending] = useState(false)
  const [error, setError] = useState("")
  const [retryAt, setRetryAt] = useState(0)
  const [now, setNow] = useState(0)
  const lock = useRef(false)
  const slugEdited = useRef(false)
  const title = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    const abort = new AbortController()
    jsonRequest("/api/owner-signup", { signal: abort.signal })
      .then(setSettings)
      .catch(() => {
        if (!abort.signal.aborted)
          setError(
            "Signup options could not load. Close registration and try again.",
          )
      })
    return () => abort.abort()
  }, [])
  // biome-ignore lint/correctness/useExhaustiveDependencies: Focus the newly entered stage heading.
  useEffect(() => {
    title.current?.focus()
  }, [stage])
  useEffect(() => {
    if (stage !== "code") return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [stage])
  const emit = (
    action:
      | "review"
      | "code_sent"
      | "confirm"
      | "created"
      | "error"
      | "edit"
      | "open_dashboard",
  ) =>
    window.parent.postMessage(
      { type: "ewatrade.signup-chat.progress", action },
      new URL(marketingUrl).origin,
    )
  useEffect(() => {
    window.parent.postMessage(
      { type: "ewatrade.signup-chat.status", pending },
      new URL(marketingUrl).origin,
    )
  }, [marketingUrl, pending])
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (
        event.key !== "Escape" ||
        (event.target instanceof Element &&
          event.target.closest("select,[role=combobox]"))
      )
        return
      window.parent.postMessage(
        { type: "ewatrade.signup-chat.dismiss" },
        new URL(marketingUrl).origin,
      )
    }
    window.addEventListener("keydown", handleEscape, true)
    return () => window.removeEventListener("keydown", handleEscape, true)
  }, [marketingUrl])
  const enabled =
    settings?.publication.signupAvailable && settings.publication.effective
  const edit = () => {
    if (lock.current) return
    emit("edit")
    setStage("details")
    setReview(undefined)
    setConsent(false)
    setCode("")
    setError("")
  }
  const post = (body: unknown) =>
    jsonRequest("/api/owner-signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  async function reviewDetails() {
    if (lock.current) return
    setError("")
    if (details.ageBand === "UNDER_13") {
      setError("EwaTrade accounts are for people aged 13 or older.")
      return
    }
    const parsed = signupChatDetails.safeParse(details)
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check your details.")
      return
    }
    lock.current = true
    setPending(true)
    try {
      const query = new URLSearchParams({
        slug: parsed.data.requestedSlug,
        emailDomain: parsed.data.email.split("@")[1] ?? "",
      })
      const link = await jsonRequest(`/api/owner-signup?${query}`)
      if (!link?.available || typeof link.slug !== "string")
        throw new Error("That store link is unavailable. Choose another.")
      const value = signupChatDetails.parse({
        ...parsed.data,
        requestedSlug: link.slug,
      })
      setReview(value)
      setDetails(value)
      setConsent(false)
      setStage("review")
      emit("review")
    } catch (cause) {
      emit("error")
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to check your store link.",
      )
    } finally {
      lock.current = false
      setPending(false)
    }
  }
  async function sendCode() {
    if (lock.current || !review || !enabled || !consent) return
    lock.current = true
    setPending(true)
    setError("")
    try {
      const result = await post({
        action: "request_email",
        ...review,
        acceptedTerms: true,
        acknowledgedPrivacyNotice: true,
        ...(settings?.publication.version
          ? { legalVersion: settings.publication.version }
          : {}),
      })
      if (result?.sent !== true)
        throw new Error("We could not confirm code delivery. Try again.")
      setStage("code")
      emit("code_sent")
      setCode("")
      setNow(Date.now())
      setRetryAt(Date.now() + 60_000)
    } catch (cause) {
      emit("error")
      setError(
        cause instanceof Error ? cause.message : "Unable to send a code.",
      )
    } finally {
      lock.current = false
      setPending(false)
    }
  }
  async function verifyAndCreate() {
    if (
      lock.current ||
      !review ||
      !consent ||
      !enabled ||
      !/^\d{6}$/.test(code)
    )
      return
    lock.current = true
    setPending(true)
    setError("")
    try {
      emit("confirm")
      const result = await post({ action: "verify_email", ...review, code })
      if (result?.success !== true) {
        setStage("unknown")
        return
      }
      setCode("")
      setStage("success")
      emit("created")
      window.parent.postMessage(
        { type: SIGNUP_CHAT_MESSAGE },
        new URL(marketingUrl).origin,
      )
    } catch (cause) {
      emit("error")
      if (
        !(cause instanceof Error) ||
        !("uncertain" in cause) ||
        cause.uncertain
      ) {
        setCode("")
        setStage("unknown")
      } else setError(cause.message)
    } finally {
      lock.current = false
      setPending(false)
    }
  }
  return {
    details,
    setDetails,
    review,
    settings,
    stage,
    consent,
    setConsent,
    code,
    setCode,
    pending,
    error,
    retryAt,
    now,
    slugEdited,
    title,
    enabled,
    edit,
    reviewDetails,
    sendCode,
    verifyAndCreate,
    openDashboard: () => emit("open_dashboard"),
  }
}
