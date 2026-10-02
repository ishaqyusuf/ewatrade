"use client"

import { Package01Icon, ToolsIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import type { SimpleCatalogItemKind } from "./form-context"

export const catalogItemKinds = [
  {
    kind: "product",
    title: "Product",
    description: "Something you count or keep in stock.",
    icon: Package01Icon,
  },
  {
    kind: "service",
    title: "Service",
    description: "Work you price without stock.",
    icon: ToolsIcon,
  },
] as const

export function CatalogItemKindLabel({
  kind,
}: { kind: SimpleCatalogItemKind }) {
  const choice =
    catalogItemKinds.find((item) => item.kind === kind) ?? catalogItemKinds[0]
  return (
    <>
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted">
        <HugeiconsIcon icon={choice.icon} className="size-5" />
      </span>
      <span className="grid gap-1 text-left">
        <span className="font-medium">{choice.title}</span>
        <span className="text-sm font-normal text-muted-foreground">
          {choice.description}
        </span>
      </span>
    </>
  )
}

export function CatalogItemKindChoices({
  onSelect,
}: { onSelect: (kind: SimpleCatalogItemKind) => void }) {
  return (
    <div className="grid gap-2">
      {catalogItemKinds.map(({ kind }) => (
        <button
          key={kind}
          type="button"
          className="flex items-center gap-3 border border-border p-4 text-left hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => onSelect(kind)}
        >
          <CatalogItemKindLabel kind={kind} />
        </button>
      ))}
    </div>
  )
}
