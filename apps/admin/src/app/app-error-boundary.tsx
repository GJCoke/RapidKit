import { Component, type ReactNode } from "react"
import { Alert, AlertDescription, AlertTitle } from "@rapidkit/ui/components/alert"
import { Button } from "@rapidkit/ui/components/button"
import { copyRequestId } from "@rapidkit/utils"
import i18n from "@/locales"
import { captureBrowserError } from "@/observability"

export class AppErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean; eventId?: string }> {
  state: { failed: boolean; eventId?: string } = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: Error) {
    this.setState({ eventId: captureBrowserError(error, "render") })
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <main className="mx-auto flex min-h-screen max-w-xl items-center p-6">
        <Alert variant="destructive">
          <AlertTitle>{i18n.t("error.routeTitle")}</AlertTitle>
          <AlertDescription>{i18n.t("error.routeDescription")}</AlertDescription>
          {this.state.eventId && (
            <>
              <code className="select-all">{this.state.eventId}</code>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  void copyRequestId(this.state.eventId)
                }}
              >
                {i18n.t("request.copyRequestId")}
              </Button>
            </>
          )}
        </Alert>
      </main>
    )
  }
}
