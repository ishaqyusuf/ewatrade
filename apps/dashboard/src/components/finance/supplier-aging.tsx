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
          label="On this day"
          className="w-48"
          error={
            invalid
              ? "Choose a valid day on or after your start date."
              : undefined
          }
        >
          <DateControl
            value={day}
            min={new Date(book.startsAt).toISOString().slice(0, 10)}
            onValueChange={setDay}
          />
        </ControlField>
        <Button
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
          Show
        </Button>
        <Button
          variant="outline"
          onClick={() => setVersion((value) => value + 1)}
        >
          Refresh
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
        <AlertTitle>Couldn't load when this is due</AlertTitle>
        <AlertDescription>{query.error.message}</AlertDescription>
        <AlertDescription>
          Nothing is shown.
          {query.error.message ===
          "Payable aging exceeds the 1000-source limit; a staged report is required."
            ? " There are too many entries to show here."
            : null}
        </AlertDescription>
        <Button
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
          ? "Waiting for a connection…"
          : "Loading when this is due…"}
      </output>
    )
  }
  if (!matchesSupplierAgingScope(query.data, scope)) {
    return (
      <Alert appearance="dashboard" variant="destructive">
        <AlertTitle>This no longer matches what you asked for</AlertTitle>
        <AlertDescription>
          Refresh to check the Supplier and day. Nothing is shown until you do.
        </AlertDescription>
      </Alert>
    )
  }
  if (snapshotSequence === undefined)
    return <output aria-busy="true">Loading…</output>
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
