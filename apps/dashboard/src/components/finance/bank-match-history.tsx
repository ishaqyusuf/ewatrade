"use client"

import {
  InlineRowCheckbox,
  InlineSelectionBar,
  useInlineSelection,
} from "@/components/tables/core"
import { useTRPC } from "@/trpc/client"
import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
} from "@ewatrade/ui"
import { formatFinanceMoney } from "@ewatrade/utils/finance-money"
import { useInfiniteQuery } from "@tanstack/react-query"
import { useMemo } from "react"
import { bankMatchEvidence } from "./bank-match-state"
import type { FinanceBook } from "./types"

export type BankMatchEvent =
  RouterOutputs["finance"]["bankStatements"]["history"]["items"][number]

export function FinanceBankMatchHistory({
  book,
  accountId,
  snapshotRevision,
  activeMatchIds,
  onRelease,
  disabled,
}: {
  book: FinanceBook
  accountId: string
  snapshotRevision: string
  activeMatchIds: string[]
  onRelease: (event: BankMatchEvent) => void
  disabled: boolean
}) {
  const trpc = useTRPC()
  const history = useInfiniteQuery(
    trpc.finance.bankStatements.history.infiniteQueryOptions(
      { bookId: book.id, accountId, snapshotRevision, limit: 20 },
      {
        retry: false,
        staleTime: 0,
        getNextPageParam: (page) => page.nextCursor ?? undefined,
      },
    ),
  )
  const events = useMemo(
    () => history.data?.pages.flatMap((page) => page.items) ?? [],
    [history.data],
  )
  const eventIds = useMemo(() => events.map((event) => event.id), [events])
  const selection = useInlineSelection({
    ids: eventIds,
    scope: `${accountId}:${snapshotRevision}`,
  })
  return (
    <section className="grid gap-3">
      <h4 className="font-medium">Matching history</h4>
      <p className="text-xs text-muted-foreground">
        Every match and unmatch stays in this account’s history.
      </p>
      {history.isPending ? (
        <output>Loading match history…</output>
      ) : history.isError ? (
        <Alert variant="destructive" appearance="dashboard">
          <AlertTitle>Couldn't load history</AlertTitle>
          <AlertDescription>{history.error.message}</AlertDescription>
          <Button variant="outline" onClick={() => void history.refetch()}>
            Try again
          </Button>
        </Alert>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            As of the latest records.
          </p>
          {events.length ? (
            <InlineSelectionBar
              label="Select all loaded matches"
              selection={selection}
            />
          ) : null}
          {events.map((event) => {
            let evidence: ReturnType<typeof bankMatchEvidence> | null = null
            try {
              evidence = bankMatchEvidence(event)
            } catch {
              /* Invalid original evidence cannot be released. */
            }
            const active =
              event.kind === "MATCH" && activeMatchIds.includes(event.id)
            return (
              <article
                key={event.id}
                className="grid gap-2 border border-border p-4 text-sm data-[state=selected]:bg-muted/60"
                data-state={
                  selection.isSelected(event.id) ? "selected" : undefined
                }
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="flex items-center gap-2">
                    <InlineRowCheckbox
                      selection={selection}
                      id={event.id}
                      label={`Select ${event.kind === "MATCH" ? "match" : "unmatch"} ${event.revision}`}
                    />
                    <Badge variant="outline">
                      {event.kind === "MATCH" ? "Matched" : "Unmatched"}
                    </Badge>
                  </span>
                  <span className="tabular-nums">
                    {formatFinanceMoney(event.amountMinor, book.currencyCode)}
                  </span>
                </div>
                <p className="break-words">{event.reason}</p>
                <p className="break-words text-xs text-muted-foreground">
                  {new Date(event.createdAt).toISOString()} · By{" "}
                  {event.actorUserId}
                </p>
                {event.reversalOfId ? (
                  <p className="break-words text-xs">
                    Unmatches {event.reversalOfId}
                  </p>
                ) : null}
                {evidence ? (
                  <details>
                    <summary className="cursor-pointer">
                      Lines and records · {evidence.bank.length} bank /{" "}
                      {evidence.journal.length} yours
                    </summary>
                    <div className="mt-2 grid gap-1 break-words text-xs">
                      {evidence.bank.map((row) => (
                        <p key={row.id}>
                          Bank line {row.externalId} ·{" "}
                          {row.occurredAt.slice(0, 10)} ·{" "}
                          {formatFinanceMoney(
                            row.amountMinor,
                            book.currencyCode,
                          )}
                        </p>
                      ))}
                      {evidence.journal.map((line) => (
                        <p key={line.id}>
                          Your record {line.sequence} ·{" "}
                          {line.effectiveAt.slice(0, 10)} ·{" "}
                          {formatFinanceMoney(
                            (
                              BigInt(line.debitMinor) - BigInt(line.creditMinor)
                            ).toString(),
                            book.currencyCode,
                          )}
                        </p>
                      ))}
                    </div>
                  </details>
                ) : (
                  <Alert appearance="dashboard" variant="destructive">
                    <AlertDescription>
                      We can't check the lines behind this match, so it can't be
                      unmatched.
                    </AlertDescription>
                  </Alert>
                )}
                {active ? (
                  <Button
                    className="w-fit"
                    variant="outline"
                    disabled={disabled || !evidence}
                    onClick={() => onRelease(event)}
                  >
                    Unmatch
                  </Button>
                ) : null}
              </article>
            )
          })}
          {!events.length ? (
            <p className="text-sm text-muted-foreground">No matches yet.</p>
          ) : null}
          {history.hasNextPage ? (
            <Button
              variant="outline"
              disabled={history.isFetchingNextPage}
              onClick={() => void history.fetchNextPage()}
            >
              {history.isFetchingNextPage ? "Loading older…" : "Load older"}
            </Button>
          ) : null}
        </>
      )}
    </section>
  )
}
