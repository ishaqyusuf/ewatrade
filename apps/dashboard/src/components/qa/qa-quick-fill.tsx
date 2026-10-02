"use client"

import { ConfirmDraftModal } from "@/components/modals/confirm-draft-modal"
import { useTRPC } from "@/trpc/client"
import { Badge, Button } from "@ewatrade/ui"
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
  useState,
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
  const [confirmOpen, setConfirmOpen] = useState(false)
  if (!qa) return null

  function fill() {
    if (!qa) return
    sequence.current += 1
    onFill(qa.createContext(formId, sequence.current), sequence.current)
  }

  return (
    <div className="flex items-center justify-end gap-2">
      <ConfirmDraftModal
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Replace current draft?"
        description="Replace your current draft with QA fixture values?"
        onConfirm={fill}
      />
      {canUndo && onUndo ? (
        <Button
          variant="ghost"
          size="sm"
          className="rounded-none"
          onClick={onUndo}
          type="button"
        >
          Undo
        </Button>
      ) : null}
      <Button
        aria-label={`${label} using ${qa.qaDomain}`}
        className="rounded-none"
        size="sm"
        onClick={() => (isDirty ? setConfirmOpen(true) : fill())}
        type="button"
      >
        {label}
        <Badge variant="secondary">QA</Badge>
      </Button>
    </div>
  )
}
