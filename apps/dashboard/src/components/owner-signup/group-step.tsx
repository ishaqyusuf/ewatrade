"use client"

import {
  type StoreLinkCheck,
  StoreLinkField,
} from "@ewatrade/onboarding/components/signup/signup-flow"
import { Input, SelectControl } from "@ewatrade/ui"
import type { OwnerSetupDraft } from "@ewatrade/utils/owner-signup"
import { moveOwnerBusinessType } from "@ewatrade/utils/owner-signup"
import { normalizeStoreLink } from "@ewatrade/utils/store-link"
import { useCallback, useState } from "react"
import {
  OWNER_PLAN_LIMITS,
  arrangeOwnerTypes,
  businessLabel,
  typeLabel,
} from "./model"

export function OwnerGroupStep({
  draft,
  onChange,
  onNext,
  onBack,
  disabled,
  emailDomain,
}: {
  draft: OwnerSetupDraft
  onChange: (draft: OwnerSetupDraft) => void
  onNext: (draft: OwnerSetupDraft) => void
  onBack: () => void
  disabled: boolean
  emailDomain: string
}) {
  const [dragged, setDragged] = useState<string | null>(null)
  const [announcement, setAnnouncement] = useState("")
  const [available, setAvailable] = useState<
    Record<string, { requested: string; canonical: string }>
  >({})
  const [edited, setEdited] = useState<Set<string>>(
    () =>
      new Set(draft.businesses.filter((b) => b.slug).map((b) => b.id ?? "")),
  )
  const onAvailable = useCallback(
    (id: string, requested: string, canonical: string) =>
      setAvailable((current) => ({
        ...current,
        [id]: { requested, canonical },
      })),
    [],
  )
  const count = draft.businesses.length
  const neededPlan = count <= 3 ? "growth" : "pro"
  const canProceed =
    draft.businesses.every(
      (b, i) =>
        b.typeKeys.length > 0 &&
        b.name.trim() &&
        b.slug &&
        (i === 0 || available[b.id ?? ""]?.requested === b.slug),
    ) &&
    new Set(
      draft.businesses.map((b, i) =>
        i === 0 ? b.slug : (available[b.id ?? ""]?.canonical ?? b.slug),
      ),
    ).size === count &&
    (draft.planId === "starter" || count <= OWNER_PLAN_LIMITS[draft.planId])
  function move(key: string, target: string) {
    const index =
      target === "new"
        ? "new"
        : draft.businesses.findIndex((b) => b.id === target)
    if (index === -1) return
    const businesses = moveOwnerBusinessType(draft.businesses, key, index)
    onChange({
      ...draft,
      businesses,
      planId:
        draft.planId !== "starter" &&
        businesses.length > OWNER_PLAN_LIMITS[draft.planId]
          ? "starter"
          : draft.planId,
    })
    setAnnouncement(
      `${typeLabel(key, draft.otherType)} moved to ${target === "new" ? "a new business" : draft.businesses[Number(index)]?.name || `Business ${Number(index) + 1}`}.`,
    )
    setDragged(null)
  }
  return (
    <>
      <header>
        <p className="signup-eyebrow">04 / Organise your businesses</p>
        <h1>How do you run these?</h1>
        <p className="signup-intro">
          Keep related types together, or give each business its own space. Drag
          a type or use its Move menu.
        </p>
      </header>
      <div className="owner-chips owner-presets">
        <button
          type="button"
          className="owner-chip"
          onClick={() => onChange(arrangeOwnerTypes(draft, "together"))}
        >
          All one business
        </button>
        <button
          type="button"
          className="owner-chip"
          onClick={() => onChange(arrangeOwnerTypes(draft, "separate"))}
        >
          Each separate
        </button>
        <button
          type="button"
          className="owner-chip"
          onClick={() => onChange(arrangeOwnerTypes(draft, "suggested"))}
        >
          Suggested grouping
        </button>
      </div>
      <output className="sr-only" aria-live="polite">
        {announcement}
      </output>
      <div className="owner-group-board">
        {draft.businesses.map((business, index) => (
          <section
            key={business.id}
            className="owner-business-card"
            onDragOver={(event) => {
              if (dragged) event.preventDefault()
            }}
            onDrop={(event) => {
              event.preventDefault()
              if (dragged && business.id) move(dragged, business.id)
            }}
            aria-label={businessLabel(business, index)}
          >
            <div className="owner-business-number">
              {String(index + 1).padStart(2, "0")}{" "}
              <span>
                {index === 0 ? "Your first business" : "Separate business"}
              </span>
            </div>
            {index === 0 ? (
              <>
                <h2>{business.name}</h2>
                <p className="owner-muted">
                  {business.slug}.ewatrade.com · Fixed from your account
                </p>
              </>
            ) : (
              <div className="owner-fields">
                <label className="signup-label" htmlFor={`name-${business.id}`}>
                  Business name
                  <Input
                    id={`name-${business.id}`}
                    className="signup-input"
                    maxLength={120}
                    value={business.name}
                    onChange={(event) => {
                      const name = event.target.value
                      onChange({
                        ...draft,
                        businesses: draft.businesses.map((b) =>
                          b.id === business.id
                            ? {
                                ...b,
                                name,
                                slug: edited.has(b.id ?? "")
                                  ? b.slug
                                  : normalizeStoreLink(name),
                              }
                            : b,
                        ),
                      })
                    }}
                  />
                </label>
                <BusinessLink
                  value={business.slug}
                  id={business.id ?? ""}
                  onAvailable={onAvailable}
                  emailDomain={emailDomain}
                  onChange={(slug) => {
                    setEdited((current) =>
                      new Set(current).add(business.id ?? ""),
                    )
                    onChange({
                      ...draft,
                      businesses: draft.businesses.map((b) =>
                        b.id === business.id ? { ...b, slug } : b,
                      ),
                    })
                  }}
                />
              </div>
            )}
            <div className="owner-business-types">
              {business.typeKeys.map((key) => (
                <div
                  key={key}
                  className="owner-move-type"
                  draggable
                  onDragStart={(event) => {
                    setDragged(key)
                    event.dataTransfer.effectAllowed = "move"
                    event.dataTransfer.setData("text/plain", key)
                  }}
                  onDragEnd={() => setDragged(null)}
                >
                  <span aria-hidden="true">⠿</span>
                  <b>{typeLabel(key, draft.otherType)}</b>
                  <SelectControl
                    aria-label={`Move ${typeLabel(key, draft.otherType)}`}
                    value=""
                    options={[
                      { value: "", label: "Move" },
                      ...draft.businesses
                        .filter((b) => b.id !== business.id)
                        .map((b) => ({
                          value: b.id ?? "",
                          label: businessLabel(b, draft.businesses.indexOf(b)),
                        })),
                      { value: "new", label: "New business" },
                    ]}
                    onValueChange={(value) => {
                      if (value) move(key, value)
                    }}
                    popupClassName="signup-select-menu"
                  />
                </div>
              ))}
              {!business.typeKeys.length && (
                <p className="owner-muted">
                  Move at least one type here to keep your first business.
                </p>
              )}
            </div>
          </section>
        ))}
        <section
          className="owner-new-business"
          aria-label="New business drop area"
          onDragOver={(event) => {
            if (dragged) event.preventDefault()
          }}
          onDrop={(event) => {
            event.preventDefault()
            if (dragged) move(dragged, "new")
          }}
        >
          <span>+</span>
          <p>New business</p>
          <small>Drop a type here or use Move → New business</small>
        </section>
      </div>
      {count > 1 && (
        <section className="owner-plan-picker">
          <h2>Room for {count} businesses</h2>
          <p className="owner-muted">
            Growth runs up to 3 businesses. Pro runs up to 10. Both are free
            during launch.
          </p>
          <div className="owner-chips">
            {(["starter", "growth", "pro"] as const).map((plan) => (
              <button
                type="button"
                key={plan}
                disabled={plan !== "starter" && count > OWNER_PLAN_LIMITS[plan]}
                aria-pressed={draft.planId === plan}
                className={`owner-chip ${draft.planId === plan ? "is-selected" : ""}`}
                onClick={() => onChange({ ...draft, planId: plan })}
              >
                {plan === "starter"
                  ? "Starter for now"
                  : `${plan === "growth" ? "Growth" : "Pro"} · Free during launch`}
                {plan === neededPlan ? " · Suggested" : ""}
              </button>
            ))}
          </div>
          {draft.planId === "starter" && (
            <p className="owner-muted">
              We’ll set up your first business. {count - 1} will wait on Home
              until you upgrade.
            </p>
          )}
          {count > 10 && (
            <p className="owner-muted">
              Set up the first business on Starter now. Extra businesses remain
              waiting; Pro supports up to 10.
            </p>
          )}
        </section>
      )}
      <div className="owner-step-actions">
        <button className="signup-secondary" type="button" onClick={onBack}>
          Back
        </button>
        <button
          className="signup-primary"
          disabled={!canProceed || disabled}
          type="button"
          onClick={() =>
            onNext({
              ...draft,
              businesses: draft.businesses.map((business, index) =>
                index === 0
                  ? business
                  : {
                      ...business,
                      slug:
                        available[business.id ?? ""]?.canonical ??
                        business.slug,
                    },
              ),
            })
          }
        >
          Continue to Store
        </button>
      </div>
    </>
  )
}

function BusinessLink({
  value,
  id,
  onChange,
  onAvailable,
  emailDomain,
}: {
  value: string
  id: string
  onChange: (value: string) => void
  onAvailable: (id: string, requested: string, canonical: string) => void
  emailDomain: string
}) {
  const check = useCallback(
    (result: StoreLinkCheck | null) =>
      onAvailable(id, result?.available ? value : "", result?.slug ?? ""),
    [id, value, onAvailable],
  )
  return (
    <StoreLinkField
      value={value}
      emailDomain={emailDomain}
      onChange={onChange}
      onCheck={check}
    />
  )
}
