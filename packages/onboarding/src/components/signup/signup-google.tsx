"use client"

import Script from "next/script"
import { useEffect, useRef, useState } from "react"

type GoogleIdentity = {
  initialize: (options: {
    client_id: string
    callback: (response: { credential: string }) => void
  }) => void
  renderButton: (
    element: HTMLElement,
    options: {
      type: "standard"
      theme: "outline"
      size: "large"
      text: "continue_with"
      width: number
    },
  ) => void
}

export function SignupGoogle({
  clientId,
  disabled,
  onCredential,
}: {
  clientId: string | null
  disabled: boolean
  onCredential: (idToken: string) => void
}) {
  const element = useRef<HTMLDivElement>(null)
  const callback = useRef(onCredential)
  const blocked = useRef(disabled)
  callback.current = onCredential
  blocked.current = disabled
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    const google = (
      window as Window & { google?: { accounts: { id: GoogleIdentity } } }
    ).google
    if (!ready || !google || !clientId || !element.current) return
    google.accounts.id.initialize({
      client_id: clientId,
      callback: (response) => {
        if (!blocked.current) callback.current(response.credential)
      },
    })
    google.accounts.id.renderButton(element.current, {
      type: "standard",
      theme: "outline",
      size: "large",
      text: "continue_with",
      width: 360,
    })
  }, [ready, clientId])
  return (
    <div className="owner-google">
      {clientId && (
        <Script
          src="https://accounts.google.com/gsi/client"
          onReady={() => setReady(true)}
          onError={() => setFailed(true)}
        />
      )}
      {clientId && ready && !failed ? (
        <div
          aria-disabled={disabled}
          inert={disabled}
          className={disabled ? "owner-google-disabled" : undefined}
          ref={element}
        />
      ) : (
        <button type="button" className="signup-secondary" disabled>
          Continue with Google
        </button>
      )}
      {(!clientId || failed) && (
        <p className="owner-muted">
          Google sign-up is unavailable here. Continue with email
          {failed ? " or try reloading." : "."}
        </p>
      )}
    </div>
  )
}
