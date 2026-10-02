"use client"

import { updateTableSettingsAction } from "@/actions/update-table-settings-action"
import {
  type TableId,
  type TableSettings,
  normalizeTableSettings,
} from "@/utils/table-settings"
import type {
  ColumnOrderState,
  ColumnSizingState,
  VisibilityState,
} from "@tanstack/react-table"
import { useCallback, useEffect, useRef, useState } from "react"

export function useTableSettings({
  tableId,
  initialSettings,
  columnIds,
  fixedColumnIds = [],
}: {
  tableId: TableId
  initialSettings?: Partial<TableSettings>
  columnIds: string[]
  fixedColumnIds?: string[]
}) {
  const [settings, setSettings] = useState(() =>
    normalizeTableSettings(initialSettings, columnIds, fixedColumnIds),
  )
  const [persistenceError, setPersistenceError] = useState<string | null>(null)
  const mounted = useRef(false)
  const [retry, setRetry] = useState(0)
  const idsKey = JSON.stringify(columnIds)
  const fixedKey = JSON.stringify(fixedColumnIds)
  const scope = initialSettings?.scope
  const owner = `${scope ?? ""}:${tableId}`
  const previousOwner = useRef(owner)

  useEffect(() => {
    if (previousOwner.current !== owner) {
      previousOwner.current = owner
      mounted.current = false
      setSettings(
        normalizeTableSettings(
          initialSettings,
          JSON.parse(idsKey),
          JSON.parse(fixedKey),
        ),
      )
      setPersistenceError(null)
    }
  }, [owner, initialSettings, idsKey, fixedKey])

  useEffect(() => {
    if (!mounted.current && retry === 0) {
      mounted.current = true
      return
    }
    if (!scope) return
    let active = true
    const timer = setTimeout(async () => {
      const value = normalizeTableSettings(
        settings,
        JSON.parse(idsKey),
        JSON.parse(fixedKey),
      )
      try {
        const result = await updateTableSettingsAction({
          tableId,
          scope,
          settings: {
            columns: value.columns,
            sizing: value.sizing,
            order: value.order,
          },
        })
        if (active) setPersistenceError(result.error)
      } catch {
        if (active)
          setPersistenceError(
            "Your table layout could not be saved. Try again.",
          )
      }
    }, 300)
    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [settings, scope, tableId, idsKey, fixedKey, retry])

  const update = useCallback(
    <K extends "columns" | "sizing" | "order">(
      key: K,
      next: React.SetStateAction<TableSettings[K]>,
    ) => {
      setSettings((current) =>
        normalizeTableSettings(
          {
            ...current,
            [key]: typeof next === "function" ? next(current[key]) : next,
          },
          JSON.parse(idsKey),
          JSON.parse(fixedKey),
        ),
      )
    },
    [idsKey, fixedKey],
  )

  return {
    columnVisibility: settings.columns,
    columnSizing: settings.sizing,
    columnOrder: settings.order,
    setColumnVisibility: useCallback(
      (next: React.SetStateAction<VisibilityState>) => update("columns", next),
      [update],
    ),
    setColumnSizing: useCallback(
      (next: React.SetStateAction<ColumnSizingState>) => update("sizing", next),
      [update],
    ),
    setColumnOrder: useCallback(
      (next: React.SetStateAction<ColumnOrderState>) => update("order", next),
      [update],
    ),
    persistenceError,
    retryPersistence: () => setRetry((value) => value + 1),
  }
}
