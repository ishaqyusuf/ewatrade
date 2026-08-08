"use client"

import { DashboardSheet } from "@/components/dashboard/dashboard-sheet"
import { PrescriptionSheetContent } from "@/components/prescriptions/prescription-sheet-content"
import { usePrescriptionParams } from "@/hooks/use-prescription-params"
import { useTRPC } from "@/trpc/client"
import { useQueryClient } from "@tanstack/react-query"

export function PrescriptionRequestSheet({ storeId }: { storeId: string }) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const { prescriptionId, setParams, sheet } = usePrescriptionParams()
  const open = Boolean(sheet)
  const close = () => {
    if (prescriptionId) {
      queryClient.invalidateQueries({
        queryKey: trpc.prescriptions.detail.queryKey({
          requestId: prescriptionId,
          storeId,
        }),
      })
    }
    setParams(null)
  }
  return (
    <DashboardSheet
      open={open}
      onClose={close}
      title={
        sheet === "intake" ? "Staff-assisted intake" : "Prescription request"
      }
      description={
        sheet === "intake"
          ? "Capture only the details needed for pharmacy review."
          : "Sensitive media access is short-lived and audited."
      }
    >
      {open ? <PrescriptionSheetContent storeId={storeId} /> : null}
    </DashboardSheet>
  )
}
