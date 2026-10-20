import type { StaffStatusReceiptRecord } from "@ewatrade/db/staff-status-receipt"
export function StaffStatusSheetHeader({
  record,
}: { record: StaffStatusReceiptRecord }) {
  return (
    <p className="text-xs text-muted-foreground">
      {record.eventType === "SUSPENDED"
        ? "Original suspension"
        : "Original reactivation"}{" "}
      · whole business
    </p>
  )
}
