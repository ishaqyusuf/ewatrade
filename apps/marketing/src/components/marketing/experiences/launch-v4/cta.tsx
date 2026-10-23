import { getCreateStoreCta } from "@/lib/create-store-url"
import {
  type MarketingChannel,
  marketingAttrs,
} from "@/lib/marketing-interactions"

export const WHATSAPP_START_URL = `https://wa.me/2349047125343?text=${encodeURIComponent("Hi, I’d like to set up my business on EwaTrade.")}`

export function WhatsAppIcon() {
  return (
    <svg
      className="w-wa-glyph"
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <path
        className="bub"
        d="M12 3a9 9 0 0 0-7.8 13.5L3 21l4.6-1.2A9 9 0 1 0 12 3Z"
      />
      <path
        className="ph"
        d="M9 7.5c.4 0 .7.2.8.6l.6 1.6c.1.3 0 .7-.2.9l-.7.7c.6 1.2 1.6 2.2 2.8 2.8l.7-.7c.2-.2.6-.3.9-.2l1.6.6c.4.1.6.4.6.8v1.2c0 .6-.5 1.1-1.1 1.1A7.6 7.6 0 0 1 7.6 8.6c0-.6.5-1.1 1.1-1.1Z"
      />
    </svg>
  )
}

export function WhatsAppCta({
  channel,
  paper = false,
  block = false,
}: { channel: MarketingChannel; paper?: boolean; block?: boolean }) {
  return (
    <a
      className={`gg-btn w-btn-wa${paper ? " w-btn-wa--paper" : ""}${block ? " gg-btn--block" : ""}`}
      href={WHATSAPP_START_URL}
      target="_blank"
      rel="noopener noreferrer"
      {...marketingAttrs("whatsapp", channel, "whatsapp")}
    >
      <WhatsAppIcon />
      Start on WhatsApp
      <span className="ew-sr"> (opens WhatsApp in a new tab)</span>
    </a>
  )
}

export function WebSignupCta({
  signupEnabled,
  channel,
  className = "gg-btn gg-btn--gold",
}: { signupEnabled: boolean; channel: MarketingChannel; className?: string }) {
  const cta = getCreateStoreCta(signupEnabled)
  return (
    <a
      className={className}
      href={cta.href}
      {...marketingAttrs(cta.kind, channel)}
    >
      {signupEnabled ? "Create your free store" : cta.label}
    </a>
  )
}
