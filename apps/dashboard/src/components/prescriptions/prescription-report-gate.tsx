import { Button } from "@ewatrade/ui"
import Link from "next/link"

/**
 * Plain gate for Prescription reports, worded like the Prescriptions page
 * gate: a business without a pharmacy is sent to setup; refused reads say
 * what is missing instead of showing the API message.
 */
export function PrescriptionReportGate({
  reason,
}: {
  reason: "setup" | "role" | "unavailable"
}) {
  return (
    <div className="grid min-w-0 flex-1 content-start gap-4 pt-6">
      <section className="grid max-w-2xl justify-items-start gap-3 rounded-[var(--ui-radius-surface)] border border-border bg-card p-6">
        <h2 className="text-lg font-semibold">
          {reason === "setup"
            ? "Finish pharmacy setup"
            : reason === "role"
              ? "You need a pharmacy role"
              : "Prescriptions aren't open yet"}
        </h2>
        <p className="text-sm text-muted-foreground">
          {reason === "setup"
            ? "Prescription reports start once this business is set up as a pharmacy."
            : reason === "role"
              ? "Ask the owner for access to prescription reports."
              : "They open once EwaTrade turns them on for your business."}
        </p>
        {reason === "setup" ? (
          <Button render={<Link href="/settings/compliance" />}>
            Continue setup
          </Button>
        ) : null}
      </section>
    </div>
  )
}
