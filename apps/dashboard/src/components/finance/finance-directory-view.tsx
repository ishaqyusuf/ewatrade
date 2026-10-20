"use client"

import { ViewSwitcher, directoryViewOptions } from "@/components/view-switcher"
import { useDirectoryView } from "@/hooks/use-directory-view"
import type {
  DirectoryPageId,
  DirectoryView,
  DirectoryViewSettings,
} from "@/utils/directory-view-settings"
import { Alert, AlertDescription, Button } from "@ewatrade/ui"
import type { ReactNode } from "react"

/**
 * Owns one finance directory's Table/List/Cards choice. Finance routes share a
 * workspace and Overview shows two directories, so each section keeps its own.
 */
export function FinanceDirectoryView({
  pageId,
  queryKey,
  label,
  initialSettings,
  children,
}: {
  pageId: DirectoryPageId
  queryKey: string
  label: string
  initialSettings: DirectoryViewSettings
  children: (view: DirectoryView, switcher: ReactNode) => ReactNode
}) {
  const { view, setView, persistenceError, retryPersistence } =
    useDirectoryView({ pageId, queryKey, initialSettings })
  const switcher = (
    <ViewSwitcher
      label={label}
      value={view}
      options={directoryViewOptions}
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
      {children(view, switcher)}
    </>
  )
}
