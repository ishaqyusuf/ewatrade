"use client"
import { parseAsString, useQueryStates } from "nuqs"

/** Overlays own only their object parameters; assistant/chat parameters survive. */
export function useServiceIntakeReceiptParams() {
  const [params, setParams] = useQueryStates(
    {
      serviceIntake: parseAsString,
      orderSheet: parseAsString,
      orderId: parseAsString,
      serviceSheet: parseAsString,
      jobId: parseAsString,
    },
    { history: "push", shallow: true },
  )
  const valid =
    params.serviceIntake?.trim() && params.serviceIntake.length <= 128
  return {
    isOpen: params.serviceIntake !== null,
    intakeId: valid ? params.serviceIntake : null,
    close: () => setParams({ serviceIntake: null }),
    openOrder: (id: string) =>
      setParams({
        serviceIntake: null,
        serviceSheet: null,
        jobId: null,
        orderSheet: "details",
        orderId: id,
      }),
    openJob: (id: string) =>
      setParams({
        serviceIntake: null,
        orderSheet: null,
        orderId: null,
        serviceSheet: "job",
        jobId: id,
      }),
  }
}
