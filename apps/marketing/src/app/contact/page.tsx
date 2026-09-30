import { MarketingInfoPage } from "@/components/marketing/marketing-info-page"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Contact | EwaTrade",
  description:
    "Talk with EwaTrade about retail, service and multi-store workflows.",
}
export default function ContactPage() {
  return <MarketingInfoPage kind="contact" />
}
