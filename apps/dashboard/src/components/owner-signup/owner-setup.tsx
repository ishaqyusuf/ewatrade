"use client"

import { useTRPC } from "@/trpc/client"
import {
  OwnerSignupFrame,
  StoreLinkField,
} from "@ewatrade/onboarding/components/signup/signup-flow"
import { Input } from "@ewatrade/ui"
import {
  type OwnerSetupDraft,
  reconcileOwnerBusinessTypes,
  syncOwnerSignupPlan,
} from "@ewatrade/utils/owner-signup"
import { normalizeStoreLink } from "@ewatrade/utils/store-link"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useRef, useState } from "react"
import { OwnerGroupStep } from "./group-step"
import {
  OWNER_PLAN_LIMITS,
  type OwnerSetup,
  businessLabel,
  initialOwnerDraft,
  storeReady,
  typeLabel,
} from "./model"
import { OwnerSetupRail } from "./setup-rail"
import { OwnerStoreStep } from "./store-step"
import { OwnerTypeStep } from "./type-step"
import { useOwnerDraft } from "./use-owner-draft"

export function OwnerSetupEntry() {
  const trpc = useTRPC()
  const query = useQuery(trpc.tenant.ownerSignupSetup.queryOptions())
  if (query.isPending)
    return (
      <main className="signup-main">
        <output>Loading your setup…</output>
      </main>
    )
  if (query.error)
    return (
      <main className="signup-main">
        <h1>Your setup is saved.</h1>
        <p role="alert">{query.error.message}</p>
        <button
          type="button"
          className="signup-primary"
          onClick={() => void query.refetch()}
        >
          Try again
        </button>
        <a href="/login">Sign in again</a>
      </main>
    )
  if (!query.data) return <StartOwnerSetup onPending={() => query.refetch()} />
  return <OwnerSetupForm key={query.data.tenantId} setup={query.data} />
}

/**
 * No pending setup: finished owners go Home; a business without a Store, or an
 * account without a business, starts the same type → group → store flow.
 */
function StartOwnerSetup({ onPending }: { onPending: () => unknown }) {
  const trpc = useTRPC()
  const router = useRouter()
  const [needsBusiness, setNeedsBusiness] = useState(false)
  const [businessName, setBusinessName] = useState("")
  const [slug, setSlug] = useState("")
  const [slugEdited, setSlugEdited] = useState(false)
  const [link, setLink] = useState<{
    slug: string
    available: boolean
    requestedSlug: string
  } | null>(null)
  const checkLink = useCallback((value: typeof link) => setLink(value), [])
  const start = useMutation(
    trpc.tenant.startOwnerSetup.mutationOptions({
      onSuccess(result) {
        if (result.status === "complete") router.replace("/")
        else if (result.status === "pending") void onPending()
        else setNeedsBusiness(true)
      },
    }),
  )
  const started = useRef(false)
  useEffect(() => {
    if (started.current) return
    started.current = true
    start.mutate(undefined)
  }, [start])
  const ready = Boolean(
    businessName.trim() &&
      link?.available &&
      link.requestedSlug === slug &&
      !start.isPending,
  )
  if (!needsBusiness)
    return (
      <main className="signup-main">
        {start.error ? (
          <>
            <h1>Your setup could not start.</h1>
            <p role="alert">{start.error.message}</p>
            <button
              type="button"
              className="signup-primary"
              onClick={() => start.mutate(undefined)}
            >
              Try again
            </button>
          </>
        ) : (
          <output>Loading your setup…</output>
        )}
      </main>
    )
  return (
    <OwnerSignupFrame name={businessName} slug={link?.slug ?? ""} step="type">
      <main className="signup-main owner-account">
        <p className="signup-eyebrow">Your business</p>
        <h1>Name your business</h1>
        <p className="signup-intro">
          Your store gets its own free link. You choose the type next.
        </p>
        {start.error && (
          <p role="alert" className="owner-error">
            {start.error.message}
          </p>
        )}
        <form
          onSubmit={(event) => {
            event.preventDefault()
            if (ready)
              start.mutate({
                businessName: businessName.trim(),
                requestedSlug: link?.slug ?? slug,
              })
          }}
        >
          <fieldset className="owner-fields" disabled={start.isPending}>
            <label className="signup-label" htmlFor="owner-setup-business">
              Business name
              <Input
                id="owner-setup-business"
                className="signup-input"
                placeholder="Your business name"
                autoComplete="organization"
                maxLength={120}
                required
                value={businessName}
                onChange={(event) => {
                  const next = event.target.value
                  setBusinessName(next)
                  if (!slugEdited) setSlug(normalizeStoreLink(next))
                }}
              />
            </label>
            <StoreLinkField
              value={slug}
              onChange={(next) => {
                setSlugEdited(true)
                setSlug(next)
              }}
              onCheck={checkLink}
            />
          </fieldset>
          <button className="signup-primary" disabled={!ready} type="submit">
            {start.isPending ? "Saving…" : "Continue"}
          </button>
        </form>
      </main>
    </OwnerSignupFrame>
  )
}

