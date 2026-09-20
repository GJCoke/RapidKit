import type { ReactElement, ReactNode } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render } from "@testing-library/react"
import { I18nextProvider } from "react-i18next"
import { MemoryRouter } from "react-router"
import { TooltipProvider } from "@rapidkit/ui/components/tooltip"
import { ThemeProvider } from "@/features/theme"
import i18n from "@/locales"

interface RenderAdminOptions {
  initialEntries?: string[]
}

export function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
}

export function renderAdmin(ui: ReactElement, options: RenderAdminOptions = {}) {
  const queryClient = createTestQueryClient()

  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <I18nextProvider i18n={i18n}>
          <ThemeProvider>
            <TooltipProvider delay={0}>
              <MemoryRouter initialEntries={options.initialEntries}>{children}</MemoryRouter>
            </TooltipProvider>
          </ThemeProvider>
        </I18nextProvider>
      </QueryClientProvider>
    )
  }

  return { ...render(ui, { wrapper: Wrapper }), queryClient }
}
