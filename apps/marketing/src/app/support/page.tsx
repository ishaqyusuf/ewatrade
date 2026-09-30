import { MarketingInfoPage } from "@/components/marketing/marketing-info-page"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Support | EwaTrade",
  description:
    "Contact EwaTrade for account access, software billing and platform support.",
}
export default function SupportPage() {
  return <MarketingInfoPage kind="support" />
}
