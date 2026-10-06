"use client"

import { updateDirectoryViewAction } from "@/actions/update-directory-view-action"
import { useMobileOverlay } from "@/hooks/use-mobile-overlay"
import {
  type DirectoryPageId,
  type DirectoryView,
  type DirectoryViewSettings,
  directoryViews,
  resolveDirectoryView,
} from "@/utils/directory-view-settings"
import { parseAsStringEnum, useQueryState } from "nuqs"
import { useRef, useState } from "react"

export function useDirectoryView({
  pageId,
  queryKey,
  initialSettings,
  options = directoryViews,
}: {
  pageId: DirectoryPageId
  queryKey: string
  initialSettings: DirectoryViewSettings
  options?: readonly [DirectoryView, ...DirectoryView[]]
}) {
  const [urlView, setUrlView] = useQueryState(
    queryKey,
    parseAsStringEnum<DirectoryView>([...directoryViews]),
  )
  const smallScreen = useMobileOverlay()
  const view = resolveDirectoryView({
    urlView,
    savedView: initialSettings.view,
    smallScreen,
    options,
  })
  const [persistenceError, setPersistenceError] = useState<string | null>(null)
  const queue = useRef(Promise.resolve())
  const latest = useRef(0)

  function persist(next: DirectoryView) {
    const intent = ++latest.current
    setPersistenceError(null)
    // Serialize writes so an older request cannot overwrite the latest choice.
    queue.current = queue.current.then(async () => {
      if (intent !== latest.current) return
      try {
        const result = await updateDirectoryViewAction({
          pageId,
          scope: initialSettings.scope,
          view: next,
        })
        if (intent === latest.current) setPersistenceError(result.error)
      } catch {
        if (intent === latest.current)
          setPersistenceError("Your view could not be saved. Try again.")
      }
    })
  }

  return {
    view,
    setView: (next: DirectoryView) => {
      if (!options.includes(next)) return
      void setUrlView(next, { history: "push", shallow: true })
      persist(next)
    },
    persistenceError,
    retryPersistence: () => persist(view),
  }
}
