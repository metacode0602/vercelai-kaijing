"use client"

export function Topbar({ title }: { title: string }) {
  return (
    <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center border-b border-border bg-background/80 px-5 backdrop-blur">
      <h1 className="text-base font-semibold tracking-tight text-balance">{title}</h1>
    </header>
  )
}
