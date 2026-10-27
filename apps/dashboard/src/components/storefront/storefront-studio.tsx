"use client"

import { useStorefrontParams } from "@/hooks/use-storefront-params"
import { getDataCacheGeneration, useTRPC, useTRPCClient } from "@/trpc/client"
import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import {
  type EditableField,
  type SettingValue,
  type StorefrontComposition,
  validateComposition,
} from "@ewatrade/storefront-contracts/manifest"
import { storefrontDesignAssets } from "@ewatrade/storefront-runtime/design-assets"
import type { StorefrontClientSnapshot } from "@ewatrade/storefront-runtime/server"
import {
  availableDraftUpgrade,
  canvasPage,
  canvasSection,
  getTemplateManifest,
  insertSectionExcerpt,
  isCanvasComposition,
  listSelectableTemplates,
  replaceDraftTemplate,
  sectionPolicy,
  upgradeCanvasDraft,
  upgradeDraftVersion,
} from "@ewatrade/storefront-templates"
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  Input,
  Sheet,
  SheetContent,
  SheetTitle,
  Textarea,
} from "@ewatrade/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useId, useRef, useState } from "react"
import { StorefrontCanvasPreview } from "./storefront-canvas-preview"
import { StorefrontCatalogItemsField } from "./storefront-catalog-items-field"
import { StorefrontPhrasesPopover } from "./storefront-phrases-popover"
import { StorefrontProposals } from "./storefront-proposals"
import { StorefrontSectionDialog } from "./storefront-section-dialog"
import { StorefrontSectionOutline } from "./storefront-section-outline"
import { StorefrontStudioSkeleton } from "./storefront-skeleton"
import { StorefrontTemplateDialog } from "./storefront-template-dialog"
import "./studio.css"

type Draft = NonNullable<RouterOutputs["storefront"]["draft"]>
type Store = { id: string; name: string; operatingModel?: string | null }
const message = (error: unknown) =>
  error instanceof Error
    ? error.message
    : "The storefront couldn't be updated. Try again."

