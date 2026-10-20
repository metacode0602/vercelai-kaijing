import { SidebarInset, SidebarProvider } from "@workspace/ui/components/sidebar"
import { SiteHeader } from "@/components/site-header"
import { AppSidebar } from "@/components/app-sidebar"
import { auth } from "@/lib/auth"
import { normalizeAppRole } from "@/lib/auth/app-role"
import { SIDEBAR_GROUP_COOKIE_NAME } from "@/lib/navigation/menu-config"
import { cookies, headers } from "next/headers"

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const requestHeaders = await headers()
  const session = await auth.api.getSession({
    headers: requestHeaders,
  })
  const sidebarUser =
    session?.user != null
      ? {
          name: session.user.name ?? "",
          email: session.user.email ?? "",
          image: session.user.image ?? null,
        }
      : null
  const role = normalizeAppRole(
    (session?.user as { role?: string } | undefined)?.role,
  )
  const cookieStore = await cookies()
  const defaultGroupKey = cookieStore.get(SIDEBAR_GROUP_COOKIE_NAME)?.value ?? null

  return (
    <SidebarProvider
      className="h-svh overflow-hidden"
      style={
        {
          "--sidebar-width": "calc(var(--spacing) * 56)",
          "--header-height": "calc(var(--spacing) * 12)",
        } as React.CSSProperties
      }
    >
      <AppSidebar
        variant="inset"
        user={sidebarUser}
        role={role ?? undefined}
        defaultGroupKey={defaultGroupKey}
      />
      <SidebarInset className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <SiteHeader />
        <div
          data-ui-scroll-container
          className="flex min-h-0 flex-1 flex-col"
        >
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
