"use client"

import {
  getDashboardRouteUrl,
  getMarketingUrl,
} from "../../lib/signup-navigation"
import { DevEmailPreview } from "../dev/dev-email-preview"

type StepSuccessProps = {
  tenantSlug: string
  businessName: string
  dashboardUrl?: string
  devEmailHtml?: string
  emailDeliveryStatus?: "failed" | "sent"
  posUrl?: string
  storefrontUrl?: string
}

function displayAddress(url: string) {
  try {
    const parsed = new URL(url)
    return parsed.host + (parsed.pathname === "/" ? "" : parsed.pathname)
  } catch {
    return url.replace(/^https?:\/\//, "")
  }
}

export function StepSuccess({
  businessName,
  dashboardUrl,
  devEmailHtml,
  emailDeliveryStatus = "sent",
}: StepSuccessProps) {
  const resolvedDashboardUrl = dashboardUrl ?? getDashboardRouteUrl("")
  const surfaces = [
    {
      label: "Storefront",
      description: "Coming later",
      href: null,
    },
    {
      label: "POS",
      description: "Coming later",
      href: null,
    },
    {
      label: "Shared dashboard",
      description: "Operations and settings",
      href: resolvedDashboardUrl,
    },
  ]
  return (
    <div>
      <div className="signup-success-check" aria-hidden="true">
        ✓
      </div>
      <div className="signup-heading">
        <p className="signup-entry">Ready for your next chapter</p>
        <h1>
          Your workspace
          <br />
          is ready.
        </h1>
        <p className="signup-intro">
          <strong>{businessName}</strong> has a connected place for products,
          orders and the work that follows.
        </p>
      </div>
      <div className="signup-success-addresses">
        {surfaces.map((surface) =>
          surface.href ? (
            <a
              key={surface.label}
              href={surface.href}
              target="_blank"
              rel="noopener noreferrer"
            >
              <span>
                <small>{surface.label}</small>
                <span className="signup-address-output">
                  {displayAddress(surface.href)}
                </span>
                <small>{surface.description}</small>
              </span>
              <span aria-hidden="true">↗</span>
            </a>
          ) : (
            <div key={surface.label} aria-disabled="true">
              <span>
                {surface.label}
                <small>{surface.description}</small>
              </span>
              <span className="signup-pending-icon" aria-label="Pending">
                ◷
              </span>
            </div>
          ),
        )}
      </div>
      <output className="signup-hint signup-email-notice">
        {emailDeliveryStatus === "sent"
          ? "We sent a confirmation email to verify your address. Check your inbox and follow the link to activate your account."
          : "Your workspace is ready, but the confirmation email could not be sent yet. Open your dashboard and contact support if you need help verifying your address."}
      </output>
      {devEmailHtml && (
        <DevEmailPreview
          html={devEmailHtml}
          subject={`Welcome to EwaTrade — verify your ${businessName} workspace`}
        />
      )}
      <div className="signup-actions">
        <a className="signup-primary" href={resolvedDashboardUrl}>
          Go to dashboard <span aria-hidden="true">↗</span>
        </a>
        <a className="signup-secondary" href={getMarketingUrl()}>
          Back to home
        </a>
      </div>
    </div>
  )
}
