import { QueryClientProvider } from "@tanstack/react-query"
import { I18nextProvider } from "react-i18next"
import { Toaster } from "@rapidkit/ui/components/sonner"
import { TooltipProvider } from "@rapidkit/ui/components/tooltip"
import { queryClient } from "@/services/query-client"
import { ThemeProvider } from "@/features/theme"
import { useThemeStore } from "@/stores/theme"
import i18n from "@/locales"
import { LocaleSync } from "@/features/locale/locale-sync"
import { SessionSync } from "@/features/auth/session-sync"
import { NotificationRuntime } from "@/features/notifications/notification-runtime"
import { ImpersonationBoundary } from "@/features/auth/impersonation-runtime"

function AppFeedback() {
  const colorScheme = useThemeStore((state) => state.colorScheme)
  return <Toaster theme={colorScheme === "auto" ? "system" : colorScheme} richColors position="top-right" />
}

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={i18n}>
        <LocaleSync />
        <ThemeProvider>
          <TooltipProvider delay={0}>
            <ImpersonationBoundary>
              <SessionSync />
              <NotificationRuntime />
              {children}
            </ImpersonationBoundary>
            <AppFeedback />
          </TooltipProvider>
        </ThemeProvider>
      </I18nextProvider>
    </QueryClientProvider>
  )
}
