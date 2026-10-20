import {
  SettingsHeader,
  SettingsPage,
  SettingsRow,
  SettingsSection,
} from "@/components/settings/settings-page"
import { getDashboardRoleLabel } from "@/lib/navigation"
import { getServerSession } from "@/lib/session"
import { getActiveTenant } from "@/lib/tenant"
import { redirect } from "next/navigation"

export const metadata = { title: "General settings | EwaTrade" }

function currencyName(code: string) {
  try {
    const name = new Intl.DisplayNames(["en-NG"], { type: "currency" }).of(code)
    return name && name !== code ? `${name} (${code})` : code
  } catch {
    return code
  }
}

function timeZoneLabel(timeZone: string) {
  const city = timeZone.split("/").pop()?.replaceAll("_", " ") ?? timeZone
  try {
    const short = new Intl.DateTimeFormat("en-NG", {
      timeZone,
      timeZoneName: "short",
    })
      .formatToParts(new Date())
      .find((part) => part.type === "timeZoneName")?.value
    return short ? `${city} time (${short})` : city
  } catch {
    return timeZone
  }
}

export default async function GeneralSettingsPage() {
  const session = await getServerSession()
  const ctx = session ? await getActiveTenant(session.user.id) : null

  if (!session || !ctx) {
    redirect("/")
  }

  const store = ctx.activeStore ?? ctx.stores[0]
  const currency = store?.currencyCode ?? ctx.tenant.currencyCode

  return (
    <SettingsPage>
      <SettingsHeader
        title="General"
        description="Your business details and who is signed in."
      />
      <SettingsSection title="Business">
        <SettingsRow label="Business name">
          <span className="text-sm font-medium">{ctx.tenant.name}</span>
        </SettingsRow>
        <SettingsRow label="Currency">
          <span className="text-sm font-medium">{currencyName(currency)}</span>
        </SettingsRow>
        <SettingsRow
          label="Time zone"
          description="Used for reports, opening hours and reminders."
        >
          <span className="text-sm font-medium">
            {timeZoneLabel(ctx.tenant.timezone)}
          </span>
        </SettingsRow>
        <SettingsRow
          label="Current store"
          description="Switch stores from the store menu at the top of the dashboard."
        >
          <span className="text-sm font-medium">
            {store?.name ?? "Not set"}
          </span>
        </SettingsRow>
      </SettingsSection>
      <SettingsSection title="Your account">
        <SettingsRow label="Signed in as">
          <span className="grid text-right text-sm font-medium">
            {session.user.displayName ?? session.user.email}
            {session.user.displayName ? (
              <span className="font-normal text-muted-foreground">
                {session.user.email}
              </span>
            ) : null}
          </span>
        </SettingsRow>
        <SettingsRow label="Role">
          <span className="text-sm font-medium">
            {getDashboardRoleLabel(ctx.membership.role)}
          </span>
        </SettingsRow>
      </SettingsSection>
    </SettingsPage>
  )
}
