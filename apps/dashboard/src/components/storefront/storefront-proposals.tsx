"use client"

import { getDataCacheGeneration, useTRPC, useTRPCClient } from "@/trpc/client"
import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import {
  designRationale,
  missingDesignAssets,
  storefrontDesignChanges,
  storefrontDesignOutputSchema,
} from "@ewatrade/storefront-contracts/design"
import type { StorefrontComposition } from "@ewatrade/storefront-contracts/manifest"
import type { StorefrontClientSnapshot } from "@ewatrade/storefront-runtime/server"
import {
  getTemplateManifest,
  listSelectableTemplates,
  templateRegistry,
} from "@ewatrade/storefront-templates"
import { StorefrontTemplate } from "@ewatrade/storefront-templates/render"
import {
  Button,
  Input,
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@ewatrade/ui"
import { useQuery } from "@tanstack/react-query"
import { useSearchParams } from "next/navigation"
import { useEffect, useId, useMemo, useRef, useState } from "react"
import "@ewatrade/storefront-templates/styles.css"

type Acceptance = Extract<
  RouterOutputs["storefront"]["acceptDesign"],
  { ok: true }
>
type Conflict = Extract<
  RouterOutputs["storefront"]["acceptDesign"],
  { ok: false }
>["current"]
const active = (status?: string) =>
  status === "QUEUED" || status === "RUNNING" || status === "VALIDATING"
const phases: Record<string, string> = {
  QUEUED: "Queued",
  RUNNING: "Creating designs…",
  VALIDATING: "Checking designs…",
  READY: "Ready to compare",
  FAILED: "Design run failed",
  CANCELLED: "Cancelled",
}

/** Owner-selected Comparison sheet01. One shared private resource load for three real renderer previews. */
export function StorefrontProposals(props: {
  siteId: string
  revision: number
  composition: StorefrontComposition
  liveRevision: number | null
  dirty: boolean
  busy: boolean
  onPreview: (composition: StorefrontComposition | null) => void
  onAccepted: (result: Acceptance) => void
  onConflict: (current: Conflict) => void
}) {
  const api = useTRPCClient()
  const trpc = useTRPC()
  const params = useSearchParams()
  const requestedRun = params.get("designRun")
  const [open, setOpen] = useState(!!requestedRun)
  const [runId, setRunId] = useState(requestedRun ?? "")
  const [directionId, setDirectionId] = useState<"01" | "02" | "03" | null>(
    null,
  )
  const [journey, setJourney] = useState<"browse" | "request">("browse")
  const [refinement, setRefinement] = useState("")
  const refinementId = useId()
  const [large, setLarge] = useState(false)
  const [largeViewport, setLargeViewport] = useState<"desktop" | "mobile">(
    "desktop",
  )
  const [tracking, setTracking] = useState(false)
  const largeOpener = useRef<string | null>(null)
  const largeClose = useRef<HTMLButtonElement>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState("")
  const [snapshot, setSnapshot] = useState<{
    values: StorefrontClientSnapshot[]
    runId: string
    revision: number
    expiresAt: number
  } | null>(null)
  const inFlight = useRef(false)
  const alive = useRef(true)
  const intent = useRef<{ signature: string; key: string } | null>(null)
  const previewEpoch = useRef(0)
  const runs = useQuery(
    trpc.storefront.generations.queryOptions(undefined, {
      enabled: open || tracking,
      retry: false,
      refetchOnWindowFocus: false,
      refetchInterval: (query) =>
        query.state.data?.runs.some((run) => active(run.status)) ? 3000 : false,
    }),
  )
  const listed = runId
    ? runs.data?.runs.find((run) => run.id === runId)
    : runs.data?.runs[0]
  const requestedId = runId || listed?.id || ""
  useEffect(() => {
    if (runs.data) setTracking(runs.data.runs.some((run) => active(run.status)))
  }, [runs.data])
  const result = useQuery(
    trpc.storefront.generation.queryOptions(
      { expectedSiteId: props.siteId, runId: requestedId },
      {
        enabled: open && (listed?.status === "READY" || (!!runId && !listed)),
        retry: false,
        staleTime: Number.POSITIVE_INFINITY,
        refetchOnWindowFocus: false,
      },
    ),
  )
  const selected =
    listed ?? (result.data?.id === requestedId ? result.data : undefined)
  const output = useMemo(() => {
    const parsed = storefrontDesignOutputSchema.safeParse(result.data?.output)
    return selected?.status === "READY" &&
      result.data?.id === selected.id &&
      parsed.success &&
      parsed.data.directions.every((direction) =>
        listSelectableTemplates().some(
          (entry) =>
            entry.manifest.key === direction.composition.template.key &&
            entry.manifest.version === direction.composition.template.version,
        ),
      )
      ? parsed.data
      : null
  }, [result.data, selected?.id, selected?.status])
  const candidate = output?.directions.find((entry) => entry.id === directionId)
  const candidateIndex =
    output?.directions.findIndex((entry) => entry.id === directionId) ?? -1
  const closeLarge = () => {
    setLarge(false)
    requestAnimationFrame(() => {
      if (largeOpener.current)
        document.getElementById(largeOpener.current)?.focus()
    })
  }
  useEffect(() => {
    if (large) largeClose.current?.focus()
  }, [large])
  const stale = !!selected && selected.baseRevision !== props.revision
  const locked = pending || props.busy
  const previewReady =
    !!snapshot &&
    snapshot.revision === props.revision &&
    snapshot.runId === selected?.id &&
    snapshot.expiresAt > Date.now()
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
      previewEpoch.current++
    }
  }, [])
  useEffect(() => {
    if (
      !open ||
      !output ||
      !selected ||
      (snapshot?.revision === props.revision &&
        snapshot.runId === selected.id &&
        snapshot.expiresAt > Date.now())
    )
      return
    const generation = getDataCacheGeneration()
    const epoch = ++previewEpoch.current
    const load = async () => {
      try {
        const session = await api.storefront.previewSession.mutate()
        const preview = await api.storefront.preview.query({
          session: session.session,
          query: {},
          designs: output.directions.map((direction) => direction.composition),
        })
        if (
          alive.current &&
          generation === getDataCacheGeneration() &&
          epoch === previewEpoch.current
        )
          setSnapshot({
            values: preview.designSnapshots,
            runId: selected.id,
            revision: preview.draftRevision,
            expiresAt: preview.expiresAt,
          })
      } catch (cause) {
        if (
          alive.current &&
          generation === getDataCacheGeneration() &&
          epoch === previewEpoch.current
        )
          setError(
            cause instanceof Error
              ? cause.message
              : "Private previews are unavailable.",
          )
      }
    }
    void load()
  }, [api, open, props.revision, snapshot, output, selected])
  useEffect(() => {
    if (!snapshot) return
    const timer = setTimeout(
      () => {
        setSnapshot(null)
        props.onPreview(null)
      },
      Math.max(0, snapshot.expiresAt - Date.now()),
    )
    return () => clearTimeout(timer)
  }, [snapshot, props.onPreview])
  const execute = async (operation: () => Promise<void>) => {
    if (inFlight.current || props.busy) return
    inFlight.current = true
    const generation = getDataCacheGeneration()
    setPending(true)
    setError("")
    try {
      await operation()
    } catch (cause) {
      if (alive.current && generation === getDataCacheGeneration())
        setError(
          cause instanceof Error
            ? cause.message
            : "The design request couldn't be completed.",
        )
    } finally {
      inFlight.current = false
      if (alive.current && generation === getDataCacheGeneration())
        setPending(false)
    }
  }
  const generate = async () => {
    if (props.dirty || !runs.data?.available || active(selected?.status)) return
    const generation = getDataCacheGeneration()
    const signature = JSON.stringify([
      props.siteId,
      props.revision,
      journey,
      refinement.trim(),
    ])
    if (intent.current?.signature !== signature)
      intent.current = { signature, key: crypto.randomUUID() }
    const next = await api.storefront.generate.mutate({
      expectedSiteId: props.siteId,
      expectedDraftRevision: props.revision,
      desiredJourney: journey,
      refinement,
      clientRequestId: intent.current.key,
    })
    if (!alive.current || generation !== getDataCacheGeneration()) return
    // A returned run is durable; a deliberate later refinement gets a new intent.
    intent.current = null
    setRunId(next.run.id)
    setDirectionId(null)
    setTracking(true)
    props.onPreview(null)
    await runs.refetch()
  }
  const cancel = async () => {
    if (!selected) return
    const generation = getDataCacheGeneration()
    await api.storefront.cancelGeneration.mutate({
      expectedSiteId: props.siteId,
      runId: selected.id,
    })
    if (!alive.current || generation !== getDataCacheGeneration()) return
    props.onPreview(null)
    await runs.refetch()
  }
  const accept = async () => {
    if (
      !candidate ||
      !selected ||
      props.dirty ||
      stale ||
      selected.acceptedDirectionId
    )
      return
    const generation = getDataCacheGeneration()
    const next = await api.storefront.acceptDesign.mutate({
      expectedSiteId: props.siteId,
      runId: selected.id,
      directionId: candidate.id,
      expectedRevision: selected.baseRevision,
    })
    if (!alive.current || generation !== getDataCacheGeneration()) return
    if (!next.ok) {
      props.onConflict(next.current)
      setError(
        "The draft or proposal changed. Your local edits are kept; reload the current draft before generating fresh designs.",
      )
      return
    }
    props.onPreview(null)
    props.onAccepted(next)
    setOpen(false)
    await runs.refetch()
  }
  return (
    <Sheet
      open={open}
      onOpenChange={(value) => {
        setOpen(value)
        if (!value) setLarge(false)
      }}
    >
      <SheetTrigger render={<Button variant="outline" disabled={props.busy} />}>
        {active(selected?.status)
          ? phases[selected?.status ?? ""]
          : selected?.status === "READY" && !selected.acceptedDirectionId
            ? "Designs ready"
            : "Suggest designs"}
      </SheetTrigger>
      <SheetContent
        onKeyDownCapture={(event) => {
          if (event.key === "Escape" && large) {
            event.preventDefault()
            event.stopPropagation()
            closeLarge()
          }
        }}
        popupClassName="sf-proposals-popup"
        className="sf-proposals-sheet"
      >
        <header className="sf-proposals-header">
          <div>
            <SheetTitle>
              {large ? "Large design preview" : "Design suggestions"}
            </SheetTitle>
            <p>
              Draft revision {props.revision} · accepting a design saves a
              draft.
            </p>
          </div>
          <div className="sf-studio-actions">
            {large ? (
              <Button ref={largeClose} variant="outline" onClick={closeLarge}>
                Back to comparison
              </Button>
            ) : null}
            <Button variant="outline" onClick={() => setOpen(false)}>
              Close
            </Button>
          </div>
        </header>
        <dl className="sf-proposals-facts">
          <div>
            <dt>Based on</dt>
            <dd>
              {selected
                ? `Draft rev ${selected.baseRevision}`
                : `Draft rev ${props.revision}`}
            </dd>
          </div>
          <div>
            <dt>Your draft</dt>
            <dd>
              rev {props.revision}
              {stale
                ? " · Changed"
                : props.dirty
                  ? " · Unsaved edits"
                  : " · saved"}
            </dd>
          </div>
          <div>
            <dt>Live</dt>
            <dd>
              {props.liveRevision === null
                ? "Not published"
                : `rev ${props.liveRevision}`}
            </dd>
          </div>
          <div>
            <dt>Uses</dt>
            <dd>
              {snapshot?.values[0]
                ? `${snapshot.values[0].resources.catalog.items.length} current catalog items · public business profile · approved illustrations`
                : "Current public catalog and approved design assets"}
            </dd>
          </div>
        </dl>
        <div className="sf-proposals-scroll">
          {error || runs.error || result.error ? (
            <p role="alert">
              {error || runs.error?.message || result.error?.message}
            </p>
          ) : null}
          {props.dirty ? (
            <output>
              Save your edits and resolve any conflict before generating or
              accepting designs. Your work is kept.
            </output>
          ) : null}
          {runs.isPending ? (
            <p>Loading design runs…</p>
          ) : runs.data && !runs.data.available ? (
            <p>
              Design generation isn't available yet. Saved proposals remain
              here.
            </p>
          ) : null}
          <div className="sf-proposals-controls" hidden={large}>
            <label>
              Design focus
              <select
                value={journey}
                onChange={(event) =>
                  setJourney(
                    event.target.value === "request" ? "request" : "browse",
                  )
                }
                disabled={locked}
              >
                <option value="browse">Browse the collection</option>
                <option value="request">Explore services and request</option>
              </select>
            </label>
            <Button
              disabled={
                locked ||
                props.dirty ||
                !runs.data?.available ||
                runs.data.runs.some((run) => active(run.status))
              }
              onClick={() => void execute(generate)}
            >
              {pending
                ? "Working…"
                : output
                  ? "Refine with three new designs"
                  : "Suggest three designs"}
            </Button>
          </div>
          {selected?.status === "READY" && result.data?.output && !output ? (
            <output>
              These designs use unavailable versions. Suggest new designs to
              continue.
            </output>
          ) : null}
          {runs.data?.runs.length ? (
            <label className="sf-proposals-history">
              Design run
              <select
                value={selected?.id ?? ""}
                disabled={locked}
                onChange={(event) => {
                  setRunId(event.target.value)
                  setDirectionId(null)
                  setLarge(false)
                  props.onPreview(null)
                }}
              >
                {selected &&
                !runs.data.runs.some((run) => run.id === selected.id) ? (
                  <option value={selected.id}>
                    Saved run · revision {selected.baseRevision} ·{" "}
                    {phases[selected.status]}
                  </option>
                ) : null}
                {runs.data.runs.map((run) => (
                  <option value={run.id} key={run.id}>
                    {new Date(run.createdAt).toLocaleString()} · revision{" "}
                    {run.baseRevision} · {phases[run.status]}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {selected ? (
            <div className="sf-proposals-progress" aria-live="polite">
              <p>
                {phases[selected.status]} · based on revision{" "}
                {selected.baseRevision}
                {selected.acceptedDraftRevision
                  ? ` · accepted as revision ${selected.acceptedDraftRevision}`
                  : ""}
              </p>
              {selected.needsReconciliation ? (
                <p>
                  The provider outcome is uncertain. Its usage allowance remains
                  held for review; this run won't be sent again.
                </p>
              ) : null}
              {selected.status === "FAILED" ? (
                <p>
                  No draft changed. You can make a new request if generation and
                  your allowance are available.
                </p>
              ) : null}
              {active(selected.status) ? (
                <Button
                  variant="outline"
                  disabled={locked}
                  onClick={() => void execute(cancel)}
                >
                  Cancel run
                </Button>
              ) : null}
            </div>
          ) : null}
          {stale ? (
            <p role="alert">
              The draft has changed since this run. Previewing is allowed;
              acceptance is blocked. Generate fresh designs from revision{" "}
              {props.revision}.
            </p>
          ) : null}
          {active(selected?.status) ? (
            <ol className="sf-proposals-steps" aria-label="Design progress">
              {["QUEUED", "RUNNING", "VALIDATING", "READY"].map((status) => (
                <li
                  key={status}
                  aria-current={
                    selected?.status === status ? "step" : undefined
                  }
                >
                  {phases[status]}
                </li>
              ))}
            </ol>
          ) : null}
          {large && candidate && snapshot && previewReady ? (
            <div className="sf-proposals-large">
              <div className="sf-proposals-controls">
                <label>
                  Design
                  <select
                    value={directionId ?? ""}
                    onChange={(event) => {
                      const direction = output?.directions.find(
                        (entry) => entry.id === event.target.value,
                      )
                      if (direction) setDirectionId(direction.id)
                    }}
                  >
                    {output?.directions.map((direction) => (
                      <option key={direction.id} value={direction.id}>
                        {direction.id} ·{" "}
                        {getTemplateManifest(direction.composition).name}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="sf-studio-actions">
                  {(["desktop", "mobile"] as const).map((viewport) => (
                    <Button
                      key={viewport}
                      variant="outline"
                      aria-pressed={largeViewport === viewport}
                      onClick={() => setLargeViewport(viewport)}
                    >
                      {viewport === "desktop" ? "Desktop" : "Mobile"}
                    </Button>
                  ))}
                </div>
              </div>
              <div className="sf-proposals-large-stage">
                <section
                  className={`sf-proposals-large-screen ${largeViewport}`}
                  // biome-ignore lint/a11y/noNoninteractiveTabindex: A read-only scroll region needs keyboard scrolling.
                  tabIndex={0}
                  aria-label="Large read-only design preview"
                >
                  <div inert>
                    {snapshot.values[candidateIndex] ? (
                      <StorefrontTemplate
                        snapshot={snapshot.values[candidateIndex]}
                        draftPreview
                        domain={`${snapshot.values[candidateIndex].resources.business.slug}.ewatrade.com`}
                        customerChatOrigin=""
                      />
                    ) : null}
                  </div>
                </section>
              </div>
              <ul>
                {candidate.rationale.map((code) => (
                  <li key={code}>{designRationale[code]}</li>
                ))}
              </ul>
              <ProposalChanges
                before={props.composition}
                after={candidate.composition}
                revision={props.revision}
              />
              <Button variant="outline" onClick={closeLarge}>
                Choose this design
              </Button>
            </div>
          ) : output ? (
            <>
              <div className="sf-proposals-grid">
                {output.directions.map((direction, index) => {
                  const manifest = getTemplateManifest(direction.composition)
                  return (
                    <article
                      className="sf-proposal"
                      key={`${selected?.id}:${direction.id}`}
                      data-selected={direction.id === directionId}
                    >
                      <button
                        type="button"
                        aria-pressed={direction.id === directionId}
                        disabled={locked}
                        onClick={() => setDirectionId(direction.id)}
                      >
                        {direction.id} · {manifest.name}
                      </button>
                      <p>{manifest.name} template</p>
                      <section
                        className="sf-proposal-mini"
                        // biome-ignore lint/a11y/noNoninteractiveTabindex: A read-only scroll region needs keyboard scrolling.
                        tabIndex={0}
                        aria-label={`${direction.id} read-only design preview`}
                      >
                        <div inert>
                          {previewReady && snapshot?.values[index] ? (
                            <StorefrontTemplate
                              snapshot={snapshot.values[index]}
                              draftPreview
                              domain={`${snapshot.values[index]?.resources.business.slug}.ewatrade.com`}
                              customerChatOrigin=""
                            />
                          ) : (
                            <p>Loading private preview…</p>
                          )}
                        </div>
                      </section>
                      <h3>Why this design</h3>
                      <ul>
                        {direction.rationale.map((code) => (
                          <li key={code}>{designRationale[code]}</li>
                        ))}
                      </ul>
                      {direction.missingAssets.map((code) => (
                        <p key={code}>{missingDesignAssets[code]}</p>
                      ))}
                      <ProposalChanges
                        before={props.composition}
                        after={direction.composition}
                        revision={props.revision}
                      />
                      <details>
                        <summary>Public sources used</summary>
                        <p>
                          {direction.sourceReferences.join(", ") ||
                            "Template defaults only"}
                        </p>
                      </details>
                      <Button
                        id={`proposal-large-${direction.id}`}
                        variant="outline"
                        disabled={locked || !previewReady}
                        onClick={() => {
                          largeOpener.current = `proposal-large-${direction.id}`
                          setDirectionId(direction.id)
                          setLarge(true)
                        }}
                      >
                        Open large preview
                      </Button>
                    </article>
                  )
                })}
              </div>
              <p className="sf-proposals-same">
                Same in every design: current catalog prices and availability,
                business identity and customer permissions.{" "}
                {props.liveRevision === null
                  ? "No live release is created by accepting."
                  : `Live revision ${props.liveRevision} stays live until you publish.`}
              </p>
            </>
          ) : null}
          {!large ? (
            <label className="sf-proposals-refine" htmlFor={refinementId}>
              Not quite right? Describe what to change (optional)
              <Input
                id={refinementId}
                maxLength={500}
                value={refinement}
                disabled={locked}
                onChange={(event) => setRefinement(event.target.value)}
              />
              <span>
                Layout and styling only. Business facts still come from your
                public profile and catalog.
              </span>
            </label>
          ) : null}
        </div>
        <footer className="sf-proposals-footer">
          <p>
            {candidate
              ? `${candidate.id} · ${getTemplateManifest(candidate.composition).name} becomes draft rev ${props.revision + 1}.`
              : "Choose a design to compare."}{" "}
            Live content changes only through Review & publish.
          </p>
          <div className="sf-studio-actions">
            <Button
              variant="outline"
              disabled={locked || !candidate || !previewReady}
              onClick={() => {
                if (candidate) props.onPreview(candidate.composition)
                setOpen(false)
              }}
            >
              Preview in editor
            </Button>
            <Button
              variant="outline"
              disabled={locked || !output || !!selected?.acceptedDirectionId}
              onClick={() => void execute(cancel)}
            >
              Reject proposals
            </Button>
            <Button
              disabled={
                locked ||
                props.dirty ||
                stale ||
                !candidate ||
                !!selected?.acceptedDirectionId
              }
              onClick={() => void execute(accept)}
            >
              Use {candidate?.id ?? "design"} as draft
            </Button>
          </div>
        </footer>
      </SheetContent>
    </Sheet>
  )
}

function ProposalChanges({
  before,
  after,
  revision,
}: {
  before: StorefrontComposition
  after: StorefrontComposition
  revision: number
}) {
  const changes = storefrontDesignChanges(
    before,
    after,
    templateRegistry.map((entry) => entry.manifest),
  )
  return (
    <div className="sf-proposal-changes">
      <h3>Changes from your draft rev {revision}</h3>
      {changes.length ? (
        <dl>
          {changes.map((change) => (
            <div key={change.label}>
              <dt>{change.label}</dt>
              <dd>
                <span>{change.before}</span> → <strong>{change.after}</strong>
              </dd>
            </div>
          ))}
        </dl>
      ) : (
        <p>No layout or settings changes.</p>
      )}
    </div>
  )
}
