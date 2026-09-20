import { toast } from "@rapidkit/ui/components/sonner"
import i18n from "@/locales"
import { createErrorNotifier } from "./error-notifier"
import { normalizeRequestError, type NormalizedRequestError } from "./request-error"

const notifier = createErrorNotifier({ notify: (message) => toast.error(message) })

function errorMessages() {
  return {
    network: i18n.t("request.networkError"),
    server: i18n.t("request.serverError"),
    unknown: i18n.t("request.unknownError"),
  }
}

export function notifyRequestError(error: unknown) {
  return notifier.show(normalizeRequestError(error, errorMessages()))
}

export function notifySessionExpired() {
  const error: NormalizedRequestError = {
    kind: "business",
    code: "SESSION_EXPIRED",
    message: i18n.t("request.sessionExpired"),
  }
  return notifier.show(error)
}
