import { QaWebAccelerator } from "@ewatrade/onboarding/components/qa/qa-web-accelerator"
import { getMarketingUrl } from "@ewatrade/onboarding/lib/signup-navigation"
import { isQaAcceleratorClientMode } from "@ewatrade/utils/qa-accelerator"
import { getQaPolicyEnvironment } from "@ewatrade/utils/qa-policy-server"
import type { Metadata } from "next"
import "@ewatrade/onboarding/styles/signup.css"

export const metadata: Metadata = {
  title: "Create your store — EwaTrade",
  robots: { index: false, follow: false },
}

export default async function SignupLayout({
  children,
}: { children: React.ReactNode }) {
  const marketingUrl = getMarketingUrl()
  const qaEnabled =
    (await getQaPolicyEnvironment()).QA_ACCELERATOR_ENABLED === "true" &&
    isQaAcceleratorClientMode(process.env.APP_ENV ?? process.env.NODE_ENV)
  const flow = (
    <div className="signup-shell">
      <header className="signup-header">
        <a href={marketingUrl} aria-label="EwaTrade home">
          <img
            src="/brand/ewatrade-logo-precision-rise-v1.svg"
            alt="ẸwáTrade"
            width={145}
            height={32}
          />
        </a>
        <a href={marketingUrl}>Come. Trade. Together.</a>
      </header>
      {children}
      <footer className="signup-footer">
        Already have an account? <a href="/login">Sign in</a>
        {" · "}
        <a href={marketingUrl}>Back to EwaTrade</a>
      </footer>
    </div>
  )
  return qaEnabled ? <QaWebAccelerator>{flow}</QaWebAccelerator> : flow
}
