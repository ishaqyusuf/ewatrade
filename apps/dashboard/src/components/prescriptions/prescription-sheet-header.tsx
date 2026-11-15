export function PrescriptionSheetHeader({
  reference,
  status,
}: {
  reference?: string
  status?: string
}) {
  return (
    <div className="mb-5 border-b border-border pb-4">
      <p className="text-sm text-muted-foreground">{status ?? "Loading…"}</p>
      <h3 className="mt-1 text-lg font-semibold">
        {reference ?? "Prescription request"}
      </h3>
    </div>
  )
}
