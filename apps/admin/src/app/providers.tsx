import { QueryClientProvider } from "@tanstack/react-query"
import { I18nextProvider } from "react-i18next"
import { queryClient } from "@/services/query-client"
import { ThemeProvider } from "@/features/theme"
import i18n from "@/locales"

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={i18n}>
        <ThemeProvider>{children}</ThemeProvider>
      </I18nextProvider>
    </QueryClientProvider>
  )
}
