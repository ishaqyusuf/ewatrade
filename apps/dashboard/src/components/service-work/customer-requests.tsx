"use client"

import { label } from "@/components/service-work/service-utils"
import { useServiceWorkParams } from "@/hooks/use-service-work-params"
import { useTRPC } from "@/trpc/client"
import { Badge, Button } from "@ewatrade/ui"
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query"

export function CustomerRequests({ storeId }: { storeId: string }) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const { setParams } = useServiceWorkParams()
  const { data: forms } = useSuspenseQuery(
    trpc.serviceAccess.requestForms.queryOptions({ storeId }, { retry: false }),
  )
  const { data: requests } = useSuspenseQuery(
    trpc.serviceAccess.requests.queryOptions(
      { limit: 100, storeId },
      { retry: false },
    ),
  )
  const dispositionMutation = useMutation(
    trpc.serviceAccess.updateRequest.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({
          queryKey: trpc.serviceAccess.requests.queryKey(),
        })
      },
    }),
  )

  return (
    <section className="grid gap-3 border-t border-border pt-6">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="font-semibold">Customer requests</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Requests create no price promise or work until a Quote is accepted.
          </p>
        </div>
        <span className="text-xs text-muted-foreground">
          {forms.length} active links
        </span>
      </div>
      {requests.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">
          No customer requests yet.
        </p>
      ) : (
        requests.map((request) => (
          <div className="border-b border-border py-4" key={request.id}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="font-medium">{request.customerName}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {request.lines
                    .map((line) => `${line.quantity} × ${line.offeringName}`)
                    .join(", ")}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  From {request.formLabel}
                </p>
              </div>
              <Badge className="w-fit rounded-full capitalize">
                {label(request.status)}
              </Badge>
            </div>
            {request.details ? (
              <p className="mt-3 rounded-lg bg-muted px-3 py-2 text-sm">
                {request.details}
              </p>
            ) : null}
            <div className="mt-4 flex flex-wrap gap-2">
              {request.status !== "CONVERTED" &&
              request.status !== "DECLINED" ? (
                <Button
                  size="sm"
                  onClick={() =>
                    setParams({
                      requestId: request.id,
                      serviceSheet: "quote",
                    })
                  }
                >
                  Issue quote
                </Button>
              ) : null}
              {request.status === "SUBMITTED" ? (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={dispositionMutation.isPending}
                  onClick={() =>
                    dispositionMutation.mutate({
                      requestId: request.id,
                      response:
                        "Please provide the additional details requested by the business.",
                      status: "needs_information",
                    })
                  }
                >
                  Request information
                </Button>
              ) : null}
              {request.status !== "CONVERTED" &&
              request.status !== "DECLINED" ? (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={dispositionMutation.isPending}
                  onClick={() =>
                    dispositionMutation.mutate({
                      requestId: request.id,
                      response: "The business is unable to quote this request.",
                      status: "declined",
                    })
                  }
                >
                  Decline
                </Button>
              ) : null}
            </div>
          </div>
        ))
      )}
    </section>
  )
}
