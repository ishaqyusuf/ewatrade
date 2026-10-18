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
    if (!ready || disabled || !google || !clientId || !element.current) return
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
  }, [ready, clientId, disabled])
  return (
    <div className="owner-google">
      {clientId && !disabled && (
        <Script
          src="https://accounts.google.com/gsi/client"
          onReady={() => setReady(true)}
          onError={() => setFailed(true)}
        />
      )}
      {clientId && ready && !failed && !disabled ? (
        <div
          aria-disabled={disabled}
          inert={disabled}
          className={disabled ? "owner-google-disabled" : undefined}
          ref={element}
        />
      ) : (
        <button type="button" className="signup-secondary" disabled>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path
              fill="#4285F4"
              d="M22.6 12.3c0-.8-.1-1.5-.2-2.3H12v4.3h6a5.1 5.1 0 0 1-2.2 3.4v2.8h3.6c2-1.9 3.2-4.7 3.2-8.2z"
            />
            <path
              fill="#34A853"
              d="M12 23c3 0 5.5-1 7.3-2.7l-3.6-2.8c-1 .7-2.2 1.1-3.7 1.1-2.9 0-5.3-1.9-6.2-4.5H2.1v2.9A11 11 0 0 0 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.8 14.1a6.6 6.6 0 0 1 0-4.2V7H2.1a11 11 0 0 0 0 9.9z"
            />
            <path
              fill="#EA4335"
              d="M12 5.4c1.6 0 3.1.6 4.2 1.7l3.2-3.2A11 11 0 0 0 2.1 7l3.7 2.9C6.7 7.3 9.1 5.4 12 5.4z"
            />
          </svg>
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
