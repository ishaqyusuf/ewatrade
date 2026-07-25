import { SettingsNavigation } from "@/components/settings/settings-navigation"

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-1 flex-col">
      <SettingsNavigation />
      {children}
    </div>
  )
}
