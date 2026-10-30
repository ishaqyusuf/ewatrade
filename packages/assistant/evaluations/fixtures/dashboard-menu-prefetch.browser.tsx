import { ScrollBehavior } from "next/dist/client/components/router-reducer/router-reducer-types"
import { FetchStrategy } from "next/dist/client/components/segment-cache/types"
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime"
import { createRoot } from "react-dom/client"
import { IntentLink } from "../../../../apps/dashboard/src/components/dashboard/intent-link"
import { MainMenu } from "../../../../apps/dashboard/src/components/dashboard/main-menu"
import type { DashboardNavItem } from "../../../../apps/dashboard/src/lib/navigation"

type DirectOptions = {
  href: string
  preventHover?: boolean
  preventClick?: boolean
}

declare global {
  interface Window {
    __menuItems: DashboardNavItem[]
    __menuProbe: {
      tasks: Array<{
        pathname: string
        search: string
        strategy: number
        priority: number
        cancelled: boolean
      }>
      navigations: Array<{
        href: string
        type: string
        intent: string
        scroll: number
      }>
      closes: number
      strategies: { PPR: number; Full: number }
      scrollModes: { NoScroll: number }
      handlers: { hover: number; focus: number; touch: number; click: number }
      renderDirect: (options: DirectOptions) => void
    }
  }
}
const router = {
  bfcacheId: "inert-menu",
  back() {},
  forward() {},
  refresh() {},
  hmrRefresh() {},
  push() {},
  replace() {},
  prefetch() {},
}
const host = document.getElementById("app")
if (!host) throw Error("Missing inert host")
const root = createRoot(host)
window.__menuProbe = {
  tasks: [],
  navigations: [],
  closes: 0,
  strategies: { PPR: FetchStrategy.PPR, Full: FetchStrategy.Full },
  scrollModes: { NoScroll: ScrollBehavior.NoScroll },
  handlers: { hover: 0, focus: 0, touch: 0, click: 0 },
  renderDirect(options) {
    root.render(
      <AppRouterContext.Provider value={router}>
        <IntentLink
          href={options.href}
          aria-label="Direct target"
          className="inert-direct"
          replace
          scroll={false}
          onMouseEnter={(event) => {
            window.__menuProbe.handlers.hover++
            if (options.preventHover) event.preventDefault()
          }}
          onFocus={() => {
            window.__menuProbe.handlers.focus++
          }}
          onTouchStart={() => {
            window.__menuProbe.handlers.touch++
          }}
          onClick={(event) => {
            window.__menuProbe.handlers.click++
            if (options.preventClick) event.preventDefault()
          }}
        >
          Direct target
        </IntentLink>
      </AppRouterContext.Provider>,
    )
  },
}
root.render(
  <AppRouterContext.Provider value={router}>
    <MainMenu
      navItems={window.__menuItems}
      isExpanded
      onNavigate={() => {
        window.__menuProbe.closes++
      }}
    />
  </AppRouterContext.Provider>,
)
