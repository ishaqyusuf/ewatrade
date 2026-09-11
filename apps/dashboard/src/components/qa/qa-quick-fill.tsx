"use client"

import { useTRPC } from "@/trpc/client"
import {
  type QaFixtureContext,
  createQaFixtureContext,
} from "@ewatrade/utils/qa-fixtures"
import { useQuery } from "@tanstack/react-query"
import {
  type ReactNode,
  createContext,
  useContext,
  useMemo,
  useRef,
} from "react"

type QaDashboardContextValue = {
  createContext(formId: string, sequence: number): QaFixtureContext
  qaDomain: string
}

const QaDashboardContext = createContext<QaDashboardContextValue | null>(null)

export function QaDashboardProvider({ children }: { children: ReactNode }) {
  const trpc = useTRPC()
  const fixture = useQuery(
    trpc.qaAccess.fixtureContext.queryOptions(undefined, {
      retry: false,
      staleTime: 5 * 60_000,
    }),
  )
  const value = useMemo<QaDashboardContextValue | null>(() => {
    if (!fixture.data?.storeId) return null
    return {
      createContext(formId, sequence) {
        return createQaFixtureContext({
          currencyCode: fixture.data.currencyCode,
          domain: fixture.data.qaDomain,
          invocationId: crypto.randomUUID(),
          seed: `${fixture.data.seed}:${formId}:${sequence}`,
          storeId: fixture.data.storeId ?? "unselected",
          tenantId: fixture.data.tenantId,
          timezone: fixture.data.timezone,
        })
      },
      qaDomain: fixture.data.qaDomain,
    }
  }, [fixture.data])

  return (
    <QaDashboardContext.Provider value={value}>
      {children}
    </QaDashboardContext.Provider>
  )
}

export function QaDashboardQuickFill({
  canUndo,
  formId,
  isDirty,
  label = "Quick Fill",
  onFill,
  onUndo,
}: {
  canUndo?: boolean
  formId: string
  isDirty?: boolean
  label?: string
  onFill: (context: QaFixtureContext, sequence: number) => void
  onUndo?: () => void
}) {
  const qa = useContext(QaDashboardContext)
  const sequence = useRef(0)
  if (!qa) return null

  function fill() {
    if (!qa) return
    if (
      isDirty &&
      !window.confirm("Replace your current draft with QA fixture values?")
    ) {
      return
    }
    sequence.current += 1
    onFill(qa.createContext(formId, sequence.current), sequence.current)
  }

  return (
    <div className="flex items-center justify-end gap-2">
      {canUndo && onUndo ? (
        <button
          className="min-h-10 rounded-xl px-3 text-xs font-bold text-muted-foreground hover:bg-muted"
          onClick={onUndo}
          type="button"
        >
          Undo
        </button>
      ) : null}
      <button
        aria-label={`${label} using ${qa.qaDomain}`}
        className="min-h-10 rounded-xl bg-primary px-4 text-xs font-bold text-primary-foreground hover:brightness-95"
        onClick={fill}
        type="button"
      >
        {label}
        <span className="ml-2 rounded bg-primary-foreground/15 px-1.5 py-0.5 text-[9px] font-black uppercase">
          QA
        </span>
      </button>
    </div>
  )
}
