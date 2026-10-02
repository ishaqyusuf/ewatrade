"use client"
import { ScrollableContent } from "@/components/scrollable-content"
import { useTRPC } from "@/trpc/client"
import {
  Alert,
  AlertDescription,
  Button,
  ControlField,
  Input,
} from "@ewatrade/ui"
import { useQuery } from "@tanstack/react-query"
import Link from "next/link"
import { parseAsString, useQueryStates } from "nuqs"
export function CustomerLedgerDirectory() {
  const trpc = useTRPC()
  const [params, setParams] = useQueryStates(
    {
      customerSearch: parseAsString.withDefault(""),
      customerCursor: parseAsString,
    },
    { history: "push" },
  )
  const query = useQuery(
    trpc.customers.listPage.queryOptions(
      {
        query: params.customerSearch.trim() || undefined,
        cursor: params.customerCursor ?? undefined,
        limit: 30,
      },
      { retry: false },
    ),
  )
  return (
    <ScrollableContent>
      <div className="grid gap-6 py-6">
        <header>
          <h1 className="text-2xl font-medium">Customer accounts</h1>
          <p className="text-sm text-muted-foreground">
            Saved customers only. Historical contacts are not inferred as
            account owners.
          </p>
        </header>
        <ControlField label="Find a saved customer">
          <Input
            value={params.customerSearch}
            onChange={(e) =>
              void setParams({
                customerSearch: e.target.value,
                customerCursor: null,
              })
            }
          />
        </ControlField>
        {query.isPending ? (
          <output aria-busy="true">Loading saved customers…</output>
        ) : query.isError ? (
          <Alert appearance="dashboard" variant="destructive">
            <AlertDescription>{query.error.message}</AlertDescription>
            <Button onClick={() => void query.refetch()}>Try again</Button>
          </Alert>
        ) : (
          <>
            <ul className="divide-y divide-border">
              {query.data.items.map((c) => (
                <li
                  key={c.id}
                  className="flex items-center justify-between gap-4 py-4"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{c.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {c.phone ?? c.email ?? "Saved customer"}
                    </p>
                  </div>
                  <Link
                    className="shrink-0 text-sm underline"
                    href={`/customers/${encodeURIComponent(c.id)}/statement`}
                  >
                    View statement
                  </Link>
                </li>
              ))}
            </ul>
            {!query.data.items.length ? (
              <p>No saved customers match this search.</p>
            ) : null}
            <div className="flex gap-2">
              <Button
                variant="outline"
                disabled={!params.customerCursor || query.isFetching}
                onClick={() => void setParams({ customerCursor: null })}
              >
                First page
              </Button>
              <Button
                variant="outline"
                disabled={!query.data.nextCursor || query.isFetching}
                onClick={() =>
                  void setParams({
                    customerCursor: query.data.nextCursor ?? null,
                  })
                }
              >
                Next page
              </Button>
            </div>
          </>
        )}
      </div>
    </ScrollableContent>
  )
}
