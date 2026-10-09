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
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
          This conversation needs operational attention. A successful reply
          records the recovery automatically.
        </div>
      ) : null}
    </header>
  )
}
