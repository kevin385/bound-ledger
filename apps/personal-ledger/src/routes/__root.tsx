import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRouteWithContext,
  useRouterState,
} from "@tanstack/react-router"

import { AppShell } from "@astryxdesign/core/AppShell"
import {
  SideNav,
  SideNavHeading,
  SideNavItem,
  SideNavSection,
} from "@astryxdesign/core/SideNav"
import { Theme } from "@astryxdesign/core/theme"
import { neutralTheme } from "@astryxdesign/theme-neutral/built"

import type { RouterContext } from "../router"

import "@astryxdesign/core/reset.css"
import "@astryxdesign/core/astryx.css"
import "@astryxdesign/theme-neutral/theme.css"

export const Route = createRootRouteWithContext<RouterContext>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Bound Ledger" },
      {
        name: "description",
        content: "A capability-governed personal ledger workspace",
      },
    ],
  }),
  component: RootComponent,
})

function Navigation() {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })

  return (
    <SideNav
      header={
        <SideNavHeading
          heading="Bound Ledger"
          superheading="Personal workspace"
          subheading="USD · July 2026"
          headingHref="/"
        />
      }
      collapsible
    >
      <SideNavSection title="Ledger" isHeaderHidden>
        <SideNavItem label="Dashboard" href="/" isSelected={pathname === "/"} />
        <SideNavItem
          label="Event journal"
          href="/journal"
          isSelected={pathname.startsWith("/journal")}
        />
        <SideNavItem
          label="Review"
          href="/review"
          isSelected={pathname === "/review"}
        />
      </SideNavSection>
      <SideNavSection title="Research">
        <SideNavItem
          label="Mode comparison"
          href="/comparison"
          isSelected={pathname === "/comparison"}
        />
      </SideNavSection>
    </SideNav>
  )
}

function RootComponent() {
  return (
    <RootDocument>
      <Theme theme={neutralTheme}>
        <AppShell
          height="auto"
          variant="section"
          contentPadding={0}
          sideNav={<Navigation />}
        >
          <Outlet />
        </AppShell>
      </Theme>
    </RootDocument>
  )
}

function RootDocument({ children }: { readonly children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  )
}
