"use client"

import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@ewatrade/ui"
import {
  findBusinessProfile,
  getRecommendedCatalogSetupHelperKeys,
  rankCatalogSetupHelpersForBusinessProfile,
} from "@ewatrade/utils/business-profiles"
import {
  type CatalogSetupHelper,
  type CatalogSetupHelperKind,
  listCatalogSetupHelpers,
} from "@ewatrade/utils/catalog-setup-helpers"
import { Cancel01Icon, Search01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useEffect, useMemo, useState } from "react"

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
          <Badge variant="secondary">Selected</Badge>
        ) : personalized ? (
          <Badge variant="secondary">For your business</Badge>
        ) : helper.recommended ? (
          <Badge variant="secondary">Recommended</Badge>
        ) : null}
      </span>
      <span className="text-sm leading-6 text-muted-foreground">
        {helper.description}
      </span>
      <span className="flex flex-wrap gap-1.5">
        {helper.tags.map((tag) => (
          <Badge variant="secondary" key={tag}>
            {tag}
          </Badge>
        ))}
      </span>
    </button>
  )
}

import { useCatalogThemeClass } from "./catalog-appearance"

export function CatalogSetupHelperPicker(props: CatalogSetupHelperPickerProps) {
  const themeClass = useCatalogThemeClass()
  return (
    <Dialog
      open={props.open}
      onOpenChange={(open) => {
        if (!open) props.onClose()
      }}
    >
      <DialogContent
        hideClose
        className={`${themeClass} flex h-[min(760px,85svh)] flex-col overflow-hidden`}
      >
        {props.open ? <CatalogSetupHelperPickerContent {...props} /> : null}
      </DialogContent>
    </Dialog>
  )
}

export function CatalogSetupHelperPickerContent({
  businessProfileKey,
  kind,
  onClose,
  onSelect,
  open,
  selectedKey,
}: CatalogSetupHelperPickerProps) {
  const [query, setQuery] = useState("")
  const [showAllExamples, setShowAllExamples] = useState(false)
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
  const includeOtherExamples =
    !businessProfile || showAllExamples || Boolean(query.trim())
  const examples = includeOtherExamples
    ? remainingHelpers.filter((helper) => helper.classification === "example")
    : []

  useEffect(() => {
    if (!open) {
      setQuery("")
      setShowAllExamples(false)
    }
  }, [open])

  if (!open) return null

  return (
    <>
      <header className="flex min-h-[72px] items-center justify-between gap-4 border-b border-border px-5 py-4">
        <div>
          <DialogTitle className="text-lg font-semibold tracking-tight">
            Choose a {kind === "product" ? "product" : "service"} quick setup
          </DialogTitle>
          <DialogDescription className="mt-1 text-sm text-muted-foreground">
            {businessProfile && recommendedHelperKeys.length > 0
              ? `${businessProfile.title} suggestions appear first. Review and edit before saving.`
              : "Pick a starting point, then review and edit it before saving."}
          </DialogDescription>
        </div>
        <Button
          appearance="form"
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
              <Badge variant="secondary">Selected</Badge>
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

        {businessProfile && !query.trim() ? (
          <div className="px-5 py-4">
            <Button
              appearance="form"
              type="button"
              variant="outline"
              aria-pressed={showAllExamples}
              onClick={() => setShowAllExamples((current) => !current)}
            >
              {showAllExamples
                ? "Show business examples"
                : "Browse all examples"}
            </Button>
          </div>
        ) : null}

        {helpers.length === 0 ? (
          <p className="px-5 py-12 text-center text-sm text-muted-foreground">
            No quick setups match “{query.trim()}”.
          </p>
        ) : null}
      </div>

      <div className="border-t border-border bg-background px-5 py-4">
        <InputGroup appearance="form">
          <InputGroupInput
            aria-label="Search quick setups"
            autoComplete="off"
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.preventDefault()
            }}
            placeholder="Search templates, units, or business examples"
            value={query}
          />
          <InputGroupAddon>
            <HugeiconsIcon icon={Search01Icon} />
          </InputGroupAddon>
        </InputGroup>
      </div>
    </>
  )
}
