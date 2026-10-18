"use client"

import { CatalogIllustrationPreview } from "@/components/catalog-item/catalog-illustration-preview"
import { Input } from "@ewatrade/ui"
import {
  BUSINESS_TYPES,
  BUSINESS_TYPE_GROUPS,
} from "@ewatrade/utils/business-types"
import { Fragment, useState } from "react"
import { typeLabel } from "./model"

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
  const [query, setQuery] = useState("")
  const [multi, setMulti] = useState(selected.length > 1)
  const [group, setGroup] = useState("")
  const first = selected.length === 1 && !multi
  const valid =
    selected.length > 0 &&
    (!selected.includes("other") || other.trim().length >= 2)
  const visible = BUSINESS_TYPES.filter(
    (type) =>
      type.key === "other" ||
      ((!group || type.group === group) &&
        `${type.label} ${type.examples}`
          .toLowerCase()
          .includes(query.toLowerCase().trim())),
  )
  function pick(key: string) {
    if (multi)
      onChange(
        selected.includes(key)
          ? selected.filter((value) => value !== key)
          : [...selected, key],
      )
    else onChange([key])
  }
  return (
    <>
      <header>
        <p className="signup-eyebrow">03 / Business type</p>
        <h1>What do you do?</h1>
        <p className="signup-intro">
          Pick the closest fit. You can run more than one kind of business.
        </p>
      </header>
      <div className="owner-type-tools">
        <label htmlFor="owner-type-search" className="sr-only">
          Search business types
        </label>
        <Input
          id="owner-type-search"
          type="search"
          className="signup-input"
          value={query}
          placeholder="Search phones, food, farming…"
          onChange={(event) => setQuery(event.target.value)}
        />
        {multi && (
          <span className="owner-muted">{selected.length} selected</span>
        )}
      </div>
      <div className="owner-type-layout">
        <nav className="owner-group-index" aria-label="Business type groups">
          <button
            type="button"
            className={!group ? "is-active" : undefined}
            onClick={() => setGroup("")}
          >
            All types
          </button>
          {BUSINESS_TYPE_GROUPS.map((item) => (
            <button
              type="button"
              key={item.key}
              className={group === item.key ? "is-active" : undefined}
              onClick={() => setGroup(item.key)}
            >
              {item.label}
            </button>
          ))}
        </nav>
        <div className="owner-type-list">
          {visible.map((type) => {
            const className = `owner-type-card ${selected.includes(type.key) ? "is-selected" : ""}`
            const content = (
              <Fragment key={type.key}>
                <span className={`owner-type-avatar tone-${type.group}`}>
                  <CatalogIllustrationPreview
                    illustrationId={type.illustrationId}
                    compact
                  />
                </span>
                <span>
                  <b>{type.label}</b>
                  <small>{type.examples}</small>
                </span>
                <span aria-hidden="true" className="owner-type-check">
                  {selected.includes(type.key) ? "✓" : multi ? "□" : "+"}
                </span>
              </Fragment>
            )
            return multi ? (
              <label key={type.key} className={className}>
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={selected.includes(type.key)}
                  onChange={() => pick(type.key)}
                  aria-label={type.label}
                />
                {content}
              </label>
            ) : (
              <button
                type="button"
                key={type.key}
                aria-pressed={selected.includes(type.key)}
                className={className}
                onClick={() => pick(type.key)}
              >
                {content}
              </button>
            )
          })}
          {!visible.length && (
            <p className="owner-muted">
              No matching type. Clear your search or choose Something else.
            </p>
          )}
        </div>
      </div>
      {selected.includes("other") && (
        <label
          className="signup-label owner-other-label"
          htmlFor="owner-other-type"
        >
          What kind of business?
          <Input
            id="owner-other-type"
            className="signup-input"
            maxLength={60}
            value={other}
            placeholder="Describe it in a few words"
            onChange={(event) => onOther(event.target.value)}
          />
          <small className="owner-muted">
            {other.length}/60 · At least 2 characters
          </small>
        </label>
      )}
      {first && (
        <section className="owner-first-pick">
          <div>
            <span className="owner-muted">Your pick</span>
            <p>{typeLabel(selected[0] ?? "", other)}</p>
          </div>
          <div>
            <button
              className="signup-primary"
              type="button"
              disabled={!valid}
              onClick={onNext}
            >
              Proceed
            </button>
            <button
              className="signup-secondary"
              type="button"
              onClick={() => setMulti(true)}
            >
              Select more
            </button>
          </div>
        </section>
      )}
      {!first && (
        <div className="owner-step-actions">
          <span className="owner-muted">
            {selected.length} {selected.length === 1 ? "type" : "types"}{" "}
            selected
          </span>
          <button
            className="signup-primary"
            type="button"
            disabled={!valid}
            onClick={onNext}
          >
            Continue
          </button>
        </div>
      )}
    </>
  )
}
