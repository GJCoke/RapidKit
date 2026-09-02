import { QueryClientProvider } from "@tanstack/react-query"
import { I18nextProvider } from "react-i18next"
import { TooltipProvider } from "@rapidkit/ui/components/tooltip"
import { queryClient } from "@/services/query-client"
import { ThemeProvider } from "@/features/theme"
import i18n from "@/locales"

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={i18n}>
        <ThemeProvider>
          <TooltipProvider delayDuration={0}>{children}</TooltipProvider>
        </ThemeProvider>
      </I18nextProvider>
    </QueryClientProvider>
  )
}
