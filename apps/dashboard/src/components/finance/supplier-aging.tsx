"use client"

import { useTRPC } from "@/trpc/client"
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  ControlField,
  DateControl,
} from "@ewatrade/ui"
import { useQuery } from "@tanstack/react-query"
import { useEffect, useState } from "react"
import {
  type SupplierAgingCursor,
  isSupplierAgingDay,
  matchesSupplierAgingScope,
} from "./supplier-aging-state"
import { FinanceSupplierAgingView } from "./supplier-aging-view"
import type { FinanceBook } from "./types"

export function FinanceSupplierAging({
  book,
  supplierId,
}: { book: FinanceBook; supplierId: string }) {
  return (
    <SupplierAgingWorkspace
      key={`${book.id}:${supplierId}`}
      book={book}
      supplierId={supplierId}
    />
  )
}

function SupplierAgingWorkspace({
  book,
  supplierId,
}: { book: FinanceBook; supplierId: string }) {
  const [day, setDay] = useState(() => new Date().toISOString().slice(0, 10))
  const [asOfDate, setAsOfDate] = useState(day)
  const [version, setVersion] = useState(0)
  const [invalid, setInvalid] = useState(false)
  return (
    <div className="flex min-w-0 flex-col gap-5">
      <div className="flex flex-wrap items-end gap-2">
        <ControlField
          label="As-of day (UTC)"
          className="w-48"
          error={invalid ? "Choose a valid day within this Book." : undefined}
        >
          <DateControl
            value={day}
            min={new Date(book.startsAt).toISOString().slice(0, 10)}
            onValueChange={setDay}
          />
        </ControlField>
        <Button
          appearance="form"
          variant="outline"
          onClick={() => {
            if (!isSupplierAgingDay(day, book.startsAt)) {
              setInvalid(true)
              return
            }
            setInvalid(false)
            setAsOfDate(day)
            setVersion((value) => value + 1)
          }}
        >
          Apply day
        </Button>
        <Button
          appearance="form"
          variant="outline"
          onClick={() => setVersion((value) => value + 1)}
        >
          Refresh aging
        </Button>
      </div>
      <SupplierAgingPage
        key={`${asOfDate}:${version}`}
        book={book}
        supplierId={supplierId}
        asOfDate={asOfDate}
      />
    </div>
  )
}

function SupplierAgingPage({
  book,
  supplierId,
  asOfDate,
}: { book: FinanceBook; supplierId: string; asOfDate: string }) {
  const trpc = useTRPC()
  const [snapshotSequence, setSnapshot] = useState<string>()
  const [cursors, setCursors] = useState<
    Array<SupplierAgingCursor | undefined>
  >([undefined])
  const scope = { bookId: book.id, supplierId, asOfDate, snapshotSequence }
  const query = useQuery(
    trpc.finance.supplierPayableAging.queryOptions(
      { ...scope, cursor: cursors.at(-1), limit: 30 },
      {
        retry: false,
        staleTime: 0,
        refetchOnMount: "always",
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
      },
    ),
  )
  useEffect(() => {
    if (
      snapshotSequence === undefined &&
      query.isSuccess &&
      query.isFetchedAfterMount &&
      !query.isFetching &&
      query.fetchStatus !== "paused" &&
      matchesSupplierAgingScope(query.data, {
        bookId: book.id,
        supplierId,
        asOfDate,
      })
    ) {
      setSnapshot(query.data.snapshotSequence)
    }
  }, [
    snapshotSequence,
    query.isSuccess,
    query.isFetchedAfterMount,
    query.isFetching,
    query.fetchStatus,
    query.data,
    book.id,
    supplierId,
    asOfDate,
  ])
  // Errors take precedence over retained data, including a revoked permission.
  if (query.isError)
    return (
      <Alert appearance="dashboard" variant="destructive">
        <AlertTitle>Payable aging could not be loaded</AlertTitle>
        <AlertDescription>{query.error.message}</AlertDescription>
        <AlertDescription>
          No aging balances are shown.
          {query.error.message ===
          "Payable aging exceeds the 1000-source limit; a staged report is required."
            ? " Histories above the 1,000-source limit require a staged report."
            : null}
        </AlertDescription>
        <Button
          appearance="form"
          variant="outline"
          className="w-fit"
          onClick={() => void query.refetch()}
        >
          Try again
        </Button>
      </Alert>
    )
  // A paused refetch can retain cached success while isFetching is false.
  if (
    query.isPending ||
    query.isFetching ||
    query.fetchStatus === "paused" ||
    !query.isFetchedAfterMount ||
    !query.data
  ) {
    return (
      <output aria-busy="true" className="text-sm text-muted-foreground">
        {query.fetchStatus === "paused"
          ? "Waiting for a connection to verify payable aging…"
          : "Loading payable aging…"}
      </output>
    )
  }
  if (!matchesSupplierAgingScope(query.data, scope)) {
    return (
      <Alert appearance="dashboard" variant="destructive">
        <AlertTitle>The aging response no longer matches this view</AlertTitle>
        <AlertDescription>
          Refresh aging to verify the supplier, Book, UTC day and snapshot. No
          balances are shown.
        </AlertDescription>
      </Alert>
    )
  }
  if (snapshotSequence === undefined)
    return <output aria-busy="true">Pinning payable aging snapshot…</output>
  const aging = query.data
  return (
    <FinanceSupplierAgingView
      aging={aging}
      page={cursors.length}
      onPrevious={() => setCursors((value) => value.slice(0, -1))}
      onNext={() => {
        if (!aging.nextCursor) return
        setSnapshot(aging.snapshotSequence)
        setCursors((value) => [...value, aging.nextCursor ?? undefined])
      }}
    />
  )
}
