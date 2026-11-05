import { useOptionalAdminTabs } from "@/components/mobile/admin-tabs/admin-tabs-context"
import * as Haptics from "expo-haptics"
import { useFocusEffect } from "expo-router"
import { useCallback, useEffect, useRef, useState } from "react"
import { BackHandler, Platform } from "react-native"
import {
  pruneSelection,
  selectAllIds,
  selectionCapNotice,
  toggleSelectionId,
} from "./list-selection-model"

/** Hold this long on a row to start selecting. */
export const SELECTION_LONG_PRESS_MS = 450

type Options = {
  max: number
  /** Plural noun for the cap notice, e.g. "orders". */
  noun: string
}

/**
 * Press-and-hold multi-select for a list screen. Holding a row starts
 * selection with that row ticked (with a haptic), taps then toggle rows,
 * Android Back leaves selection, and the admin tab dock hides while the
 * bulk action bar owns the bottom edge.
 */
export function useListSelection({ max, noun }: Options) {
  const [selecting, setSelecting] = useState(false)
  const [ids, setIds] = useState<string[]>([])
  const [notice, setNotice] = useState<string | null>(null)
  const tabs = useOptionalAdminTabs()
  const setDockHidden = tabs?.setDockHidden

  const clear = useCallback(() => {
    setSelecting(false)
    setIds([])
    setNotice(null)
  }, [])

  const start = useCallback((id?: string) => {
    setSelecting(true)
    setNotice(null)
    setIds(id ? [id] : [])
    if (id) void selectionStartHaptic()
  }, [])

  const toggle = useCallback(
    (id: string) => {
      const next = toggleSelectionId(ids, id, max)
      setNotice(next.capped ? selectionCapNotice(max, noun) : null)
      if (next.ids.length === 0) clear()
      else setIds(next.ids)
    },
    [clear, ids, max, noun],
  )

  const selectAll = useCallback(
    (selectable: readonly string[]) => {
      const next = selectAllIds(ids, selectable, max)
      setNotice(next.capped ? selectionCapNotice(max, noun) : null)
      setIds(next.ids)
    },
    [ids, max, noun],
  )

  const prune = useCallback((selectable: ReadonlySet<string>) => {
    setIds((current) => pruneSelection(current, selectable))
  }, [])

  // Android Back leaves selection first, only while this screen is focused.
  useFocusEffect(
    useCallback(() => {
      if (!selecting) return
      const subscription = BackHandler.addEventListener(
        "hardwareBackPress",
        () => {
          clear()
          return true
        },
      )
      return () => subscription.remove()
    }, [clear, selecting]),
  )

  const dockWasHidden = useRef(false)
  useEffect(() => {
    if (!setDockHidden) return
    if (selecting) {
      dockWasHidden.current = true
      setDockHidden(true)
    } else if (dockWasHidden.current) {
      dockWasHidden.current = false
      setDockHidden(false)
    }
  }, [selecting, setDockHidden])

  return {
    clear,
    count: ids.length,
    ids,
    isSelected: (id: string) => ids.includes(id),
    max,
    notice,
    prune,
    selectAll,
    selecting,
    start,
    toggle,
  }
}

export type ListSelection = ReturnType<typeof useListSelection>

async function selectionStartHaptic() {
  try {
    if (Platform.OS === "android")
      await Haptics.performAndroidHapticsAsync(
        Haptics.AndroidHaptics.Long_Press,
      )
    else await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
  } catch {
    // Haptic support is optional; selection still starts without it.
  }
}
