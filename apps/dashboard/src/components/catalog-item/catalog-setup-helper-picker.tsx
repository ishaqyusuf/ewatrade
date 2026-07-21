"use client"

import { Button } from "@ewatrade/ui"
import {
  type CatalogSetupHelper,
  type CatalogSetupHelperKind,
  listCatalogSetupHelpers,
} from "@ewatrade/utils/catalog-setup-helpers"
import {
  findBusinessProfile,
  getRecommendedCatalogSetupHelperKeys,
  rankCatalogSetupHelpersForBusinessProfile,
} from "@ewatrade/utils/business-profiles"
import { Cancel01Icon, Search01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useEffect, useMemo, useRef, useState } from "react"

type CatalogSetupHelperPickerProps = {
  businessProfileKey?: string | null
  kind: CatalogSetupHelperKind
  onClose: () => void
  onSelect: (helper: CatalogSetupHelper | null) => void
  open: boolean
  selectedKey: string | null
}

function HelperRow({
  helper,
  onSelect,
  personalized,
  selected,
}: {
  helper: CatalogSetupHelper
  onSelect: () => void
  personalized: boolean
  selected: boolean
}) {
  return (
    <button
      type="button"
      className="flex w-full flex-col gap-2 border-b border-border px-5 py-5 text-left transition hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
      onClick={onSelect}
    >
      <span className="flex items-center justify-between gap-3">
        <span className="font-medium text-foreground">{helper.title}</span>
        {selected ? (
          <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
            Selected
          </span>
        ) : personalized ? (
          <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
            For your business
          </span>
        ) : helper.recommended ? (
          <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
            Recommended
          </span>
        ) : null}
      </span>
      <span className="text-sm leading-6 text-muted-foreground">
        {helper.description}
      </span>
      <span className="flex flex-wrap gap-1.5">
        {helper.tags.map((tag) => (
          <span
            className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground"
            key={tag}
          >
            {tag}
          </span>
        ))}
      </span>
    </button>
  )
}

export function CatalogSetupHelperPicker({
  businessProfileKey,
  kind,
  onClose,
  onSelect,
  open,
  selectedKey,
}: CatalogSetupHelperPickerProps) {
  const [query, setQuery] = useState("")
  const dialogRef = useRef<HTMLDialogElement>(null)
  const businessProfile = findBusinessProfile(businessProfileKey)
  const recommendedHelperKeys = useMemo(
    () =>
      getRecommendedCatalogSetupHelperKeys({
        kind,
        profileKey: businessProfileKey,
      }),
    [businessProfileKey, kind],
  )
  const recommendedHelperKeySet = useMemo(
    () => new Set(recommendedHelperKeys),
    [recommendedHelperKeys],
  )
  const helpers = useMemo(
    () =>
      rankCatalogSetupHelpersForBusinessProfile(
        listCatalogSetupHelpers({ kind, query }),
        businessProfileKey,
      ),
    [businessProfileKey, kind, query],
  )
  const personalizedHelpers = helpers.filter((helper) =>
    recommendedHelperKeySet.has(helper.key),
  )
  const remainingHelpers = helpers.filter(
    (helper) => !recommendedHelperKeySet.has(helper.key),
  )
  const patterns = remainingHelpers.filter(
    (helper) => helper.classification === "pattern",
  )
  const examples = remainingHelpers.filter(
    (helper) => helper.classification === "example",
  )

  useEffect(() => {
    if (!open) setQuery("")
  }, [open])

  useEffect(() => {
    const dialog = dialogRef.current
    if (!open || !dialog) return
    dialog.showModal()
    return () => {
      if (dialog.open) dialog.close()
    }
  }, [open])

  if (!open) return null

  return (
    <dialog
      aria-label="Catalog quick setup templates"
      aria-modal="true"
      className="fixed inset-0 z-[70] m-0 flex h-screen max-h-none w-screen max-w-none flex-col border-0 bg-background p-0 text-foreground"
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      ref={dialogRef}
    >
      <header className="flex min-h-[72px] items-center justify-between gap-4 border-b border-border px-5 py-4">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">
            Choose a quick setup
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {businessProfile
              ? `${businessProfile.title} suggestions appear first. Review and edit before saving.`
              : "Pick a starting point, then review and edit it before saving."}
          </p>
        </div>
        <Button
          type="button"
          aria-label="Close quick setup"
          onClick={onClose}
          size="icon-sm"
          variant="ghost"
        >
          <HugeiconsIcon className="size-4" icon={Cancel01Icon} />
        </Button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <button
          type="button"
          className="flex w-full flex-col gap-1 border-b border-border px-5 py-5 text-left transition hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
          onClick={() => onSelect(null)}
        >
          <span className="flex items-center justify-between gap-3">
            <span className="font-medium text-foreground">Start blank</span>
            {selectedKey === null ? (
              <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                Selected
              </span>
            ) : null}
          </span>
          <span className="text-sm text-muted-foreground">
            Enter the item, units, options, and work settings yourself.
          </span>
        </button>

        {personalizedHelpers.length > 0 ? (
          <div>
            <p className="border-b border-border px-5 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              For your business
            </p>
            {personalizedHelpers.map((helper) => (
              <HelperRow
                helper={helper}
                key={helper.key}
                onSelect={() => onSelect(helper)}
                personalized
                selected={selectedKey === helper.key}
              />
            ))}
          </div>
        ) : null}

        {patterns.length > 0 ? (
          <div>
            <p className="border-b border-border px-5 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Setups
            </p>
            {patterns.map((helper) => (
              <HelperRow
                helper={helper}
                key={helper.key}
                onSelect={() => onSelect(helper)}
                personalized={recommendedHelperKeySet.has(helper.key)}
                selected={selectedKey === helper.key}
              />
            ))}
          </div>
        ) : null}

        {examples.length > 0 ? (
          <div>
            <p className="border-b border-border px-5 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Examples
            </p>
            {examples.map((helper) => (
              <HelperRow
                helper={helper}
                key={helper.key}
                onSelect={() => onSelect(helper)}
                personalized={recommendedHelperKeySet.has(helper.key)}
                selected={selectedKey === helper.key}
              />
            ))}
          </div>
        ) : null}

        {helpers.length === 0 ? (
          <p className="px-5 py-12 text-center text-sm text-muted-foreground">
            No quick setups match “{query.trim()}”.
          </p>
        ) : null}
      </div>

      <div className="border-t border-border bg-background px-5 py-4">
        <label className="flex h-12 items-center gap-3 rounded-lg border border-border bg-background px-4 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20">
          <HugeiconsIcon
            className="size-4 text-muted-foreground"
            icon={Search01Icon}
          />
          <span className="sr-only">Search quick setups</span>
          <input
            autoComplete="off"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.preventDefault()
            }}
            placeholder="Search templates, units, or business examples"
            value={query}
          />
        </label>
      </div>
    </dialog>
  )
}
