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
      <p className="text-sm text-muted-foreground">{storeName}</p>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={assignmentLabel ? "secondary" : "outline"}>
          {assignmentLabel ?? "Unassigned"}
        </Badge>
        <Badge variant={slaState === "overdue" ? "destructive" : "outline"}>
          {slaState.replaceAll("_", " ")}
        </Badge>
      </div>
      {escalationOpen ? (
        <div className="rounded-none border border-warning-border bg-warning p-3 text-sm text-warning-foreground">
          This conversation needs operational attention. A successful reply
          records the recovery automatically.
        </div>
      ) : null}
    </header>
  )
}
