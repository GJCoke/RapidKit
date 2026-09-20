import { useState } from "react"
import { Clipboard, EyeOff, Palette, RotateCcw } from "lucide-react"
import { useTranslation } from "react-i18next"
import { Button } from "@rapidkit/ui/components/button"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@rapidkit/ui/components/sheet"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@rapidkit/ui/components/tabs"
import { Alert, AlertDescription, AlertTitle } from "@rapidkit/ui/components/alert"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@rapidkit/ui/components/alert-dialog"
import { useThemeWorkbenchStore } from "@/stores/theme-workbench"
import { useAppStore } from "@/stores/app"
import { formatThemeConfigAsJson, formatThemeConfigAsTypeScript } from "../theme-output"
import { defaultThemeConfig } from "../theme-config"
import { isStructuralThemeChange } from "../theme-workbench"
import { ColorsNavigationPanel } from "./colors-navigation-panel"
import { DesignSystemPanel } from "./design-system-panel"
import { ExperiencePanel } from "./experience-panel"
import { LayoutPanel } from "./layout-panel"

export function ThemeWorkbench({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t } = useTranslation()
  const [format, setFormat] = useState<"typescript" | "json">("typescript")
  const [copyError, setCopyError] = useState(false)
  const { draft, previewActive, setPreviewActive, resetDraft } = useThemeWorkbenchStore()
  const activeTab = useAppStore((state) => state.themeWorkbenchTab)
  const setActiveTab = useAppStore((state) => state.setThemeWorkbenchTab)
  const output = format === "typescript" ? formatThemeConfigAsTypeScript(draft) : formatThemeConfigAsJson(draft)
  const panels = [
    ["design", t("theme.workbench.design")],
    ["colors", t("theme.workbench.colors")],
    ["layout", t("theme.workbench.layout")],
    ["experience", t("theme.workbench.experience")],
  ] as const
  const copyOutput = async () => {
    try {
      await navigator.clipboard.writeText(output)
      setCopyError(false)
    } catch {
      setCopyError(true)
    }
  }
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full data-[side=right]:sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{t("theme.workbench.title")}</SheetTitle>
          <SheetDescription>{t("theme.workbench.description")}</SheetDescription>
        </SheetHeader>
        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value)} className="min-h-0 flex-1 px-4">
          <TabsList className="grid h-auto w-full shrink-0 grid-cols-4">
            {panels.map(([value, label]) => (
              <TabsTrigger key={value} value={value}>
                {label}
              </TabsTrigger>
            ))}
          </TabsList>
          <div data-slot="theme-workbench-panel-scroll" className="mt-3 min-h-0 flex-1 overflow-y-auto">
            <TabsContent value="design" className="min-h-full">
              <DesignSystemPanel />
            </TabsContent>
            <TabsContent value="colors" className="min-h-full">
              <ColorsNavigationPanel />
            </TabsContent>
            <TabsContent value="layout" className="min-h-full">
              <LayoutPanel />
            </TabsContent>
            <TabsContent value="experience" className="min-h-full">
              <ExperiencePanel />
            </TabsContent>
          </div>
        </Tabs>
        <div className="shrink-0 px-4 pb-4">
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setPreviewActive(!previewActive)}>
              <EyeOff data-icon="inline-start" />
              {previewActive ? t("theme.workbench.stopPreview") : t("theme.workbench.startPreview")}
            </Button>
            <AlertDialog>
              <AlertDialogTrigger render={<Button variant="outline" />}>
                <RotateCcw data-icon="inline-start" />
                {t("theme.workbench.resetDraft")}
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{t("theme.workbench.resetTitle")}</AlertDialogTitle>
                  <AlertDialogDescription>{t("theme.workbench.resetDescription")}</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel render={<Button variant="outline" />}>{t("common.cancel")}</AlertDialogCancel>
                  <AlertDialogAction render={<Button onClick={resetDraft} />}>
                    {t("theme.workbench.confirmReset")}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            <Button variant="outline" onClick={() => setFormat(format === "typescript" ? "json" : "typescript")}>
              {format === "typescript" ? t("theme.workbench.showJson") : t("theme.workbench.showTypeScript")}
            </Button>
            <Button onClick={() => void copyOutput()}>
              <Clipboard data-icon="inline-start" />
              {t("theme.workbench.copyConfig")}
            </Button>
          </div>
          {isStructuralThemeChange(draft, defaultThemeConfig) && (
            <Alert className="mt-3">
              <AlertTitle>{t("theme.workbench.structuralChangeTitle")}</AlertTitle>
              <AlertDescription>{t("theme.workbench.structuralChangeDescription")}</AlertDescription>
            </Alert>
          )}
          {copyError && (
            <Alert variant="destructive" className="mt-3">
              <AlertTitle>{t("theme.workbench.copyFailedTitle")}</AlertTitle>
              <AlertDescription>{t("theme.workbench.copyFailedDescription")}</AlertDescription>
            </Alert>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}

export function ThemeWorkbenchTrigger() {
  const { t } = useTranslation()
  const open = useAppStore((state) => state.themeWorkbenchOpen)
  const setOpen = useAppStore((state) => state.setThemeWorkbenchOpen)

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={t("theme.workbench.trigger")}
        onClick={() => setOpen(true)}
      >
        <Palette aria-hidden="true" />
      </Button>
      <ThemeWorkbench open={open} onOpenChange={setOpen} />
    </>
  )
}
