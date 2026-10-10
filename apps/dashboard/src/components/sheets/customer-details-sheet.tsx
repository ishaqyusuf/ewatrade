"use client"
import { useTRPC } from "@/trpc/client"
import { Button, Sheet } from "@ewatrade/ui"
import { useQuery } from "@tanstack/react-query"
import { parseAsString, useQueryStates } from "nuqs"
import { SheetFrame } from "./sheet-frame"

export function CustomerDetailsSheet() {
  const [{ customerDetail }, setParams] = useQueryStates(
    { customerDetail: parseAsString },
    { history: "push" },
  )
  const trpc = useTRPC()
  const query = useQuery(
    trpc.customers.getById.queryOptions(
      { customerId: customerDetail ?? "" },
      { enabled: Boolean(customerDetail), retry: false, staleTime: 0 },
    ),
  )
  return (
    <Sheet
      open={Boolean(customerDetail)}
      onOpenChange={(open) => {
        if (!open) void setParams({ customerDetail: null })
      }}
    >
      {customerDetail ? (
        <SheetFrame
          title="Customer details"
          description="Saved customer contact information."
        >
          {query.isPending ? (
            <output>Loading customer…</output>
          ) : query.isError ? (
            <div role="alert" className="grid gap-3">
              <p>{query.error.message}</p>
              <Button variant="outline" onClick={() => void query.refetch()}>
                Try again
              </Button>
            </div>
          ) : (
            <dl className="grid gap-4 text-sm">
              {[
                ["Name", query.data.name],
                ["Email", query.data.email],
                ["Phone", query.data.phone],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className="break-words">{value || "Not provided"}</dd>
                </div>
              ))}
            </dl>
          )}
        </SheetFrame>
      ) : null}
    </Sheet>
  )
}
