"use client"

import {
  OwnerBusinessAvatar,
  OwnerSignupIcon,
  type StoreLinkCheck,
  StoreLinkField,
} from "@ewatrade/onboarding/components/signup/signup-flow"
import { Input, SelectControl } from "@ewatrade/ui"
import type { OwnerSetupDraft } from "@ewatrade/utils/owner-signup"
import { moveOwnerBusinessType } from "@ewatrade/utils/owner-signup"
import { normalizeStoreLink } from "@ewatrade/utils/store-link"
import { useCallback, useEffect, useState } from "react"
import {
  OWNER_PLAN_LIMITS,
  arrangeOwnerTypes,
  businessLabel,
  ownerPlanForBusinessCount,
  typeLabel,
} from "./model"

export function OwnerGroupStep({
  draft,
  onChange,
  onNext,
  onBack,
  disabled,
  emailDomain,
  forceEditBusinessId,
  onForcedEditOpened,
}: {
  draft: OwnerSetupDraft
  onChange: (draft: OwnerSetupDraft) => void
  onNext: (draft: OwnerSetupDraft) => void
  onBack: () => void
  disabled: boolean
  emailDomain?: string
  forceEditBusinessId?: string
  onForcedEditOpened?: () => void
}) {
  useEffect(() => {
    const target = forceEditBusinessId
      ? document.getElementById(`owner-business-${forceEditBusinessId}`)
      : null
    const container = target?.closest(".owner-ref-fp-scroll")
    if (target && container)
      container.scrollTo({
        top:
          container.scrollTop +
          target.getBoundingClientRect().top -
          container.getBoundingClientRect().top -
          24,
        behavior: "smooth",
      })
  }, [forceEditBusinessId])
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
      planId: ownerPlanForBusinessCount(draft.planId, businesses.length),
    })
    setAnnouncement(
      `${typeLabel(key, draft.otherType)} moved to ${target === "new" ? "a new business" : draft.businesses[Number(index)]?.name || `Business ${Number(index) + 1}`}.`,
    )
    setDragged(null)
  }
  const issue = draft.businesses.find((business) => !business.typeKeys.length)
    ? "Put at least one type in each business."
    : draft.businesses.find((business) => !business.name.trim())
      ? "Name each business."
      : !canProceed
        ? "Pick an available store link for each business."
        : ""
  return (
    <>
      <header>
        <p className="signup-eyebrow">Step 2 of 3 · Your businesses</p>
        <h1>How do you run these?</h1>
        <p className="signup-intro">
          Types in the same card are one business. Drag a type to another card,
          or onto “New business” to run it separately.
        </p>
      </header>
      <fieldset
        className="owner-ref-arropts"
        aria-label="How do you run these?"
      >
        <button
          type="button"
          className={`owner-ref-arropt${count === 1 ? " owner-ref-on" : ""}`}
          aria-pressed={count === 1}
          onClick={() => onChange(arrangeOwnerTypes(draft, "together"))}
        >
          <span
            className={`owner-ref-radio${count === 1 ? " owner-ref-on" : ""}`}
          />
          <span>
            <b>All one business</b>
            <small>
              One name, one store link, one stock list. Like a phone shop that
              also does repairs.
            </small>
          </span>
        </button>
        <button
          type="button"
          className={`owner-ref-arropt${count > 1 ? " owner-ref-on" : ""}`}
          aria-pressed={count > 1}
          onClick={() => onChange(arrangeOwnerTypes(draft, "separate"))}
        >
          <span
            className={`owner-ref-radio${count > 1 ? " owner-ref-on" : ""}`}
          />
          <span>
            <b>
              Each separate <em className="owner-ref-recpill">Suggested</em>
            </b>
            <small>
              Each gets its own name, store link, stock and reports. One login
              switches between them.
            </small>
          </span>
        </button>
      </fieldset>
      <h2 className="owner-ref-sl">
        {count} {count === 1 ? "business" : "businesses"}
        <small>Drag, or use Move (works with the keyboard)</small>
      </h2>
      <output className="sr-only" aria-live="polite">
        {announcement}
      </output>
      <div
        className={`owner-ref-board${dragged ? " owner-ref-is-dragging" : ""}`}
      >
        {draft.businesses.map((business, index) => (
          <section
            className="owner-ref-bcard"
            id={`owner-business-${business.id}`}
            key={business.id}
            aria-label={`Business ${index + 1}: ${businessLabel(business, index)}`}
            onDragOver={(event) => {
              if (dragged) event.preventDefault()
            }}
            onDrop={(event) => {
              event.preventDefault()
              if (dragged && business.id) move(dragged, business.id)
            }}
          >
            <div className="owner-ref-bcard-h">
              <OwnerBusinessAvatar
                typeKey={business.typeKeys[0]}
                name={business.name}
                size={38}
              />
              <div className="owner-ref-bh">
                {index === 0 ? (
                  <>
                    <b>{business.name}</b>
                    <small>{business.slug}.ewatrade.com</small>
                  </>
                ) : (
                  <Input
                    className="signup-input owner-group-name"
                    aria-label={`Business ${index + 1} name`}
                    maxLength={120}
                    value={business.name}
                    placeholder="Name this business"
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
                )}
              </div>
              {index === 0 && (
                <span className="owner-ref-bnum">From step 1</span>
              )}
            </div>
            {index > 0 && (
              <BusinessLink
                value={business.slug}
                id={business.id ?? ""}
                emailDomain={emailDomain}
                forceEdit={business.id === forceEditBusinessId}
                onForcedEditOpened={onForcedEditOpened}
                onAvailable={onAvailable}
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
            )}
            <div className="owner-ref-tchips">
              {business.typeKeys.map((key) => (
                <div
                  className="owner-ref-tchip"
                  key={key}
                  draggable
                  onDragStart={(event) => {
                    setDragged(key)
                    event.dataTransfer.effectAllowed = "move"
                    event.dataTransfer.setData("text/plain", key)
                  }}
                  onDragEnd={() => setDragged(null)}
                >
                  <svg
                    className="owner-ref-grip"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    aria-hidden="true"
                  >
                    {[6, 12, 18].flatMap((cy) =>
                      [9, 15].map((cx) => (
                        <circle cx={cx} cy={cy} r={1.6} key={`${cx}-${cy}`} />
                      )),
                    )}
                  </svg>
                  <OwnerBusinessAvatar typeKey={key} size={26} />
                  <span className="owner-ref-tl">
                    {typeLabel(key, draft.otherType)}
                  </span>
                  <SelectControl
                    aria-label={`Move ${typeLabel(key, draft.otherType)} to another business`}
                    value=""
                    placeholder="Move"
                    options={[
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
                <div className="owner-ref-emptydrop">Drop a type here</div>
              )}
            </div>
          </section>
        ))}
        <section
          className="owner-ref-dropnew"
          aria-label="New business drop area"
          onDragOver={(event) => {
            if (dragged) event.preventDefault()
          }}
          onDrop={(event) => {
            event.preventDefault()
            if (dragged) move(dragged, "new")
          }}
        >
          <OwnerSignupIcon name="plus" />
          <span>
            <b>New business</b>
            <small>Drag a type here to run it on its own</small>
          </span>
        </section>
      </div>
      {count > 1 && (
        <section className="owner-ref-plancard">
          <div className="owner-ref-plan-h">
            <OwnerSignupIcon name="sparkle" />
            <b>
              {count} businesses need{" "}
              {neededPlan === "growth" ? "Growth" : "Pro"}
            </b>
          </div>
          <p>
            Starter, your plan now, includes 1 business.{" "}
            {neededPlan === "growth" ? "Growth" : "Pro"} runs up to{" "}
            {OWNER_PLAN_LIMITS[neededPlan]} and is free during launch. You can
            change plans anytime.
          </p>
          <div className="owner-ref-chips">
            <button
              type="button"
              className={`owner-ref-chip${draft.planId === neededPlan ? " owner-ref-on" : ""}`}
              disabled={count > OWNER_PLAN_LIMITS[neededPlan]}
              onClick={() => onChange({ ...draft, planId: neededPlan })}
            >
              Use {neededPlan === "growth" ? "Growth" : "Pro"} · free during
              launch
            </button>
            <button
              type="button"
              className={`owner-ref-chip${draft.planId === "starter" ? " owner-ref-on" : ""}`}
              onClick={() => onChange({ ...draft, planId: "starter" })}
            >
              Starter for now
            </button>
          </div>
          <span className="owner-ref-help">
            {draft.planId === "starter"
              ? `We’ll set up ${draft.businesses[0]?.name} now. The others wait on Home until you upgrade.`
              : `You’ll set up all ${count} now, one after another. Nothing is charged.`}
          </span>
        </section>
      )}
      <footer className="owner-step-actions">
        <button
          className="signup-secondary"
          type="button"
          onClick={onBack}
          aria-label="Back"
        >
          <OwnerSignupIcon name="arrowRight" className="owner-back-icon" />
        </button>
        <div className="owner-ref-hint">
          {issue ||
            `${count} ${count === 1 ? "business" : "businesses"} · ${draft.planId === "starter" ? `setting up ${draft.businesses[0]?.name} now` : `setting up all ${count} now`}`}
        </div>
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
          Continue
        </button>
      </footer>
    </>
  )
}

function BusinessLink({
  value,
  id,
  onChange,
  onAvailable,
  emailDomain,
  forceEdit,
  onForcedEditOpened,
}: {
  value: string
  id: string
  onChange: (value: string) => void
  onAvailable: (id: string, requested: string, canonical: string) => void
  emailDomain?: string
  forceEdit?: boolean
  onForcedEditOpened?: () => void
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
      forceEdit={forceEdit}
      onForcedEditOpened={onForcedEditOpened}
      onChange={onChange}
      onCheck={check}
    />
  )
}
