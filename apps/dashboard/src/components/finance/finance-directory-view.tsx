"use client"

import { ViewDropdown, type ViewOption } from "@/components/view-switcher"
import { useDirectoryView } from "@/hooks/use-directory-view"
import type {
  DirectoryPageId,
  DirectoryView,
  DirectoryViewSettings,
} from "@/utils/directory-view-settings"
import { Alert, AlertDescription, Button } from "@ewatrade/ui"
import {
  GridViewIcon,
  LayoutTable01Icon,
  ListViewIcon,
} from "@hugeicons/core-free-icons"
import type { ReactNode } from "react"

// The saved value stays "cards" so existing view cookies keep working.
export const financeViewOptions = [
  { value: "table", label: "Table", icon: LayoutTable01Icon },
  { value: "list", label: "List", icon: ListViewIcon },
  { value: "cards", label: "Grid", icon: GridViewIcon },
] as const satisfies readonly ViewOption<DirectoryView>[]

/** Bank statements read best as rows, so they offer no grid. */
export const financeRowViewOptions = financeViewOptions.filter(
  (option) => option.value !== "cards",
)

/**
 * Owns one finance directory's Table/List/Grid choice and its View dropdown.
 * A saved view the options don't offer falls back to the first option.
 */
export function FinanceDirectoryView({
  pageId,
  queryKey,
  label,
  initialSettings,
  options = financeViewOptions,
  children,
}: {
  pageId: DirectoryPageId
  queryKey: string
  label: string
  initialSettings: DirectoryViewSettings
  options?: readonly ViewOption<DirectoryView>[]
  children: (view: DirectoryView, viewControl: ReactNode) => ReactNode
}) {
  const { view, setView, persistenceError, retryPersistence } =
    useDirectoryView({ pageId, queryKey, initialSettings })
  const shown = options.some((option) => option.value === view)
    ? view
    : (options[0]?.value ?? view)
  const viewControl = (
    <ViewDropdown
      label={label}
      value={shown}
      options={options}
      onValueChange={setView}
    />
  )
  return (
    <>
      {persistenceError ? (
        <Alert appearance="dashboard" role="alert">
          <AlertDescription>{persistenceError}</AlertDescription>
          <Button variant="outline" size="sm" onClick={retryPersistence}>
            Retry saving view
          </Button>
        </Alert>
      ) : null}
      {children(shown, viewControl)}
    </>
  )
}