function OwnerSetupForm({ setup }: { setup: OwnerSetup }) {
  const [draft, setDraft] = useState<OwnerSetupDraft>(() =>
    initialOwnerDraft(setup),
  )
  const main = useRef<HTMLElement>(null)
  useEffect(() => {
    main.current?.setAttribute(
      "aria-label",
      draft.step === "store"
        ? `Store ${(draft.storeIndex ?? 0) + 1}`
        : draft.step === "group"
          ? "Organise your businesses"
          : "Choose your business types",
    )
    main.current?.focus()
  }, [draft.step, draft.storeIndex])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")
  const [conflictBusinessId, setConflictBusinessId] = useState<string>()
  const clearConflict = useCallback(() => setConflictBusinessId(undefined), [])
  const storage = useOwnerDraft(draft)
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const router = useRouter()
  const selected = draft.selectedTypeKeys ?? []
  const current = draft.businesses[draft.storeIndex ?? 0] ?? draft.businesses[0]
  const wide = draft.step !== "store"
  const setupNow = draft.businesses.slice(0, OWNER_PLAN_LIMITS[draft.planId])
  function nextTypes() {
    const first = draft.businesses[0]
    if (!first) return
    const arranged =
      draft.groupedFor === selected.join(",")
        ? draft
        : (() => {
            const businesses = reconcileOwnerBusinessTypes(
              draft.businesses,
              selected,
              first,
              draft.otherType ?? "",
            )
            return {
              ...draft,
              businesses,
              groupedFor: selected.join(","),
              planId: syncOwnerSignupPlan(draft.planId, businesses.length),
            }
          })()
    setError("")
    setDraft({
      ...arranged,
      step: selected.length > 1 ? "group" : "store",
      storeIndex: 0,
    })
  }
  async function nextStore() {
    if (submitting) return
    const index = draft.storeIndex ?? 0
    if (!setupNow[index] || !storeReady(setupNow[index])) return
    if (index < setupNow.length - 1) {
      setDraft({ ...draft, storeIndex: index + 1 })
      return
    }
    const incomplete = setupNow.findIndex((business) => !storeReady(business))
    if (incomplete !== -1) {
      setDraft({ ...draft, storeIndex: incomplete })
      setError(
        "Choose a country and currency for each business you’re setting up.",
      )
      return
    }
    setSubmitting(true)
    const result = await storage.complete()
    if (result.completed) {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: trpc.tenant.ownerSignupSetup.queryKey(),
        }),
        queryClient.invalidateQueries({
          queryKey: trpc.tenant.ownerSignupSummary.queryKey(),
        }),
        queryClient.invalidateQueries({
          queryKey: trpc.tenant.businesses.queryKey(),
        }),
      ])
      router.replace("/")
      router.refresh()
    } else {
      setSubmitting(false)
      if (
        result.businessId &&
        draft.businesses.some(
          (business, index) => index > 0 && business.id === result.businessId,
        )
      ) {
        setConflictBusinessId(result.businessId)
        setDraft((current) => ({ ...current, step: "group" }))
      }
    }
  }
  const rail = <OwnerSetupRail draft={draft} />
  return (
    <OwnerSignupFrame
      wide={wide}
      step={draft.step}
      typeKeys={current?.typeKeys}
      otherType={draft.otherType}
      operatingModel={current?.operatingModel}
      address={[current?.addressLine1, current?.city, current?.region]
        .filter(Boolean)
        .join(", ")}
      planId={draft.planId}
      rail={rail}
      name={current?.name || setup.name}
      slug={current?.slug || setup.slug}
      description={current?.description}
    >
      <main ref={main} tabIndex={-1} className="signup-main owner-setup-main">
        <div className="owner-save-status">
          <output aria-live="polite">
            {storage.state === "saving"
              ? "Saving progress…"
              : storage.state === "saved"
                ? "Progress saved"
                : "Progress not saved"}
          </output>
          {storage.state === "error" && (
            <button
              type="button"
              className="owner-text-button"
              onClick={() => void storage.retry().catch(() => undefined)}
            >
              Retry save
            </button>
          )}
        </div>
        {(storage.error || error) && (
          <p className="owner-error" role="alert">
            {error || storage.error}
          </p>
        )}
        <fieldset disabled={submitting} className="owner-fields">
          {draft.step === "type" && (
            <OwnerTypeStep
              selected={selected}
              other={draft.otherType ?? ""}
              onChange={(selectedTypeKeys) =>
                setDraft((current) => ({ ...current, selectedTypeKeys }))
              }
              onOther={(otherType) =>
                setDraft((current) => ({
                  ...current,
                  otherType,
                  businesses: current.businesses.map((b) =>
                    b.typeKeys.includes("other") ? { ...b, otherType } : b,
                  ),
                }))
              }
              onNext={nextTypes}
            />
          )}
          {draft.step === "group" && (
            <OwnerGroupStep
              draft={draft}
              emailDomain={setup.emailDomain}
              forceEditBusinessId={conflictBusinessId}
              onForcedEditOpened={clearConflict}
              onChange={setDraft}
              onBack={() => setDraft({ ...draft, step: "type" })}
              disabled={submitting}
              onNext={(next) =>
                setDraft({ ...next, step: "store", storeIndex: 0 })
              }
            />
          )}
          {draft.step === "store" && (
            <OwnerStoreStep
              draft={draft}
              onChange={setDraft}
              disabled={submitting}
              onNext={() => void nextStore()}
              onBack={() =>
                setDraft({
                  ...draft,
                  step:
                    (draft.storeIndex ?? 0) > 0
                      ? "store"
                      : selected.length > 1
                        ? "group"
                        : "type",
                  storeIndex: Math.max(0, (draft.storeIndex ?? 0) - 1),
                })
              }
            />
          )}
        </fieldset>
      </main>
    </OwnerSignupFrame>
  )
}
