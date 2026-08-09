"use client"

import { useTRPC } from "@/trpc/client"
import { Button } from "@ewatrade/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"

export function PrescriptionFulfillmentPanel({ storeId }: { storeId: string }) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const [pickupCode, setPickupCode] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const pickup = useQuery(
    trpc.prescriptions.pickupQueue.queryOptions({ storeId }),
  )
  const delivery = useQuery(
    trpc.prescriptions.deliveryQueue.queryOptions({ storeId }),
  )
  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: trpc.prescriptions.pickupQueue.queryKey({ storeId }),
      }),
      queryClient.invalidateQueries({
        queryKey: trpc.prescriptions.deliveryQueue.queryKey({ storeId }),
      }),
    ])
  }
  const mutationOptions = {
    onError: (failure: { message: string }) => setError(failure.message),
    onSuccess: async () => {
      await invalidate()
      setError(null)
    },
  }
  const ready = useMutation(
    trpc.prescriptions.markPickupReady.mutationOptions({
      onSuccess: async (result) => {
        await invalidate()
        setPickupCode(result.pickupCode)
        setError(null)
      },
      onError: mutationOptions.onError,
    }),
  )
  const handoff = useMutation(
    trpc.prescriptions.handoffPickup.mutationOptions(mutationOptions),
  )
  const pickupException = useMutation(
    trpc.prescriptions.recordPickupException.mutationOptions({
      ...mutationOptions,
    }),
  )
  const assign = useMutation(
    trpc.prescriptions.assignDelivery.mutationOptions({
      ...mutationOptions,
    }),
  )
  const deliveryReady = useMutation(
    trpc.prescriptions.markDeliveryReady.mutationOptions({
      ...mutationOptions,
    }),
  )
  const transition = useMutation(
    trpc.prescriptions.transitionDelivery.mutationOptions({
      ...mutationOptions,
    }),
  )

  if (pickup.isLoading || delivery.isLoading) {
    return <div className="h-48 animate-pulse rounded-xl bg-muted" />
  }
  const queryError = pickup.error ?? delivery.error
  if (queryError) {
    return (
      <div className="grid gap-3 border border-destructive/30 p-5">
        <p role="alert" className="text-sm text-destructive">
          {queryError.message}
        </p>
        <Button
          className="w-fit"
          onClick={() =>
            void Promise.all([pickup.refetch(), delivery.refetch()])
          }
          variant="outline"
        >
          Try again
        </Button>
      </div>
    )
  }

  return (
    <details className="border border-border bg-card">
      <summary className="cursor-pointer px-5 py-4 font-medium">
        Pickup and delivery operations
      </summary>
      <div className="grid gap-6 border-t border-border p-5 xl:grid-cols-2">
        {error ? (
          <p role="alert" className="text-sm text-destructive xl:col-span-2">
            {error}
          </p>
        ) : null}
        <section className="grid content-start gap-3">
          <h2 className="font-semibold">Paid pickup preparation</h2>
          {pickupCode ? (
            <p className="border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
              One-time pickup code: <strong>{pickupCode}</strong>. Give it only
              through the secure customer process.
            </p>
          ) : null}
          {pickup.data?.length ? (
            pickup.data.map((item) => (
              <article
                className="grid gap-3 border border-border p-4"
                key={item.id}
              >
                <div>
                  <p className="font-medium">{item.order.orderNumber}</p>
                  <p className="text-xs capitalize text-muted-foreground">
                    {item.status.toLowerCase().replaceAll("_", " ")}
                  </p>
                </div>
                {item.status === "PREPARING" || item.status === "EXCEPTION" ? (
                  <form
                    className="grid gap-2"
                    onSubmit={(event) => {
                      event.preventDefault()
                      const data = new FormData(event.currentTarget)
                      ready.mutate({
                        checks: {
                          contentsMatched:
                            data.get("contentsMatched") === "yes",
                          packagingIntact:
                            data.get("packagingIntact") === "yes",
                          pharmacistReleaseConfirmed:
                            data.get("pharmacistReleaseConfirmed") === "yes",
                        },
                        fulfillmentId: item.id,
                        storeId,
                      })
                    }}
                  >
                    {[
                      [
                        "contentsMatched",
                        "Packed contents match the released order",
                      ],
                      ["packagingIntact", "Packaging and labels are intact"],
                      [
                        "pharmacistReleaseConfirmed",
                        "Pharmacist release is confirmed",
                      ],
                    ].map(([name, label]) => (
                      <label
                        className="flex items-start gap-2 text-xs"
                        key={name}
                      >
                        <input
                          name={name}
                          required
                          type="checkbox"
                          value="yes"
                        />
                        <span>{label}</span>
                      </label>
                    ))}
                    <Button disabled={ready.isPending} size="sm" type="submit">
                      Confirm checks and mark ready
                    </Button>
                  </form>
                ) : item.status === "READY" ? (
                  <form
                    className="grid gap-2"
                    onSubmit={(event) => {
                      event.preventDefault()
                      const data = new FormData(event.currentTarget)
                      handoff.mutate({
                        clientOperationId: crypto.randomUUID(),
                        collectorName: String(data.get("collectorName") ?? ""),
                        collectorRelationship:
                          String(data.get("collectorRelationship") ?? "") ||
                          undefined,
                        fulfillmentId: item.id,
                        pickupCode: String(data.get("pickupCode") ?? ""),
                        storeId,
                      })
                    }}
                  >
                    <input
                      className="h-10 border border-border bg-background px-3 text-sm"
                      name="pickupCode"
                      placeholder="Pickup code"
                      required
                    />
                    <input
                      className="h-10 border border-border bg-background px-3 text-sm"
                      name="collectorName"
                      placeholder="Verified collector name"
                      required
                    />
                    <input
                      className="h-10 border border-border bg-background px-3 text-sm"
                      name="collectorRelationship"
                      placeholder="Relationship (optional)"
                    />
                    <Button size="sm" type="submit">
                      Record handoff
                    </Button>
                  </form>
                ) : null}
                {item.status !== "HANDED_OFF" && item.status !== "CANCELLED" ? (
                  <details>
                    <summary className="cursor-pointer text-xs font-medium">
                      Record pickup exception
                    </summary>
                    <form
                      className="mt-2 grid gap-2"
                      onSubmit={(event) => {
                        event.preventDefault()
                        const data = new FormData(event.currentTarget)
                        const exceptionCode = String(
                          data.get("exceptionCode"),
                        ) as
                          | "abandoned"
                          | "cancelled"
                          | "damaged_item"
                          | "incorrect_collector"
                          | "missing_item"
                        pickupException.mutate({
                          clientOperationId: crypto.randomUUID(),
                          exceptionCode,
                          fulfillmentId: item.id,
                          reason: String(data.get("reason") ?? ""),
                          status:
                            exceptionCode === "abandoned"
                              ? "abandoned"
                              : exceptionCode === "cancelled"
                                ? "cancelled"
                                : "exception",
                          storeId,
                        })
                      }}
                    >
                      <select
                        className="h-10 border border-border bg-background px-3 text-sm"
                        name="exceptionCode"
                      >
                        <option value="missing_item">Missing item</option>
                        <option value="damaged_item">Damaged item</option>
                        <option value="incorrect_collector">
                          Incorrect collector
                        </option>
                        <option value="abandoned">Abandoned pickup</option>
                        <option value="cancelled">Cancel pickup</option>
                      </select>
                      <input
                        className="h-10 border border-border bg-background px-3 text-sm"
                        name="reason"
                        placeholder="Required exception reason"
                        required
                      />
                      <Button
                        disabled={pickupException.isPending}
                        size="sm"
                        type="submit"
                        variant="outline"
                      >
                        Record exception
                      </Button>
                    </form>
                  </details>
                ) : null}
              </article>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">
              No paid pickup orders need attention.
            </p>
          )}
        </section>

        <section className="grid content-start gap-3">
          <h2 className="font-semibold">Paid delivery execution</h2>
          {delivery.data?.length ? (
            delivery.data.map((order) => (
              <article
                className="grid gap-3 border border-border p-4"
                key={order.id}
              >
                <div>
                  <p className="font-medium">{order.orderNumber}</p>
                  <p className="text-xs capitalize text-muted-foreground">
                    {order.prescriptionDeliveryAssignment?.status
                      .toLowerCase()
                      .replaceAll("_", " ") ?? "ready for assignment"}
                  </p>
                </div>
                {!order.prescriptionDeliveryAssignment ? (
                  <form
                    className="grid gap-2"
                    onSubmit={(event) => {
                      event.preventDefault()
                      const data = new FormData(event.currentTarget)
                      deliveryReady.mutate({
                        checks: {
                          contentsMatched:
                            data.get("contentsMatched") === "yes",
                          packagingIntact:
                            data.get("packagingIntact") === "yes",
                          pharmacistReleaseConfirmed:
                            data.get("pharmacistReleaseConfirmed") === "yes",
                        },
                        orderId: order.id,
                        storeId,
                      })
                    }}
                  >
                    {[
                      [
                        "contentsMatched",
                        "Packed contents match the released order",
                      ],
                      ["packagingIntact", "Tamper-evident packaging is intact"],
                      [
                        "pharmacistReleaseConfirmed",
                        "Pharmacist release is confirmed",
                      ],
                    ].map(([name, label]) => (
                      <label
                        className="flex items-start gap-2 text-xs"
                        key={name}
                      >
                        <input
                          name={name}
                          required
                          type="checkbox"
                          value="yes"
                        />
                        <span>{label}</span>
                      </label>
                    ))}
                    <Button
                      disabled={deliveryReady.isPending}
                      size="sm"
                      type="submit"
                    >
                      Mark packed and ready
                    </Button>
                  </form>
                ) : order.prescriptionDeliveryAssignment.status ===
                    "READY_FOR_ASSIGNMENT" ||
                  order.prescriptionDeliveryAssignment.status ===
                    "RESCHEDULED" ? (
                  <form
                    className="grid gap-2"
                    onSubmit={(event) => {
                      event.preventDefault()
                      const data = new FormData(event.currentTarget)
                      assign.mutate({
                        courierDisplayName: String(
                          data.get("courierDisplayName") ?? "",
                        ),
                        courierReference: String(
                          data.get("courierReference") ?? "",
                        ),
                        orderId: order.id,
                        storeId,
                      })
                    }}
                  >
                    <input
                      className="h-10 border border-border bg-background px-3 text-sm"
                      name="courierDisplayName"
                      placeholder="Courier display name"
                      required
                    />
                    <input
                      className="h-10 border border-border bg-background px-3 text-sm"
                      name="courierReference"
                      placeholder="Courier reference"
                      required
                    />
                    <Button size="sm" type="submit">
                      Assign courier
                    </Button>
                  </form>
                ) : (
                  <div className="grid gap-3">
                    <form
                      className="grid gap-2"
                      onSubmit={(event) => {
                        event.preventDefault()
                        const data = new FormData(event.currentTarget)
                        transition.mutate({
                          assignmentId:
                            order.prescriptionDeliveryAssignment?.id ?? "",
                          clientOperationId: crypto.randomUUID(),
                          proofReference:
                            String(data.get("proofReference") ?? "") ||
                            undefined,
                          reason: String(data.get("reason") ?? "") || undefined,
                          status: String(data.get("status")) as
                            | "cancelled"
                            | "collected"
                            | "delivered"
                            | "failed"
                            | "in_transit"
                            | "rescheduled"
                            | "returned_to_pharmacy",
                          storeId,
                        })
                      }}
                    >
                      <select
                        className="h-10 border border-border bg-background px-3 text-sm"
                        name="status"
                      >
                        <option value="collected">
                          Collected from pharmacy
                        </option>
                        <option value="in_transit">In transit</option>
                        <option value="delivered">Delivered</option>
                        <option value="failed">
                          Failed contact / unsafe / refusal / damage
                        </option>
                        <option value="rescheduled">Rescheduled</option>
                        <option value="returned_to_pharmacy">
                          Returned to pharmacy
                        </option>
                        <option value="cancelled">Cancelled</option>
                      </select>
                      <input
                        className="h-10 border border-border bg-background px-3 text-sm"
                        name="proofReference"
                        placeholder="Delivery proof reference (required for delivered)"
                      />
                      <input
                        className="h-10 border border-border bg-background px-3 text-sm"
                        name="reason"
                        placeholder="Outcome reason (required for failure/recovery)"
                      />
                      <Button
                        disabled={transition.isPending}
                        size="sm"
                        type="submit"
                        variant="outline"
                      >
                        Record delivery update
                      </Button>
                    </form>
                    {order.prescriptionDeliveryAssignment.status ===
                    "ASSIGNED" ? (
                      <details>
                        <summary className="cursor-pointer text-xs font-medium">
                          Reassign courier
                        </summary>
                        <form
                          className="mt-2 grid gap-2"
                          onSubmit={(event) => {
                            event.preventDefault()
                            const data = new FormData(event.currentTarget)
                            assign.mutate({
                              courierDisplayName: String(
                                data.get("courierDisplayName") ?? "",
                              ),
                              courierReference: String(
                                data.get("courierReference") ?? "",
                              ),
                              orderId: order.id,
                              storeId,
                            })
                          }}
                        >
                          <input
                            className="h-10 border border-border bg-background px-3 text-sm"
                            name="courierDisplayName"
                            placeholder="New courier display name"
                            required
                          />
                          <input
                            className="h-10 border border-border bg-background px-3 text-sm"
                            name="courierReference"
                            placeholder="New courier reference"
                            required
                          />
                          <Button
                            disabled={assign.isPending}
                            size="sm"
                            type="submit"
                            variant="outline"
                          >
                            Record reassignment
                          </Button>
                        </form>
                      </details>
                    ) : null}
                  </div>
                )}
              </article>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">
              No paid delivery orders need attention.
            </p>
          )}
        </section>
      </div>
    </details>
  )
}
