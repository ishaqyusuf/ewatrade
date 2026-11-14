import { formatStoreConversationStatus } from "@/components/tables/store-conversations/columns"
import { Badge } from "@ewatrade/ui"

export function StoreConversationHeader({
  assignmentLabel,
  escalationOpen,
  slaState,
  storeName,
}: {
  assignmentLabel: string | null
  escalationOpen: boolean
  slaState: string
  storeName: string
}) {
  return (
    <header className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={assignmentLabel ? "secondary" : "outline"}>
          {assignmentLabel ? `Answered by ${assignmentLabel}` : "Nobody yet"}
        </Badge>
        {slaState === "responded" ? null : (
          <Badge variant={slaState === "overdue" ? "destructive" : "outline"}>
            {formatStoreConversationStatus(slaState)}
          </Badge>
        )}
        <span className="text-sm text-muted-foreground">{storeName}</span>
      </div>
      {escalationOpen ? (
        <div className="rounded-[var(--ui-radius-item)] border border-warning-border bg-warning p-3 text-sm text-warning-foreground">
          This customer is waiting. Reply now.
        </div>
      ) : null}
    </header>
  )
}
