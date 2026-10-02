"use client"

import { PrescriptionSheetContent } from "@/components/prescriptions/prescription-sheet-content"
import { usePrescriptionParams } from "@/hooks/use-prescription-params"
import { useTRPC } from "@/trpc/client"
import { Sheet } from "@ewatrade/ui"
import { useQueryClient } from "@tanstack/react-query"
import { useState } from "react"

export function PrescriptionRequestSheet({
  canManageSetup,
  storeId,
}: {
  canManageSetup: boolean
  storeId: string
}) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const { prescriptionId, setParams, sheet } = usePrescriptionParams()
  const open = Boolean(sheet)
  const scopeKey = `${storeId}:${prescriptionId ?? "intake"}:${sheet}`
  const [closeFailure, setCloseFailure] = useState<{
    message: string
    scopeKey: string
  } | null>(null)

  async function close() {
    try {
      if (prescriptionId) {
        await queryClient.invalidateQueries({
          queryKey: trpc.prescriptions.detail.queryKey({
            requestId: prescriptionId,
            storeId,
          }),
        })
      }
      await setParams(null)
    } catch (error) {
      setCloseFailure({
        message:
          error instanceof Error
            ? error.message
            : "The prescription request could not be closed.",
        scopeKey,
      })
    }
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) void close()
      }}
    >
      {open ? (
        <PrescriptionSheetContent
          key={scopeKey}
          canManageSetup={canManageSetup}
          closeError={
            closeFailure?.scopeKey === scopeKey ? closeFailure.message : null
          }
          storeId={storeId}
        />
      ) : null}
    </Sheet>
  )
}
