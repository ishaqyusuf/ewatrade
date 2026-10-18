"use client"

import { Input } from "@ewatrade/ui"
import {
  isValidStoreLink,
  normalizeStoreLink,
} from "@ewatrade/utils/store-link"
import { useEffect, useId, useState } from "react"

export type StoreLinkCheck = {
  slug: string
  available: boolean
  suggestions: string[]
}

export function StoreLinkField({
  value,
  onChange,
  emailDomain,
  onCheck,
  disabled = false,
  label = "Store link",
}: {
  value: string
  onChange: (value: string) => void
  emailDomain?: string
  onCheck?: (result: StoreLinkCheck | null) => void
  disabled?: boolean
  label?: string
}) {
  const id = useId()
  const [check, setCheck] = useState<StoreLinkCheck | null>(null)
  const [error, setError] = useState("")
  const [checking, setChecking] = useState(false)
  useEffect(() => {
    const controller = new AbortController()
    setCheck(null)
    setError("")
    onCheck?.(null)
    if (!isValidStoreLink(value)) {
      setChecking(false)
      return () => controller.abort()
    }
    setChecking(true)
    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ slug: value })
        if (emailDomain) params.set("emailDomain", emailDomain)
        const response = await fetch(`/api/owner-signup?${params}`, {
          signal: controller.signal,
          cache: "no-store",
        })
        const result = await response.json()
        if (!response.ok)
          throw new Error(
            result.message ?? "The link could not be checked. Try again.",
          )
        if (!controller.signal.aborted) {
          setCheck(result)
          onCheck?.(result)
        }
      } catch (cause) {
        if (!controller.signal.aborted)
          setError(
            cause instanceof Error
              ? cause.message
              : "The link could not be checked.",
          )
      } finally {
        if (!controller.signal.aborted) setChecking(false)
      }
    }, 450)
    return () => {
      controller.abort()
      clearTimeout(timer)
    }
  }, [value, emailDomain, onCheck])
  return (
    <div className="owner-link-field">
      <label className="signup-label" htmlFor={id}>
        {label}
        <span className="owner-link-input">
          <Input
            id={id}
            aria-label={label}
            className="signup-input"
            value={value}
            maxLength={40}
            disabled={disabled}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            onChange={(event) =>
              onChange(normalizeStoreLink(event.target.value))
            }
          />
          <span>.ewatrade.com</span>
        </span>
      </label>
      <div aria-live="polite" className="owner-link-status">
        {checking
          ? "Checking your free store link…"
          : error ||
            (check?.available
              ? `${check.slug}.ewatrade.com is available`
              : check
                ? "That link is taken. Your business name is fine; choose another link."
                : value
                  ? "Use 2–40 letters, numbers and hyphens for your link."
                  : "Your business gets its own free store link.")}
      </div>
      {check && !check.available && (
        <div className="owner-chips">
          {check.suggestions.map((slug) => (
            <button
              type="button"
              className="owner-chip"
              key={slug}
              onClick={() => onChange(slug)}
            >
              {slug}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
