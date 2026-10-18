"use client"

import { Input } from "@ewatrade/ui"
import {
  isValidStoreLink,
  normalizeStoreLink,
} from "@ewatrade/utils/store-link"
import { useEffect, useId, useRef, useState } from "react"
import { OwnerSignupIcon } from "./owner-signup-artwork"

export type StoreLinkCheck = {
  slug: string
  available: boolean
  suggestions: string[]
  requestedSlug: string
  emailDomain?: string
}

export function StoreLinkField({
  value,
  onChange,
  emailDomain,
  onCheck,
  disabled = false,
  label = "Store link",
  forceEdit = false,
}: {
  value: string
  onChange: (value: string) => void
  emailDomain?: string
  onCheck?: (result: StoreLinkCheck | null) => void
  disabled?: boolean
  label?: string
  forceEdit?: boolean
}) {
  const id = useId()
  const [editing, setEditing] = useState(false)
  const field = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (forceEdit) setEditing(true)
  }, [forceEdit])
  useEffect(() => {
    if (editing) field.current?.focus()
  }, [editing])
  useEffect(() => {
    if (!value) setEditing(false)
  }, [value])
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
          const checked = { ...result, requestedSlug: value, emailDomain }
          setCheck(checked)
          onCheck?.(checked)
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
      {editing && (
        <label className="signup-label" htmlFor={id}>
          {label}
          <span className="owner-link-input">
            <Input
              id={id}
              ref={field}
              aria-label={label}
              className="signup-input"
              value={value}
              maxLength={40}
              disabled={disabled}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              onChange={(event) => {
                const typed = event.target.value
                const normalized = normalizeStoreLink(typed)
                onChange(
                  typed.endsWith("-") && normalized && normalized.length < 40
                    ? `${normalized}-`
                    : normalized,
                )
              }}
              onBlur={() => onChange(normalizeStoreLink(value))}
            />
            <span>.ewatrade.com</span>
          </span>
        </label>
      )}
      <div
        aria-live="polite"
        className="owner-link-status"
        data-status={
          check?.available ? "available" : check ? "taken" : undefined
        }
      >
        {checking ? (
          <>
            <span className="owner-ref-spin" />
            <span>
              Checking <b>{value}</b>.ewatrade.com…
            </span>
          </>
        ) : error ? (
          <span>{error}</span>
        ) : check?.available ? (
          <>
            <OwnerSignupIcon name="check" />
            <span>
              <b>{check.slug}</b>.ewatrade.com is available
            </span>
          </>
        ) : check ? (
          <>
            <OwnerSignupIcon name="alert" />
            <span>
              <b>{check.slug}</b>.ewatrade.com is taken. The name is fine; pick
              a different link:
            </span>
          </>
        ) : value ? (
          <span>Use 2–40 letters, numbers and hyphens for your link.</span>
        ) : (
          <span>
            Your store gets its own free link, like{" "}
            <b>your-business.ewatrade.com</b>
          </span>
        )}
        {value && !editing && (
          <button
            type="button"
            className="owner-ref-lnk"
            aria-label="Edit store link"
            onClick={() => setEditing(true)}
          >
            Edit
          </button>
        )}
      </div>
      {check && !check.available && (
        <div className="owner-chips">
          {check.suggestions.map((slug) => (
            <button
              type="button"
              className="owner-ref-chip owner-ref-sm"
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
