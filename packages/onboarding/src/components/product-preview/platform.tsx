"use client"
import {
  type ReactNode,
  createContext,
  useContext,
  useEffect,
  useState,
} from "react"
export type Platform = "web" | "mobile"
export function readPlatform(value: string | null): Platform {
  return value === "mobile" ? "mobile" : "web"
}
const Context = createContext<{
  platform: Platform
  picked: boolean
  pick: (platform: Platform) => void
}>({ platform: "web", picked: false, pick: () => {} })
export function PlatformProvider({ children }: { children: ReactNode }) {
  const [platform, setPlatform] = useState<Platform>("web")
  const [picked, setPicked] = useState(false)
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem("ewatrade-launch-platform")
      if (saved === "web" || saved === "mobile") {
        setPlatform(saved)
        setPicked(true)
      }
    } catch {}
  }, [])
  const pick = (value: Platform) => {
    setPlatform(value)
    setPicked(true)
    try {
      sessionStorage.setItem("ewatrade-launch-platform", value)
    } catch {}
  }
  return (
    <Context.Provider value={{ platform, picked, pick }}>
      {children}
    </Context.Provider>
  )
}
export const usePlatform = () => useContext(Context)
export function PlatformSwitch({
  current,
  label = "Show the product on",
}: { current?: Platform; label?: string }) {
  const { platform, pick } = usePlatform()
  const selected = current ?? platform
  return (
    <fieldset className="b-switch" aria-label={label} data-on={selected}>
      {(["web", "mobile"] as const).map((value) => (
        <button
          key={value}
          type="button"
          aria-pressed={selected === value}
          onClick={() => pick(value)}
          onKeyDown={(event) => {
            if (
              ![
                "ArrowLeft",
                "ArrowRight",
                "ArrowUp",
                "ArrowDown",
                "Home",
                "End",
              ].includes(event.key)
            )
              return
            event.preventDefault()
            const next =
              event.key === "Home"
                ? "web"
                : event.key === "End"
                  ? "mobile"
                  : value === "web"
                    ? "mobile"
                    : "web"
            pick(next)
            const buttons =
              event.currentTarget.parentElement?.querySelectorAll("button")
            buttons?.[next === "web" ? 0 : 1]?.focus()
          }}
        >
          <span>{value === "web" ? "Web" : "Mobile"}</span>
          {value === "mobile" && <small className="b-soon">Coming soon</small>}
        </button>
      ))}
    </fieldset>
  )
}
