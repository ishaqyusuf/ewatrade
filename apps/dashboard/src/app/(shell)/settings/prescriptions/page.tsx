import type { Metadata } from "next"
import { redirect } from "next/navigation"

export const metadata: Metadata = {
  title: "Pharmacy compliance | EwaTrade",
}

export default function LegacyPrescriptionSettingsPage() {
  redirect("/settings/compliance")
}
