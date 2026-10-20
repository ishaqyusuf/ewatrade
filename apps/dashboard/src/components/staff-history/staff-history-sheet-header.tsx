import type { GeneralAnswer } from "@ewatrade/assistant/general/contracts"
export function StaffHistorySheetHeader({
  filters,
}: {
  filters: Extract<
    NonNullable<GeneralAnswer["target"]>,
    { kind: "staff_history" }
  >["filters"]
}) {
  return (
    <div className="grid gap-1 text-xs text-muted-foreground">
      <p>
        {filters.storeId
          ? "Business · recorded Store access changes"
          : "Business · staff lifecycle and access history"}
      </p>
      {Object.entries(filters)
        .filter(([key]) => key !== "cursor")
        .map(([key, value]) => (
          <p key={key} className="break-all">
            {
              (
                {
                  membershipId: "Subject membership",
                  actorMembershipId: "Actor membership",
                  storeId: "Historical Store",
                  from: "From (inclusive)",
                  to: "Until (exclusive)",
                  stream: "Stream",
                  eventType: "Event type",
                } as Record<string, string>
              )[key]
            }
            : {value}
          </p>
        ))}
    </div>
  )
}
