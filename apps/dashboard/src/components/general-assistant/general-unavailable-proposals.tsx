import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
type Unavailable =
  RouterOutputs["assistant"]["conversation"]["unavailableProposals"][number]

export function GeneralUnavailableProposals({ rows }: { rows: Unavailable[] }) {
  return (
    <div className="grid gap-3 pl-10">
      {rows.map((row) => (
        <div
          key={row.id}
          className="rounded-lg border px-4 py-3 text-sm"
          role="status"
        >
          <p className="font-medium">Saved action unavailable</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Saved status: {row.status.toLowerCase()}
          </p>
          <p className="mt-2">
            {row.reason === "client_unavailable"
              ? "This saved action is unavailable in this app."
              : row.reason === "receipt_unavailable"
                ? "The saved receipt format is unavailable here."
                : "This saved action uses a format or version unavailable here."}{" "}
            Its record has been kept. Editing and confirmation are unavailable.
          </p>
        </div>
      ))}
    </div>
  )
}
