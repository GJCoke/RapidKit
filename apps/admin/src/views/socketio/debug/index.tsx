import { useEffect, useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { useTranslation } from "react-i18next"
import {
  Button,
  Input,
  Textarea,
  Badge,
  FieldGroup,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  ScrollArea,
} from "@rapidkit/ui"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@rapidkit/ui/components/collapsible"
import { Alert, AlertDescription } from "@rapidkit/ui/components/alert"
import { usePermission } from "@/features/auth"
import { useAuthStore } from "@/stores/auth"
import { getAuthSession } from "@/services/auth-session"
import { useSocketDebug } from "@/services/hooks/use-socket-debug"
import { PageHeader } from "@/features/layout/components/page-header"
import { EmptyState } from "@/features/layout/components/states/empty-state"
import { FormField } from "@/shared/crud/form-field"
import {
  debugConnectionSchema,
  debugConnectionInputSchema,
  parseDebugPayload,
  formatDebugData,
  type DebugConnectionInput,
} from "./modules/debug-model"
const emitSchema = z.object({
  event: z
    .string()
    .min(1, "socketDebug.requiredEvent")
    .refine((value) => Boolean(value.trim()), "socketDebug.requiredEvent"),
  data: z.string().refine((value) => parseDebugPayload(value).success, "socketDebug.invalidJson"),
})
function DebugWorkbench() {
  const { t, i18n } = useTranslation()
  const debug = useSocketDebug()
  const [advanced, setAdvanced] = useState(false)
  const connection = useForm<DebugConnectionInput>({
    resolver: zodResolver(debugConnectionInputSchema),
    defaultValues: {
      url: new URL(import.meta.env.VITE_SERVICE_BASE_URL || "/", window.location.origin).origin,
      path: "/socket.io",
      namespace: "/",
      auth: JSON.stringify({ access_token: useAuthStore.getState().token }, null, 2),
    },
  })
  const emit = useForm<z.infer<typeof emitSchema>>({
    resolver: zodResolver(emitSchema),
    defaultValues: { event: "message", data: '{"msg": "hello"}' },
  })
  useEffect(() => {
    if (debug.status === "online") setAdvanced(false)
  }, [debug.status])
  const errors = connection.formState.errors,
    emitErrors = emit.formState.errors
  const error = (key?: string) => (key ? t(key) : undefined)
  return (
    <div className="grid min-w-0 gap-4">
      <PageHeader title={t("socketDebug.title")} description={t("socketDebug.description")} />
      <Card className="min-w-0">
        <CardHeader>
          <CardTitle>{t("socketDebug.connectionTitle")}</CardTitle>
          <CardDescription role="status">{t(`socketDebug.status.${debug.status}`)}</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={connection.handleSubmit(
              (values) => debug.connect(debugConnectionSchema.parse(values)),
              (invalid) => {
                if (invalid.auth || invalid.namespace) setAdvanced(true)
              },
            )}
          >
            <FieldGroup className="md:grid-cols-3">
              <FormField label={t("socketDebug.url")} htmlFor="debug-url" error={error(errors.url?.message)}>
                <Input id="debug-url" {...connection.register("url")} aria-invalid={Boolean(errors.url)} />
              </FormField>
              <FormField label={t("socketDebug.path")} htmlFor="debug-path" error={error(errors.path?.message)}>
                <Input id="debug-path" {...connection.register("path")} aria-invalid={Boolean(errors.path)} />
              </FormField>
              <div className="flex flex-wrap items-end gap-2">
                {debug.status !== "online" && (
                  <Button type="submit" disabled={debug.status === "connecting"}>
                    {t(debug.status === "connecting" ? "socketDebug.status.connecting" : "socketDebug.connect")}
                  </Button>
                )}
                {debug.status !== "offline" && (
                  <Button type="button" variant="outline" onClick={debug.disconnect}>
                    {t("socketDebug.disconnect")}
                  </Button>
                )}
              </div>
            </FieldGroup>
            <Collapsible open={advanced} onOpenChange={setAdvanced} className="mt-4">
              <CollapsibleTrigger render={<Button type="button" variant="ghost" size="sm" />}>
                {t("socketDebug.advanced")}
              </CollapsibleTrigger>
              <CollapsibleContent>
                <FieldGroup className="mt-4">
                  <FormField
                    label={t("socketDebug.namespace")}
                    htmlFor="debug-namespace"
                    error={error(errors.namespace?.message)}
                  >
                    <Input
                      id="debug-namespace"
                      {...connection.register("namespace")}
                      aria-invalid={Boolean(errors.namespace)}
                    />
                  </FormField>
                  <FormField label={t("socketDebug.auth")} htmlFor="debug-auth" error={error(errors.auth?.message)}>
                    <Textarea
                      id="debug-auth"
                      {...connection.register("auth")}
                      aria-invalid={Boolean(errors.auth)}
                      className="min-h-24 font-mono text-xs"
                    />
                  </FormField>
                </FieldGroup>
              </CollapsibleContent>
            </Collapsible>
          </form>
        </CardContent>
      </Card>
      <div className="grid min-w-0 gap-4 lg:grid-cols-3">
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle>{t("socketDebug.emitTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={emit.handleSubmit(({ event, data }) => {
                const payload = parseDebugPayload(data)
                if (payload.success) debug.send(event, payload.data)
              })}
            >
              <FieldGroup>
                <FormField
                  label={t("socketDebug.eventName")}
                  htmlFor="debug-event"
                  error={error(emitErrors.event?.message)}
                >
                  <Input id="debug-event" {...emit.register("event")} aria-invalid={Boolean(emitErrors.event)} />
                </FormField>
                <FormField
                  label={t("socketDebug.dataJson")}
                  htmlFor="debug-data"
                  error={error(emitErrors.data?.message)}
                >
                  <Textarea
                    id="debug-data"
                    {...emit.register("data")}
                    aria-invalid={Boolean(emitErrors.data)}
                    className="min-h-48 font-mono text-xs"
                  />
                </FormField>
                <Button type="submit" disabled={debug.status !== "online"}>
                  {t("socketDebug.sendEvent")}
                </Button>
              </FieldGroup>
            </form>
          </CardContent>
        </Card>
        <Card className="min-w-0 lg:col-span-2">
          <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
            <CardTitle>{t("socketDebug.logsTitle")}</CardTitle>
            <Button size="sm" variant="ghost" onClick={debug.clearLogs}>
              {t("socketDebug.clear")}
            </Button>
          </CardHeader>
          <CardContent className="min-w-0">
            {debug.logs.length === 0 ? (
              <EmptyState message={t("socketDebug.noMessages")} />
            ) : (
              <ScrollArea className="h-96" aria-label={t("socketDebug.logsTitle")}>
                <ol className="grid min-w-0 gap-3 pr-3">
                  {debug.logs.map((log) => (
                    <li key={log.id} className="min-w-0 rounded-lg border p-3">
                      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
                        <Badge
                          variant={log.type === "error" ? "destructive" : log.type === "send" ? "outline" : "secondary"}
                        >
                          {t(`socketDebug.logType.${log.type}`)}
                        </Badge>
                        <time dateTime={new Date(log.time).toISOString()} className="text-muted-foreground">
                          {new Date(log.time).toLocaleTimeString(i18n.language)}
                        </time>
                        {log.event && <span className="min-w-0 break-all font-mono">{log.event}</span>}
                      </div>
                      <pre className="whitespace-pre-wrap break-all rounded bg-muted p-2 font-mono text-xs">
                        {log.message
                          ? t(`socketDebug.${log.message.key}`, { value: log.message.value })
                          : formatDebugData(log.data)}
                      </pre>
                    </li>
                  ))}
                </ol>
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
export default function SocketDebugPage() {
  useAuthStore((state) => state.token)
  const read = usePermission("socketio:read"),
    { t } = useTranslation()
  return read ? (
    <DebugWorkbench key={getAuthSession()} />
  ) : (
    <Alert variant="destructive">
      <AlertDescription>{t("error.403")}</AlertDescription>
    </Alert>
  )
}
