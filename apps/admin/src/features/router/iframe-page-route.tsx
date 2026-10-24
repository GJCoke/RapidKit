import { useLocation } from "react-router"
import { useTranslation } from "react-i18next"
import { IframeRoute } from "./iframe-route"

export function IframePageRoute({
  src,
  title,
  i18nKey,
  pathPattern = "/iframe-page/:url",
}: {
  src?: string
  title?: string
  i18nKey?: string
  pathPattern?: string
}) {
  const { pathname } = useLocation()
  const { t } = useTranslation()
  const urlIndex = pathPattern.split("/").indexOf(":url")
  let source = src
  if (urlIndex >= 0) {
    // Read the raw path: React Router also replaces encoded slashes inside decoded params.
    try {
      source = decodeURIComponent(pathname.split("/")[urlIndex] ?? "")
    } catch {
      source = undefined
    }
  }
  return <IframeRoute src={source} title={i18nKey ? t(i18nKey) : (title ?? t("route.iframe-page"))} />
}