export function StorefrontStudio({ stores }: { stores: Store[] }) {
  const trpc = useTRPC()
  const draft = useQuery(
    trpc.storefront.draft.queryOptions(undefined, {
      retry: false,
      refetchOnWindowFocus: false,
    }),
  )
  const [storeId, setStoreId] = useState(stores[0]?.id ?? "")
  const [templatePin, setTemplatePin] = useState(() => {
    const entry =
      listSelectableTemplates().find(
        (entry) => entry.manifest.key === "catalog-v4",
      ) ?? listSelectableTemplates()[0]
    return entry ? `${entry.manifest.key}@${entry.manifest.version}` : ""
  })
  const initialize = useMutation(
    trpc.storefront.initialize.mutationOptions({
      onSuccess: () => {
        void draft.refetch()
      },
    }),
  )
  if (draft.isPending) return <StorefrontStudioSkeleton />
  if (draft.error)
    return (
      <div className="p-6" role="alert">
        <p>{draft.error.message}</p>
        <Button onClick={() => void draft.refetch()}>Try again</Button>
      </div>
    )
  if (!draft.data)
    return (
      <section className="sf-studio sf-studio-empty">
        <h1>Storefront studio</h1>
        <p>Start a draft for the Store you want to show online.</p>
        <label>
          Store
          <select
            value={storeId}
            onChange={(event) => setStoreId(event.target.value)}
          >
            {stores.map((store) => (
              <option key={store.id} value={store.id}>
                {store.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Template
          <select
            value={templatePin}
            onChange={(event) => setTemplatePin(event.target.value)}
          >
            {listSelectableTemplates().map(({ manifest }) => (
              <option
                key={`${manifest.key}@${manifest.version}`}
                value={`${manifest.key}@${manifest.version}`}
              >
                {manifest.name} · {manifest.version}
              </option>
            ))}
          </select>
        </label>
        <Button
          disabled={!storeId || !templatePin || initialize.isPending}
          onClick={() => {
            const entry = listSelectableTemplates().find(
              (entry) =>
                `${entry.manifest.key}@${entry.manifest.version}` ===
                templatePin,
            )
            if (entry)
              initialize.mutate({
                storeId,
                templateKey: entry.manifest.key,
                templateVersion: entry.manifest.version,
              })
          }}
        >
          {initialize.isPending ? "Starting…" : "Start draft"}
        </Button>
        {initialize.error ? (
          <p role="alert">{initialize.error.message}</p>
        ) : null}
        {initialize.data && !initialize.data.ok ? (
          <p role="alert">
            A primary storefront already belongs to another Store. Reload the
            workspace.
          </p>
        ) : null}
        <p>Starting a draft does not publish it.</p>
      </section>
    )
  try {
    const composition = validateComposition(
      draft.data.draft.composition,
      getTemplateManifest(draft.data.draft.composition),
    )
    return (
      <StudioEditor
        key={draft.data.siteId}
        initial={draft.data}
        composition={composition}
        stores={stores}
      />
    )
  } catch {
    return (
      <p role="alert" className="p-6">
        This saved draft uses an unavailable design. Reload or contact support
        before editing it.
      </p>
    )
  }
}

function StudioEditor({
  initial,
  composition: initialComposition,
  stores,
}: { initial: Draft; composition: StorefrontComposition; stores: Store[] }) {
  const trpc = useTRPC()
  const api = useTRPCClient()
  const queryClient = useQueryClient()
  const [saved, setSaved] = useState({
    composition: initialComposition,
    revision: initial.draft.revision,
  })
  const [composition, setComposition] = useState(() =>
    upgradeCanvasDraft(initialComposition),
  )
  const router = useRouter()
  const params = useStorefrontParams()
  const pageKey = composition.pages.some((page) => page.key === params.page)
    ? params.page
    : (composition.pages[0]?.key ?? "home")
  const viewport = params.viewport
  const setViewport = (value: "desktop" | "tablet" | "mobile") => {
    void params.setParams({ viewport: value })
  }
  const setPage = (page: string) => {
    setSectionId("")
    setPhrases(null)
    void params.setParams({ page })
  }
  const [snapshot, setSnapshot] = useState<StorefrontClientSnapshot | null>(
    null,
  )
  const [libraryOpen, setLibraryOpen] = useState(false)
  const [templatesOpen, setTemplatesOpen] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [exitOpen, setExitOpen] = useState(false)
  const [phrases, setPhrases] = useState<{
    id: string
    anchor: HTMLElement
  } | null>(null)
  const [redo, setRedo] = useState<StorefrontComposition[]>([])
  const [candidatePreview, setCandidatePreview] =
    useState<StorefrontComposition | null>(null)
  const [undo, setUndo] = useState<StorefrontComposition[]>([])
  const [sectionId, setSectionId] = useState(
    initialComposition.pages[0]?.sections[0]?.id ?? "",
  )
  const [review, setReview] = useState(false)
  const [consent, setConsent] = useState(false)
  const [error, setError] = useState("")
  const [status, setStatus] = useState("")
  const [conflict, setConflict] = useState<{
    composition: StorefrontComposition
    revision: number
  } | null>(null)
  const alive = useRef(true)
  const busyRef = useRef(false)
  const intents = useRef(new Map<string, string>())
  const themeId = useId()
  const intentKey = (signature: string) => {
    const existing = intents.current.get(signature)
    if (existing) return existing
    const key = crypto.randomUUID()
    intents.current.clear()
    intents.current.set(signature, key)
    return key
  }
  const [busy, setBusy] = useState(false)
  const readiness = useQuery(
    trpc.storefront.readiness.queryOptions(undefined, {
      retry: false,
      refetchOnWindowFocus: false,
    }),
  )
  const history = useQuery(
    trpc.storefront.history.queryOptions(
      { take: 20 },
      { retry: false, refetchOnWindowFocus: false },
    ),
  )
  const dirty =
    JSON.stringify(composition) !== JSON.stringify(saved.composition)
  const sections =
    composition.pages.find((page) => page.key === pageKey)?.sections ?? []
  const selected = sections.find((section) => section.id === sectionId)
  const manifest = getTemplateManifest(composition)
  const definition = manifest.sections.find(
    (section) => section.key === selected?.type,
  )
  const versionUpgrade = availableDraftUpgrade(composition)
  // Commerce studio edits copy in Section options; canvas templates edit it in place.
  const inlineTextEditing = manifest.key !== "commerce-studio"
  const edit = useCallback(
    (change: (next: StorefrontComposition) => void) => {
      if (busyRef.current) return false
      const next = structuredClone(composition)
      setCandidatePreview(null)
      try {
        change(next)
        validateComposition(next, getTemplateManifest(next))
      } catch (cause) {
        setError(message(cause))
        return false
      }
      if (JSON.stringify(next) === JSON.stringify(composition)) return true
      setError("")
      setRedo([])
      setUndo((items) => [...items.slice(-19), composition])
      setComposition(next)
      setConsent(false)
      setStatus("")
      return true
    },
    [composition],
  )
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])
  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault()
    }
    window.addEventListener("beforeunload", warn)
    return () => window.removeEventListener("beforeunload", warn)
  }, [dirty])
  const run = async (operation: () => Promise<void>) => {
    if (busyRef.current) return
    busyRef.current = true
    const generation = getDataCacheGeneration()
    setBusy(true)
    setError("")
    try {
      await operation()
    } catch (cause) {
      if (alive.current && generation === getDataCacheGeneration())
        setError(message(cause))
    } finally {
      busyRef.current = false
      if (alive.current && generation === getDataCacheGeneration())
        setBusy(false)
    }
  }
  const current = (generation: number) =>
    alive.current && generation === getDataCacheGeneration()
  const save = async () => {
    const generation = getDataCacheGeneration()
    const next = validateComposition(composition, manifest)
    const result = await api.storefront.saveDraft.mutate({
      expectedSiteId: initial.siteId,
      expectedRevision: saved.revision,
      composition: next,
    })
    if (!current(generation)) return false
    if (!result.ok) {
      setConflict({
        composition: validateComposition(
          result.current.draftComposition,
          getTemplateManifest(result.current.draftComposition),
        ),
        revision: result.current.draftRevision,
      })
      return false
    }
    setSaved({ composition: next, revision: result.draft.revision })
    queryClient.setQueryData(trpc.storefront.draft.queryKey(), {
      siteId: result.siteId,
      storeId: result.storeId,
      status: result.status,
      activeReleaseId: result.activeReleaseId,
      draft: result.draft,
    })
    setUndo([])
    setConflict(null)
    setStatus(`Saved revision ${result.draft.revision}`)
    await readiness.refetch()
    return true
  }
  const move = (id: string, direction: number) =>
    edit((next) => {
      const list = canvasPage(next, pageKey).sections
      const index = list.findIndex((section) => section.id === id)
      if (
        index < 0 ||
        sectionPolicy(manifest, list[index]?.type ?? "").fixedFirst ||
        sectionPolicy(manifest, list[index]?.type ?? "").fixedLast ||
        sectionPolicy(manifest, list[index + direction]?.type ?? "")
          .fixedFirst ||
        sectionPolicy(manifest, list[index + direction]?.type ?? "")
          .fixedLast ||
        index + direction < 0 ||
        index + direction >= list.length
      )
        return
      const from = list[index]
      const to = list[index + direction]
      if (from && to) {
        list[index] = to
        list[index + direction] = from
      }
    })
  const fieldChange = (key: string, value: SettingValue) =>
    edit((next) => {
      const section = canvasPage(next, pageKey).sections.find(
        (section) => section.id === sectionId,
      )
      if (section) section.settings[key] = value
    })
  const publish = async () => {
    if (
      dirty ||
      conflict ||
      !consent ||
      !readiness.data?.canPublish ||
      readiness.data.draftRevision !== saved.revision
    )
      return
    const generation = getDataCacheGeneration()
    const result = await api.storefront.publish.mutate({
      expectedSiteId: initial.siteId,
      expectedDraftRevision: saved.revision,
      expectedActiveReleaseId: readiness.data.activeReleaseId,
      idempotencyKey: intentKey(
        `publish:${saved.revision}:${readiness.data.activeReleaseId}`,
      ),
      publicBrowsingConsent: true,
    })
    if (!current(generation)) return
    if (!result.ok) {
      setError(
        "The draft or live release changed. Refresh readiness and review again.",
      )
      await readiness.refetch()
      return
    }
    setConsent(false)
    setStatus(
      result.activeReleaseId === result.releaseId
        ? `Revision ${saved.revision} activated. Delivery is unverified.`
        : "This publication was already recorded. Another release is now active; refresh status to review it.",
    )
    await Promise.all([readiness.refetch(), history.refetch()])
  }
  const rollback = async (releaseId: string) => {
    if (!readiness.data || !consent || dirty || conflict) return
    const generation = getDataCacheGeneration()
    const result = await api.storefront.rollback.mutate({
      expectedSiteId: initial.siteId,
      releaseId,
      expectedActiveReleaseId: readiness.data.activeReleaseId,
      idempotencyKey: intentKey(
        `rollback:${releaseId}:${readiness.data.activeReleaseId}`,
      ),
    })
    if (!current(generation)) return
    setConsent(false)
    if (!result.ok)
      setError("The live release changed. Reload readiness before restoring.")
    else
      setStatus(
        result.activeReleaseId === result.releaseId
          ? "Selected release restored. The draft is unchanged; delivery is unverified."
          : "This restore was already recorded. Another release is now active; refresh status to review it.",
      )
    await Promise.all([readiness.refetch(), history.refetch()])
  }
  const blocked = busy || !!candidatePreview
  const store = stores.find((entry) => entry.id === initial.storeId)
  const model = store?.operatingModel?.toLowerCase() ?? ""
  const fit = model.includes("mixed")
    ? "mixed"
    : model.includes("service")
      ? "services"
      : "retail"
  const pageLabel =
    manifest.pages.find((page) => page.key === pageKey)?.label ?? "Home"
  const phraseSection = phrases
    ? sections.find((entry) => entry.id === phrases.id)
    : null
  const selectSection = (id: string) => {
    setSectionId(id)
    document
      .querySelector(`[data-section-id="${CSS.escape(id)}"]`)
      ?.scrollIntoView({ block: "nearest", behavior: "instant" })
  }
  const changeField = (id: string, key: string, value: string) =>
    edit((next) => {
      const section = next.pages
        .find((page) => page.key === pageKey)
        ?.sections.find((entry) => entry.id === id)
      if (section) section.settings[key] = value
    })
  return (
    <section className="sf-studio sf-studio-canvas">
      <header className="sf-canvas-header">
        <div className="sf-canvas-header-left">
          <button
            type="button"
            className="sf-sidebar-toggle"
            aria-label={
              sidebarOpen ? "Collapse configuration" : "Open configuration"
            }
            aria-expanded={sidebarOpen}
            onClick={() => setSidebarOpen(!sidebarOpen)}
          >
            ☰
          </button>
          <Button
            variant="ghost"
            onClick={() => (dirty ? setExitOpen(true) : router.push("/"))}
          >
            ← Back to dashboard
          </Button>
          <span className="sf-canvas-store">
            {store?.name ?? "Storefront studio"}
          </span>
          <button
            type="button"
            className="sf-canvas-template-trigger"
            disabled={blocked}
            onClick={() => setTemplatesOpen(true)}
          >
            {manifest.name}⌄
          </button>
          <select
            aria-label="Page"
            value={pageKey}
            onChange={(event) => setPage(event.target.value)}
          >
            {manifest.pages.map((page) => (
              <option key={page.key} value={page.key}>
                {page.label}
              </option>
            ))}
          </select>
        </div>
        <fieldset className="sf-device-switch" aria-label="Preview width">
          {(["desktop", "tablet", "mobile"] as const).map((size) => (
            <button
              key={size}
              type="button"
              aria-pressed={viewport === size}
              onClick={() => setViewport(size)}
            >
              {size === "desktop"
                ? "Desktop"
                : size === "tablet"
                  ? "Tablet"
                  : "Mobile"}
            </button>
          ))}
        </fieldset>
        <div className="sf-canvas-header-right">
          <span className="sf-save-status">
            {dirty ? "● Unsaved changes" : `✓ Saved · rev ${saved.revision}`}
          </span>
          <Button
            variant="ghost"
            disabled={blocked || !undo.length}
            onClick={() => {
              const previous = undo.at(-1)
              if (previous) {
                setRedo((items) => [...items, composition])
                setComposition(previous)
                setUndo(undo.slice(0, -1))
                setConsent(false)
              }
            }}
          >
            Undo
          </Button>
          <Button
            variant="ghost"
            disabled={blocked || !redo.length}
            onClick={() => {
              const next = redo.at(-1)
              if (next) {
                setUndo((items) => [...items, composition])
                setComposition(next)
                setRedo(redo.slice(0, -1))
                setConsent(false)
              }
            }}
          >
            Redo
          </Button>
          <Button
            variant="outline"
            disabled={busy || !dirty || !!conflict}
            onClick={() =>
              void run(async () => {
                await save()
              })
            }
          >
            {busy ? "Working…" : "Save draft"}
          </Button>
          <Button onClick={() => setReview(true)}>Review & publish</Button>
        </div>
      </header>
      {!isCanvasComposition(initialComposition) &&
      !isCanvasComposition(saved.composition) ? (
        <p className="sf-studio-notice">
          Canvas update is local. Existing copy and brand are kept; Save draft
          retains the update.
        </p>
      ) : null}
      {candidatePreview ? (
        <div className="sf-studio-notice">
          Previewing a suggested design.{" "}
          <Button variant="outline" onClick={() => setCandidatePreview(null)}>
            Return to draft
          </Button>
        </div>
      ) : null}
      {error ? (
        <p className="sf-studio-notice" role="alert">
          {error}
        </p>
      ) : null}
      {status ? <output className="sf-studio-notice">{status}</output> : null}
      {readiness.error ? (
        <p className="sf-studio-notice" role="alert">
          Readiness unavailable: {readiness.error.message}{" "}
          <button type="button" onClick={() => void readiness.refetch()}>
            Try again
          </button>
        </p>
      ) : null}
      {conflict ? (
        <div className="sf-studio-notice" role="alert">
          Another editor saved revision {conflict.revision}. Your edits are kept
          locally.
          <div className="sf-studio-actions">
            <Button
              variant="outline"
              onClick={() => {
                setSaved(conflict)
                setComposition(upgradeCanvasDraft(conflict.composition))
                setConflict(null)
                setUndo([])
                setRedo([])
                setConsent(false)
              }}
            >
              Load revision {conflict.revision}
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setSaved(conflict)
                setConflict(null)
                setConsent(false)
              }}
            >
              Keep my edits
            </Button>
          </div>
        </div>
      ) : null}
      <div
        className={`sf-canvas-workspace${sidebarOpen ? "" : " sf-sidebar-collapsed"}`}
      >
        {sidebarOpen ? (
          <aside
            className="sf-canvas-config"
            aria-label="Storefront configuration"
          >
            <div className="sf-config-heading">
              <strong>Storefront config</strong>
              <small>
                Draft rev {saved.revision} ·{" "}
                {readiness.data?.publication.activeRelease
                  ? `Live rev ${readiness.data.publication.activeRelease.draftRevision}`
                  : "Not published"}
              </small>
            </div>
            <div className="sf-config-template">
              <div>
                <small>Template</small>
                <strong>{manifest.name}</strong>
                <small>Version {manifest.version}</small>
                <span>
                  {manifest.businessTypes.includes(fit) ||
                  (fit === "mixed" && manifest.businessTypes.length > 1)
                    ? "Best fit"
                    : "Available template"}
                </span>
              </div>
              <Button
                size="sm"
                variant="outline"
                disabled={blocked}
                onClick={() => setTemplatesOpen(true)}
              >
                Change
              </Button>
            </div>
            {versionUpgrade ? (
              <div className="sf-config-upgrade">
                <p>
                  <strong>
                    Version {versionUpgrade.version} is available.
                  </strong>{" "}
                  {versionUpgrade.summary} Your copy and brand stay the same.
                </p>
                <Button
                  size="sm"
                  disabled={blocked}
                  onClick={() => {
                    if (
                      edit((next) =>
                        Object.assign(next, upgradeDraftVersion(next)),
                      )
                    )
                      setStatus(
                        `Draft updated to version ${versionUpgrade.version}. Save draft to keep it; your live site changes only when you publish.`,
                      )
                  }}
                >
                  Update to version {versionUpgrade.version}
                </Button>
              </div>
            ) : null}
            <details open>
              <summary>Pages</summary>
              <nav className="sf-canvas-pages" aria-label="Editor pages">
                {manifest.pages.map((page) => (
                  <button
                    type="button"
                    key={page.key}
                    aria-current={page.key === pageKey ? "page" : undefined}
                    onClick={() => setPage(page.key)}
                  >
                    <span>{page.label}</span>
                    <small>{page.path}</small>
                    <small>
                      {
                        composition.pages.find(
                          (entry) => entry.key === page.key,
                        )?.sections.length
                      }
                    </small>
                  </button>
                ))}
              </nav>
            </details>
            <details open>
              <summary>
                Sections <small>{pageLabel}</small>
              </summary>
              <StorefrontSectionOutline
                sections={sections}
                manifest={manifest}
                selectedId={sectionId}
                disabled={blocked}
                onSelect={selectSection}
                onMove={move}
                onReorder={(id, over) =>
                  edit((next) => {
                    const list = canvasPage(next, pageKey).sections
                    const from = list.findIndex((entry) => entry.id === id)
                    const to = list.findIndex((entry) => entry.id === over)
                    if (
                      from > 0 &&
                      to > 0 &&
                      from < list.length - 1 &&
                      to < list.length - 1
                    ) {
                      const [entry] = list.splice(from, 1)
                      if (entry) list.splice(to, 0, entry)
                    }
                  })
                }
                onHide={(id) =>
                  edit((next) => {
                    const section = canvasSection(next, pageKey, id)
                    section.visible = !section.visible
                  })
                }
                onRemove={(id) =>
                  edit((next) => {
                    const page = canvasPage(next, pageKey)
                    page.sections = page.sections.filter(
                      (entry) => entry.id !== id,
                    )
                  })
                }
                onAdd={() => {
                  if (snapshot) setLibraryOpen(true)
                }}
              />
              <p className="sf-config-hint">
                Drag interior sections to reorder. Header and Footer stay fixed.
              </p>
            </details>
            <details open>
              <summary>Brand</summary>
              <div className="sf-canvas-brand">
                <span>Typeface</span>
                <div className="sf-font-options">
                  {(["system", "serif"] as const).map((font) => (
                    <button
                      type="button"
                      disabled={blocked}
                      aria-pressed={composition.theme.font === font}
                      key={font}
                      onClick={() =>
                        edit((next) => {
                          next.theme.font = font
                        })
                      }
                    >
                      <span
                        style={{
                          fontFamily:
                            font === "serif"
                              ? "Georgia,serif"
                              : composition.template.key === "service-concierge"
                                ? "Manrope,system-ui"
                                : "system-ui",
                        }}
                      >
                        Aa
                      </span>
                      {composition.template.key === "commerce-studio"
                        ? font === "serif"
                          ? "Instrument Serif"
                          : "DM Sans"
                        : font === "serif"
                          ? "Georgia"
                          : composition.template.key === "service-concierge"
                            ? "Manrope"
                            : "Geist"}
                    </button>
                  ))}
                </div>
                <label htmlFor={`${themeId}-accent`}>
                  Accent
                  <Input
                    id={`${themeId}-accent`}
                    type="color"
                    disabled={blocked}
                    value={composition.theme.accent}
                    onChange={(event) =>
                      edit((next) => {
                        next.theme.accent = event.target.value
                      })
                    }
                  />
                </label>
                <label htmlFor={`${themeId}-background`}>
                  Background
                  <Input
                    id={`${themeId}-background`}
                    type="color"
                    disabled={blocked}
                    value={composition.theme.background}
                    onChange={(event) =>
                      edit((next) => {
                        next.theme.background = event.target.value
                      })
                    }
                  />
                </label>
                <label>
                  Corners
                  <select
                    disabled={blocked}
                    value={composition.theme.radius}
                    onChange={(event) =>
                      edit((next) => {
                        next.theme.radius = event.target.value as
                          | "none"
                          | "small"
                          | "rounded"
                      })
                    }
                  >
                    <option value="none">Square</option>
                    <option value="small">Small</option>
                    <option value="rounded">Rounded</option>
                  </select>
                </label>
                {manifest.themeControls?.includes("width") ? (
                  <label>
                    Page width
                    <select
                      disabled={blocked}
                      value={composition.theme.width ?? "standard"}
                      onChange={(event) =>
                        edit((next) => {
                          next.theme.width = event.target.value as
                            | "narrow"
                            | "standard"
                            | "wide"
                        })
                      }
                    >
                      <option value="narrow">Narrow</option>
                      <option value="standard">Standard</option>
                      <option value="wide">Wide</option>
                    </select>
                  </label>
                ) : null}
                {manifest.themeControls?.includes("density") ? (
                  <label>
                    Spacing
                    <select
                      disabled={blocked}
                      value={composition.theme.density ?? "comfortable"}
                      onChange={(event) =>
                        edit((next) => {
                          next.theme.density = event.target.value as
                            | "comfortable"
                            | "compact"
                        })
                      }
                    >
                      <option value="comfortable">Comfortable</option>
                      <option value="compact">Compact</option>
                    </select>
                  </label>
                ) : null}
                <p className="sf-config-hint">
                  Applies to every page and section.
                </p>
              </div>
            </details>
            {selected &&
            definition?.fields.some(
              (field) =>
                field.kind === "asset" ||
                field.kind === "boolean" ||
                field.kind === "catalog-items" ||
                !inlineTextEditing,
            ) ? (
              <details open>
                <summary>Section options</summary>
                {definition.fields
                  .filter(
                    (field) =>
                      field.kind === "asset" ||
                      field.kind === "boolean" ||
                      field.kind === "catalog-items" ||
                      // Templates without in-preview text editing edit every field here.
                      !inlineTextEditing,
                  )
                  .map((field) => (
                    <ManifestField
                      key={`${selected.id}-${field.key}`}
                      field={field}
                      value={selected.settings[field.key]}
                      disabled={blocked}
                      // Only a complete public list can say a pin is off the website.
                      publicItems={
                        snapshot && !snapshot.resources.catalog.nextCursor
                          ? snapshot.resources.catalog.items
                          : null
                      }
                      onChange={(value) => fieldChange(field.key, value)}
                    />
                  ))}
              </details>
            ) : null}
            <div className="sf-config-editing">
              <strong>Editing text</strong>
              <p>
                {inlineTextEditing
                  ? "Click text in the preview to edit it."
                  : "Select a section in the preview, then edit its text in Section options."}{" "}
                Prices, stock and business details stay connected to Catalog.
              </p>
            </div>
            <div className="sf-config-suggestions">
              {" "}
              <StorefrontProposals
                siteId={initial.siteId}
                revision={saved.revision}
                composition={saved.composition}
                liveRevision={
                  readiness.data?.publication.activeRelease?.draftRevision ??
                  null
                }
                dirty={dirty || !!conflict}
                busy={busy}
                onPreview={setCandidatePreview}
                onConflict={(latest) =>
                  setConflict({
                    composition: validateComposition(
                      latest.draftComposition,
                      getTemplateManifest(latest.draftComposition),
                    ),
                    revision: latest.draftRevision,
                  })
                }
                onAccepted={(result) => {
                  const next = validateComposition(
                    result.draft.composition,
                    getTemplateManifest(result.draft.composition),
                  )
                  setComposition(upgradeCanvasDraft(next))
                  setSaved({
                    composition: next,
                    revision: result.draft.revision,
                  })
                  setUndo([])
                  setConflict(null)
                  setConsent(false)
                  setSectionId(next.pages[0]?.sections[0]?.id ?? "")
                  setStatus(
                    `Design accepted as draft revision ${result.acceptedRevision}. Live content is unchanged.`,
                  )
                  void readiness.refetch()
                }}
              />
            </div>
          </aside>
        ) : null}
        <main className="sf-canvas-stage" aria-label="Storefront preview">
          <StorefrontCanvasPreview
            key={`${initial.siteId}:${saved.revision}`}
            siteId={initial.siteId}
            storeId={initial.storeId}
            revision={saved.revision}
            composition={candidatePreview ?? composition}
            pageKey={pageKey}
            viewport={viewport}
            editing={
              blocked
                ? undefined
                : {
                    selectedId: sectionId,
                    onSelect: setSectionId,
                    onFieldChange: changeField,
                    onPhrases: (id, anchor) => setPhrases({ id, anchor }),
                  }
            }
            onPageChange={setPage}
            onSnapshot={setSnapshot}
          />
        </main>
      </div>
      {libraryOpen && snapshot ? (
        <StorefrontSectionDialog
          composition={composition}
          snapshot={snapshot}
          pageLabel={pageLabel}
          onClose={() => setLibraryOpen(false)}
          onInsert={(entry) => {
            const id = crypto.randomUUID()
            if (
              edit((next) =>
                Object.assign(
                  next,
                  insertSectionExcerpt(next, pageKey, entry, id),
                ),
              )
            ) {
              setSectionId(id)
              setLibraryOpen(false)
              setStatus(`Added ${entry.title} to ${pageLabel}.`)
            }
          }}
        />
      ) : null}
      {templatesOpen ? (
        <StorefrontTemplateDialog
          composition={composition}
          snapshot={snapshot}
          initialFit={fit}
          onClose={() => setTemplatesOpen(false)}
          onReplace={(pin) => {
            edit((next) => Object.assign(next, replaceDraftTemplate(next, pin)))
            setPage("home")
            setTemplatesOpen(false)
          }}
        />
      ) : null}
      {phrases && phraseSection ? (
        <StorefrontPhrasesPopover
          key={phraseSection.id}
          section={phraseSection}
          anchor={phrases.anchor}
          onClose={() => setPhrases(null)}
          onUpdate={(settings) =>
            edit((next) => {
              const section = canvasSection(next, pageKey, phraseSection.id)
              Object.assign(section.settings, settings)
            })
          }
        />
      ) : null}
      <Dialog open={exitOpen} onOpenChange={setExitOpen}>
        <DialogContent>
          <DialogTitle>Leave the studio with unsaved changes?</DialogTitle>
          <DialogDescription>
            Your draft has local changes. Nothing is published either way.
          </DialogDescription>
          <div className="sf-exit-actions">
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => setExitOpen(false)}
            >
              Keep editing
            </Button>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => router.push("/")}
            >
              Leave without saving
            </Button>
            <Button
              disabled={busy || !!conflict}
              onClick={() =>
                void run(async () => {
                  if (await save()) router.push("/")
                })
              }
            >
              Save draft and leave
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <Sheet
        open={review}
        onOpenChange={(open) => {
          setReview(open)
          if (!open) setConsent(false)
        }}
      >
        <SheetContent title="Review storefront publication">
          <SheetTitle>Review & publish</SheetTitle>
          <div className="sf-studio-review">
            {error ? <p role="alert">{error}</p> : null}
            {status ? <output>{status}</output> : null}
            <p>
              Candidate: draft revision {saved.revision} · {manifest.name}{" "}
              {manifest.version}
            </p>
            <p>
              {dirty
                ? "Save your changes before publishing."
                : "All local changes are saved."}
            </p>
            {conflict ? <p>Resolve the save conflict first.</p> : null}
            {readiness.error ? (
              <p role="alert">
                Readiness unavailable: {readiness.error.message}
              </p>
            ) : null}
            {readiness.data?.blockers.map((blocker) => (
              <p key={blocker} role="alert">
                {blocker}
              </p>
            ))}
            <label>
              <input
                type="checkbox"
                checked={consent}
                disabled={busy || dirty || !!conflict}
                onChange={(event) => setConsent(event.target.checked)}
              />{" "}
              I approve public browsing of this saved design, or restoring the
              release I choose below.
            </label>
            <Button
              disabled={
                busy ||
                dirty ||
                !!conflict ||
                !consent ||
                !readiness.data?.canPublish ||
                readiness.data.draftRevision !== saved.revision
              }
              onClick={() => void run(publish)}
            >
              Publish revision {saved.revision}
            </Button>
            <p>
              Release activation and public delivery are separate. Delivery:
              unverified.
            </p>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await Promise.all([readiness.refetch(), history.refetch()])
                })
              }
            >
              Refresh status
            </Button>
            <h2>Release history</h2>
            {history.error ? <p role="alert">{history.error.message}</p> : null}
            {!history.data?.releases.length ? (
              <p>No releases yet.</p>
            ) : (
              <ul>
                {history.data.releases.map((release) => (
                  <li key={release.id}>
                    <span>
                      Revision {release.draftRevision} ·{" "}
                      {new Date(release.createdAt).toLocaleString()}{" "}
                      {release.active ? "· Active" : ""}
                    </span>
                    {!release.active ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy || dirty || !!conflict || !consent}
                        onClick={() => void run(() => rollback(release.id))}
                      >
                        Restore
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </section>
  )
}

function ManifestField({
  field,
  value,
  onChange,
  disabled,
  publicItems,
}: {
  field: EditableField
  value: unknown
  onChange: (value: SettingValue) => void
  disabled: boolean
  publicItems: readonly { id: string; name: string }[] | null
}) {
  const fieldId = useId()
  if (field.kind === "catalog-items")
    return (
      <StorefrontCatalogItemsField
        field={field}
        value={value}
        disabled={disabled}
        publicItems={publicItems}
        onChange={onChange}
      />
    )
  if (field.kind === "boolean")
    return (
      <label>
        <input
          type="checkbox"
          checked={value === true}
          disabled={disabled}
          onChange={(event) => onChange(event.target.checked)}
        />{" "}
        {field.label}
      </label>
    )
  if (field.kind === "select")
    return (
      <label>
        {field.label}
        <select
          disabled={disabled}
          value={typeof value === "string" ? value : field.default}
          onChange={(event) => onChange(event.target.value)}
        >
          {field.options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
    )
  if (field.kind === "asset")
    return (
      <label>
        {field.label}
        <select
          disabled={disabled}
          value={typeof value === "string" ? value : ""}
          onChange={(event) => onChange(event.target.value || null)}
        >
          <option value="">None</option>
          {storefrontDesignAssets.map((asset) => (
            <option key={asset.id} value={asset.id}>
              {asset.alt}
            </option>
          ))}
        </select>
        <span>
          Decorative illustration. Catalog photos stay in your catalog.
        </span>
      </label>
    )
  if (field.maxLength > 160)
    return (
      <label htmlFor={fieldId}>
        {field.label}
        <Textarea
          id={fieldId}
          rows={field.maxLength > 600 ? 6 : 3}
          disabled={disabled}
          maxLength={field.maxLength}
          value={typeof value === "string" ? value : ""}
          onChange={(event) => onChange(event.target.value)}
        />
      </label>
    )
  return (
    <label htmlFor={fieldId}>
      {field.label}
      <Input
        id={fieldId}
        disabled={disabled}
        maxLength={field.maxLength}
        value={typeof value === "string" ? value : ""}
        placeholder={
          field.key === "headline"
            ? "Use the Store name"
            : field.key === "tagline"
              ? "Use the Store description"
              : field.label
        }
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  )
}
