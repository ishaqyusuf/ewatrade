"use client"

import {
  OwnerBusinessAvatar,
  OwnerSignupIcon,
} from "@ewatrade/onboarding/components/signup/signup-flow"
import { Input } from "@ewatrade/ui"
import {
  BUSINESS_TYPES,
  BUSINESS_TYPE_GROUPS,
  type BusinessType,
} from "@ewatrade/utils/business-types"
import { useRef, useState } from "react"

export function OwnerTypeStep({
  selected,
  other,
  onChange,
  onOther,
  onNext,
}: {
  selected: string[]
  other: string
  onChange: (keys: string[]) => void
  onOther: (value: string) => void
  onNext: () => void
}) {
  const results = useRef<HTMLDivElement>(null)
  const [query, setQuery] = useState("")
  const [multi, setMulti] = useState(selected.length > 1)
  const first = selected.length === 1 && !multi
  const valid =
    selected.length > 0 &&
    (!selected.includes("other") || other.trim().length >= 2)
  const groups = BUSINESS_TYPE_GROUPS.map((group) => ({
    ...group,
    types: BUSINESS_TYPES.filter(
      (type) =>
        type.group === group.key &&
        `${type.label} ${type.examples} ${group.label}`
          .toLowerCase()
          .includes(query.toLowerCase().trim()),
    ),
  })).filter((group) => group.types.length)
  const otherType = BUSINESS_TYPES.find((type) => type.key === "other")
  function pick(key: string) {
    onChange(
      multi
        ? selected.includes(key)
          ? selected.filter((value) => value !== key)
          : [...selected, key]
        : [key],
    )
  }
  function jump(key: string) {
    const container = results.current?.closest(".owner-ref-fp-scroll")
    const target = document.getElementById(`owner-group-${key}`)
    if (container && target)
      container.scrollTo({
        top:
          container.scrollTop +
          target.getBoundingClientRect().top -
          container.getBoundingClientRect().top,
        behavior: "smooth",
      })
  }
  function row(type: BusinessType) {
    const chosen = selected.includes(type.key)
    const content = (
      <>
        <OwnerBusinessAvatar typeKey={type.key} size={44} />
        <span className="owner-ref-tb">
          <b>{type.label}</b>
          <small>{type.examples}</small>
        </span>
        {multi && (
          <span
            className={`owner-ref-cbox${chosen ? " owner-ref-on" : ""}`}
            aria-hidden="true"
          >
            {chosen && <OwnerSignupIcon name="check" />}
          </span>
        )}
      </>
    )
    return multi ? (
      <label
        className={`owner-ref-trow${chosen ? " owner-ref-on" : ""}`}
        key={type.key}
      >
        <input
          type="checkbox"
          className="sr-only"
          checked={chosen}
          aria-label={type.label}
          onChange={() => pick(type.key)}
        />
        {content}
      </label>
    ) : (
      <button
        type="button"
        className={`owner-ref-trow${chosen ? " owner-ref-on" : ""}`}
        key={type.key}
        aria-pressed={chosen}
        onClick={() => pick(type.key)}
      >
        {content}
      </button>
    )
  }
  return (
    <>
      <header>
        <p className="signup-eyebrow">Step 2 of 3 · Business type</p>
        <h1>What kind of business is it?</h1>
        <p className="signup-intro">
          Pick all that apply. We use it to suggest products, categories and
          tips. It never locks features.
        </p>
      </header>
      <div className="owner-ref-typewide">
        <nav className="owner-ref-gindex" aria-label="Jump to group">
          {BUSINESS_TYPE_GROUPS.map((group) => {
            const count = selected.filter(
              (key) =>
                BUSINESS_TYPES.find((type) => type.key === key)?.group ===
                group.key,
            ).length
            return (
              <button
                key={group.key}
                type="button"
                onClick={() => jump(group.key)}
              >
                {group.label}
                {count > 0 && <em>{count}</em>}
              </button>
            )
          })}
          <button type="button" onClick={() => jump("other")}>
            Not listed
          </button>
        </nav>
        <div className="owner-type-results" ref={results}>
          <div className="owner-ref-searchf">
            <OwnerSignupIcon name="search" />
            <Input
              type="search"
              className="owner-type-search"
              aria-label="Search business types"
              value={query}
              placeholder="Search, e.g. eggs, salon, phones"
              onChange={(event) => setQuery(event.target.value)}
            />
            {query && (
              <button
                type="button"
                className="owner-ref-lnk"
                onClick={() => setQuery("")}
                aria-label="Clear search"
              >
                ✕
              </button>
            )}
          </div>
          {groups.map((group) => (
            <section key={group.key}>
              <h2 className="owner-ref-sl" id={`owner-group-${group.key}`}>
                {group.label}
              </h2>
              <div className="owner-ref-tlist">{group.types.map(row)}</div>
            </section>
          ))}
          {!groups.length && (
            <div className="owner-ref-noresult">
              No match for “{query}”. Choose <b>Something else</b> below and
              type it.
            </div>
          )}
          <h2 className="owner-ref-sl" id="owner-group-other">
            Not listed
          </h2>
          <div className="owner-ref-tlist">{otherType && row(otherType)}</div>
          {selected.includes("other") && (
            <label
              className="owner-ref-fld owner-ref-otherbox"
              htmlFor="owner-other-type"
            >
              <span>What kind of business is it?</span>
              <Input
                id="owner-other-type"
                className="signup-input"
                maxLength={60}
                value={other}
                placeholder="e.g. Event rentals, car wash, POS agent"
                onChange={(event) => onOther(event.target.value)}
              />
              <small className="owner-ref-help">
                We’ll register it as you type it. {other.length}/60 · At least 2
                characters
              </small>
            </label>
          )}
        </div>
      </div>
      <footer className="owner-step-actions">
        <button
          className="signup-secondary"
          type="button"
          disabled
          aria-label="Account already verified"
        >
          <OwnerSignupIcon name="arrowRight" className="owner-back-icon" />
        </button>
        <div className="owner-ref-hint">
          {selected.length
            ? `${selected.length} ${selected.length === 1 ? "type" : "types"} picked`
            : "Can’t find yours? “Something else” is at the end."}
        </div>
        {first && (
          <button
            className="signup-secondary owner-select-more"
            type="button"
            onClick={() => setMulti(true)}
          >
            Select more types
          </button>
        )}
        <button
          className="signup-primary"
          type="button"
          disabled={!valid}
          onClick={onNext}
        >
          {first
            ? "Proceed"
            : selected.length > 1
              ? `Continue with ${selected.length} types`
              : "Continue"}
        </button>
      </footer>
    </>
  )
}
