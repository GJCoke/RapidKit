import { useDeferredValue, useEffect, useMemo, useState } from "react"
import { SearchIcon } from "lucide-react"
import { useNavigate } from "react-router"
import { useTranslation } from "react-i18next"
import { Button } from "@rapidkit/ui/components/button"
import { useRouteStore } from "@/stores/route"
import { buildRouteSearchIndex, searchRoutes } from "./search-model"
import { GlobalSearchDialog } from "./global-search-dialog"

export function GlobalSearch() {
  const { i18n, t } = useTranslation()
  const navigate = useNavigate()
  const revision = useRouteStore((state) => state.revision)
  const snapshot = useRouteStore((state) => state.snapshot)
  const [open, setOpen] = useState(false)
  const [keyword, setKeyword] = useState("")
  const deferredKeyword = useDeferredValue(keyword)
  const index = useMemo(() => buildRouteSearchIndex(snapshot, t), [i18n.language, revision, snapshot, t])
  const routes = useMemo(() => searchRoutes(index, deferredKeyword), [deferredKeyword, index])
  const title = t("layout.globalSearch.title")
  const placeholder = t("layout.globalSearch.placeholder")

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen)
    if (!nextOpen) setKeyword("")
  }

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault()
        setOpen(true)
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [])

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => handleOpenChange(true)}>
        <SearchIcon data-icon="inline-start" aria-hidden="true" />
        {title}
      </Button>
      <GlobalSearchDialog
        open={open}
        keyword={keyword}
        routes={routes}
        onKeywordChange={setKeyword}
        onOpenChange={handleOpenChange}
        onSelectRoute={(route) => {
          handleOpenChange(false)
          navigate(route.path)
        }}
        title={title}
        placeholder={placeholder}
        empty={t("layout.globalSearch.empty")}
      />
    </>
  )
}
