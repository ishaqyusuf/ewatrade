"use client"

import { Button } from "@ewatrade/ui"
import {
  type ReactNode,
  createContext,
  useContext,
  useEffect,
  useState,
} from "react"

const Context = createContext({ dark: false, toggle: () => {} })
const storageKey = "ewatrade.catalog.appearance"

/** Catalog-only preference. Portalled sheets share the context and token class. */
export function CatalogAppearance({ children }: { children: ReactNode }) {
  const [dark, setDark] = useState(false)
  useEffect(() => {
    try {
      setDark(localStorage.getItem(storageKey) === "dark")
    } catch {}
  }, [])
  const toggle = () =>
    setDark((current) => {
      const next = !current
      try {
        localStorage.setItem(storageKey, next ? "dark" : "light")
      } catch {}
      return next
    })
  return (
    <Context.Provider value={{ dark, toggle }}>
      <div
        className={`catalog-theme ${dark ? "catalog-theme-dark" : ""} flex min-h-0 flex-1 flex-col bg-background text-foreground`}
      >
        {children}
      </div>
    </Context.Provider>
  )
}

export function useCatalogThemeClass() {
  return `catalog-theme ${useContext(Context).dark ? "catalog-theme-dark" : ""}`
}

export function CatalogAppearanceToggle() {
  const { dark, toggle } = useContext(Context)
  return (
    <Button
      type="button"
      appearance="form"
      variant="outline"
      aria-label={`Use ${dark ? "Light" : "Dark"} Catalog appearance`}
      onClick={toggle}
    >
      {dark ? "Light mode" : "Dark mode"}
    </Button>
  )
}
