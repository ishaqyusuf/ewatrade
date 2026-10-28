import { TemplateUpdateControls } from "@/components/storefront/template-update-controls"
import { getServerSession } from "@/lib/session"
import { prisma } from "@ewatrade/db"
import { TEMPLATE_UPDATE_EVENT } from "@ewatrade/notifications/business-events"
import {
  liveTemplateUpdates,
  templateUpdateNotes,
  templateUpdatePath,
  templateUpgradePath,
} from "@ewatrade/storefront-templates"
import { notFound, redirect } from "next/navigation"

export const dynamic = "force-dynamic"
export const metadata = {
  title: "Storefront template update | EwaTrade",
  robots: { index: false, follow: false },
}

/** Business-bound read: opening an email never switches a business, changes a draft or publishes. */
export default async function TemplateUpdatePage({
  params,
}: {
  params: Promise<{ tenantId: string; templateKey: string; version: string }>
}) {
  const { tenantId, templateKey, version } = await params
  let path: string
  try {
    path = templateUpdatePath(tenantId, templateKey, version)
  } catch {
    notFound()
  }
  const session = await getServerSession()
  if (!session) redirect(`/login?next=${encodeURIComponent(path)}`)
  const member = await prisma.membership.findFirst({
    where: {
      tenantId,
      userId: session.user.id,
      status: "ACTIVE",
      role: { in: ["OWNER", "ADMIN"] },
      tenant: { isActive: true },
    },
    select: { id: true, tenant: { select: { name: true } } },
  })
  if (!member) notFound()
  const note = templateUpdateNotes.find(
    (entry) => entry.key === templateKey && entry.version === version,
  )
  if (!note) notFound()
  const [site, preference] = await Promise.all([
    prisma.site.findFirst({
      where: {
        tenantId,
        isPrimary: true,
        status: "PUBLISHED",
        store: { tenantId, status: "ACTIVE" },
      },
      select: {
        activeRelease: {
          select: { tenantId: true, templateKey: true, templateVersion: true },
        },
      },
    }),
    prisma.businessNotificationPreference.findUnique({
      where: {
        tenantId_membershipId_type: {
          tenantId,
          membershipId: member.id,
          type: TEMPLATE_UPDATE_EVENT,
        },
      },
      select: { email: true },
    }),
  ])
  const release = site?.activeRelease
  const isCurrent =
    release?.tenantId === tenantId &&
    release.templateKey === templateKey &&
    release.templateVersion === version
  const offered = liveTemplateUpdates().some(
    (entry) => entry.key === templateKey && entry.version === version,
  )
  const pathToUpgrade =
    release?.tenantId === tenantId && release.templateKey === templateKey
      ? templateUpgradePath(templateKey, release.templateVersion, version)
      : null
  const available = offered && Boolean(pathToUpgrade)
  return (
    <main className="mx-auto max-w-2xl space-y-6 px-6 py-14">
      <p className="text-sm text-muted-foreground">
        {member.tenant.name} · Storefront template {version}
      </p>
      <h1 className="text-3xl font-semibold tracking-tight">{note.title}</h1>
      <h2 className="text-lg font-medium">What’s new</h2>
      <ul className="list-disc space-y-3 pl-5">
        {note.changes.map((change) => (
          <li key={change}>{change}</li>
        ))}
      </ul>
      <div className="space-y-3 border-y border-border py-5 text-sm">
        <p>
          {isCurrent
            ? "Your published storefront already uses this version."
            : available
              ? "Open Studio to update your draft, preview it, and publish when you are ready."
              : "This update is no longer available for your current storefront. Open Studio to see your current design and available updates."}
        </p>
        {available && pathToUpgrade && pathToUpgrade.length > 1 ? (
          <p>
            In Studio, apply each available version update in order to reach{" "}
            {version}.
          </p>
        ) : null}
        <p>
          Your live website stays the same until you review and publish. Opening
          this page does not change your draft.
        </p>
      </div>
      <TemplateUpdateControls
        tenantId={tenantId}
        emailEnabled={preference?.email !== "off"}
      />
    </main>
  )
}
