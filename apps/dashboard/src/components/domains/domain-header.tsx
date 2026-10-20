"use client"

import { SettingsHeader } from "@/components/settings/settings-page"
import { ViewDropdown, type ViewOption } from "@/components/view-switcher"
import type { DirectoryView } from "@/utils/directory-view-settings"
import {
  Add01Icon,
  GridViewIcon,
  LayoutTable01Icon,
  Link01Icon,
  ListViewIcon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { OpenDomainSheet } from "./open-domain-sheet"

const domainViewOptions = [
  { value: "table", label: "Table", icon: LayoutTable01Icon },
  { value: "list", label: "List", icon: ListViewIcon },
  { value: "cards", label: "Grid", icon: GridViewIcon },
] as const satisfies readonly ViewOption<DirectoryView>[]

export function DomainHeader({
  view,
  onViewChange,
}: {
  view: DirectoryView
  onViewChange: (view: DirectoryView) => void
}) {
  return (
    <SettingsHeader
      title="Domains"
      description="Your online store's web address. Buy a new one, or connect one you already own."
      actions={
        <>
          <ViewDropdown
            label="Domain view"
            value={view}
            options={domainViewOptions}
            onValueChange={onViewChange}
          />
          <OpenDomainSheet mode="connect" variant="outline">
            <HugeiconsIcon icon={Link01Icon} data-icon="inline-start" />
            Connect a domain
          </OpenDomainSheet>
          <OpenDomainSheet mode="buy">
            <HugeiconsIcon icon={Add01Icon} data-icon="inline-start" />
            Buy a domain
          </OpenDomainSheet>
        </>
      }
    />
  )
}
