import { Outlet } from "react-router"
import { useAppStore } from "@/stores/app"
import { Header } from "./header"
import { Sidebar } from "./sidebar"
import { TabBar } from "./tab-bar"

export function AdminLayout() {
  const { siderCollapse } = useAppStore()
  const siderWidth = siderCollapse ? 64 : 220

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div
        className="flex flex-1 flex-col overflow-hidden transition-all duration-300"
        style={{ marginLeft: `${siderWidth}px` }}
      >
        <Header />
        <TabBar />
        <main className="flex-1 overflow-auto p-4">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
