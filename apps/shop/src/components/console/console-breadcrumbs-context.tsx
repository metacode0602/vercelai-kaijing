'use client'

import * as React from 'react'
import type { ConsoleBreadcrumbItem } from '@/components/console/detail/console-breadcrumbs'

type ConsoleBreadcrumbsContextValue = {
  items: ConsoleBreadcrumbItem[] | null
  setItems: (items: ConsoleBreadcrumbItem[] | null) => void
}

const ConsoleBreadcrumbsContext = React.createContext<ConsoleBreadcrumbsContextValue | null>(null)

export function ConsoleBreadcrumbsProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = React.useState<ConsoleBreadcrumbItem[] | null>(null)
  const value = React.useMemo(() => ({ items, setItems }), [items])

  return (
    <ConsoleBreadcrumbsContext.Provider value={value}>{children}</ConsoleBreadcrumbsContext.Provider>
  )
}

/** Breadcrumb trail registered by the active detail page, rendered in the console topbar. */
export function useConsoleBreadcrumbTrail() {
  return React.useContext(ConsoleBreadcrumbsContext)?.items ?? null
}

/** Registers the breadcrumb trail for the current page. Clears on unmount. */
export function useConsoleBreadcrumbs(items: ConsoleBreadcrumbItem[] | null) {
  const context = React.useContext(ConsoleBreadcrumbsContext)
  const setItems = context?.setItems
  const signature = items ? JSON.stringify(items) : ''

  React.useEffect(() => {
    if (!setItems) return
    setItems(signature ? (JSON.parse(signature) as ConsoleBreadcrumbItem[]) : null)
    return () => setItems(null)
  }, [setItems, signature])
}

/** Renders nothing; registers the breadcrumb trail in the topbar. Works from server components. */
export function ConsoleBreadcrumbRegistration({ items }: { items: ConsoleBreadcrumbItem[] }) {
  useConsoleBreadcrumbs(items)
  return null
}
