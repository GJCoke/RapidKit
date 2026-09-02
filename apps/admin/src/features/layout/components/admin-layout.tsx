import { Outlet } from "react-router"
import { useAppStore } from "@/stores/app"
import { Header } from "./header"
import { Sidebar } from "./sidebar"
import { MobileNav } from "./mobile-nav"
import { PageTabs } from "./page-tabs"
import { PageContainer } from "./page-container"
import { useMobileWatch } from "./use-mobile-watch"

export function AdminLayout() {
  useMobileWatch()
  const { siderCollapse, isMobile } = useAppStore()
  const siderWidth = isMobile ? 0 : siderCollapse ? "var(--sidebar-width-collapsed)" : "var(--sidebar-width)"

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {isMobile ? <MobileNav /> : <Sidebar />}
      <div
        className="flex flex-1 flex-col overflow-hidden transition-[margin] duration-300"
        style={{ marginLeft: siderWidth }}
      >
        <Header />
        <PageTabs />
        <main className="flex-1 overflow-auto">
          <PageContainer>
            <Outlet />
          </PageContainer>
        </main>
      </div>
    </div>
  )
}
