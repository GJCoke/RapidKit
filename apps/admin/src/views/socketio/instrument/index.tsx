import { useEffect, useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useTranslation } from "react-i18next"
import {
  Button,
  Input,
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
import { useSocketInstrument } from "@/services/hooks/use-socket-instrument"
import { PageHeader } from "@/features/layout/components/page-header"
import { EmptyState } from "@/features/layout/components/states/empty-state"
import { FormField } from "@/shared/crud/form-field"
import {
  instrumentConnectionSchema,
  buildInstrumentConnection,
  aggregateInstrumentServers,
  type InstrumentConnectionInput,
} from "./modules/instrument-model"
import { InstrumentDistribution, InstrumentCharts } from "./modules/instrument-charts"
import { InstrumentClients, type InstrumentClientPanel } from "./modules/instrument-clients"
function eventArgs(value: unknown) {
  try {
    return JSON.stringify(value, null, 2) ?? String(value)
  } catch {
    return String(value)
  }
}
function InstrumentWorkbench() {
  const { t, i18n } = useTranslation(),
    instrument = useSocketInstrument(),
    [advanced, setAdvanced] = useState(false),
    [panel, setPanel] = useState<InstrumentClientPanel | null>(null)
  const form = useForm<InstrumentConnectionInput>({
    resolver: zodResolver(instrumentConnectionSchema),
    defaultValues: {
      url: new URL(import.meta.env.VITE_SERVICE_BASE_URL || "/", window.location.origin).origin,
      path: "/socket.io",
      namespace: "/admin",
      username: "admin",
      password: "123456",
    },
  })
  useEffect(() => {
    if (instrument.status === "online") setAdvanced(false)
  }, [instrument.status])
  const summary = aggregateInstrumentServers(instrument.data.servers),
    servers = [...instrument.data.servers.values()],
    errors = form.formState.errors,
    online = instrument.status === "online"
  const onlineServers = servers.filter((server) => instrument.now - server.lastUpdate < 10000).length
  return (
    <div className="grid min-w-0 gap-4">
      <PageHeader title={t("socketInstrument.title")} description={t("socketInstrument.description")} />
      <Card className="min-w-0">
        <CardHeader>
          <CardTitle>{t("socketInstrument.connectionTitle")}</CardTitle>
          <CardDescription role="status">{t(`socketInstrument.status.${instrument.status}`)}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={form.handleSubmit((values) => instrument.connect(buildInstrumentConnection(values)))}>
            <FieldGroup className="md:grid-cols-3">
              <FormField
                label={t("socketInstrument.url")}
                htmlFor="instrument-url"
                error={errors.url?.message ? t(errors.url.message) : undefined}
              >
                <Input id="instrument-url" {...form.register("url")} aria-invalid={Boolean(errors.url)} />
              </FormField>
              <FormField
                label={t("socketInstrument.path")}
                htmlFor="instrument-path"
                error={errors.path?.message ? t(errors.path.message) : undefined}
              >
                <Input id="instrument-path" {...form.register("path")} aria-invalid={Boolean(errors.path)} />
              </FormField>
              <div className="flex flex-wrap items-end gap-2">
                {!online && (
                  <Button type="submit" disabled={instrument.status === "connecting"}>
                    {t(
                      instrument.status === "connecting"
                        ? "socketInstrument.status.connecting"
                        : "socketInstrument.connect",
                    )}
                  </Button>
                )}
                {instrument.hasConnection && (
                  <Button type="button" variant="outline" onClick={instrument.disconnect}>
                    {t("socketInstrument.disconnect")}
                  </Button>
                )}
              </div>
            </FieldGroup>
            <Collapsible open={advanced} onOpenChange={setAdvanced} className="mt-4">
              <CollapsibleTrigger render={<Button type="button" variant="ghost" size="sm" />}>
                {t("socketInstrument.advanced")}
              </CollapsibleTrigger>
              <CollapsibleContent>
                <FieldGroup className="mt-4 sm:grid-cols-2">
                  <FormField
                    label={t("socketInstrument.namespace")}
                    htmlFor="instrument-namespace"
                    description={t("socketInstrument.tip")}
                  >
                    <Input id="instrument-namespace" {...form.register("namespace")} />
                  </FormField>
                  <FormField label={t("socketInstrument.username")} htmlFor="instrument-username">
                    <Input id="instrument-username" autoComplete="username" {...form.register("username")} />
                  </FormField>
                  <FormField label={t("socketInstrument.password")} htmlFor="instrument-password">
                    <Input
                      id="instrument-password"
                      type="password"
                      autoComplete="current-password"
                      {...form.register("password")}
                    />
                  </FormField>
                </FieldGroup>
              </CollapsibleContent>
            </Collapsible>
          </form>
          {instrument.error && (
            <Alert variant="destructive" className="mt-4">
              <AlertDescription>{t("socketInstrument.authFailed", { message: instrument.error })}</AlertDescription>
            </Alert>
          )}
          {instrument.notice && (
            <p role="status" className="mt-3 break-all text-sm text-muted-foreground">
              {t(`socketInstrument.${instrument.notice.key}`, {
                value: "value" in instrument.notice ? instrument.notice.value : "",
              })}
            </p>
          )}
        </CardContent>
      </Card>
      <div className="grid min-w-0 gap-4 xl:grid-cols-3">
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle>{t("socketInstrument.clientDistribution")}</CardTitle>
            <CardDescription>
              {t("socketInstrument.totalClients")}:{" "}
              <strong className="font-mono text-foreground">{summary.total}</strong>
            </CardDescription>
            <Button variant="outline" size="sm" onClick={() => setPanel({ type: "history" })}>
              {t("socketInstrument.connectionHistory")}
            </Button>
          </CardHeader>
          <CardContent>
            <InstrumentDistribution polling={summary.polling} websocket={summary.websocket} />
          </CardContent>
        </Card>
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle>{t("socketInstrument.namespaces")}</CardTitle>
          </CardHeader>
          <CardContent className="min-w-0">
            {summary.namespaces.length ? (
              <ScrollArea className="h-60">
                <div className="grid gap-2 pr-3">
                  {summary.namespaces.map((namespace) => (
                    <Button
                      key={namespace.name}
                      variant="outline"
                      className="h-auto min-w-0 justify-between gap-3 p-3"
                      aria-label={t("socketInstrument.viewNamespace", { namespace: namespace.name })}
                      onClick={() => setPanel({ type: "namespace", name: namespace.name })}
                    >
                      <span className="min-w-0 break-all whitespace-normal font-mono">{namespace.name}</span>
                      <Badge variant="secondary">{namespace.socketsCount}</Badge>
                    </Button>
                  ))}
                </div>
              </ScrollArea>
            ) : (
              <EmptyState message={t("socketInstrument.noNamespaces")} />
            )}
          </CardContent>
        </Card>
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle>{t("socketInstrument.serverInfo")}</CardTitle>
            <CardDescription>
              {onlineServers} {t("socketInstrument.status.online")}
            </CardDescription>
          </CardHeader>
          <CardContent className="min-w-0">
            {online && servers.length ? (
              <ScrollArea className="h-60">
                <ul className="grid gap-3 pr-3">
                  {servers.map((server) => {
                    const fresh = instrument.now - server.lastUpdate < 10000
                    return (
                      <li key={server.serverId} className="grid min-w-0 gap-2 rounded-md border p-3">
                        <p className="break-all font-medium">{server.hostname}</p>
                        <p className="break-all text-xs text-muted-foreground">
                          {t("socketInstrument.pid")}: {server.pid} ·{" "}
                          {t(fresh ? "socketInstrument.status.online" : "socketInstrument.status.offline")}
                        </p>
                        <p className="text-xs">
                          {t("socketInstrument.uptime")}:{" "}
                          {t("socketInstrument.formatUptime", {
                            h: Math.floor(server.uptime / 3600),
                            m: Math.floor((server.uptime % 3600) / 60),
                            s: Math.floor(server.uptime % 60),
                          })}
                        </p>
                        {!fresh && (
                          <Button
                            variant="outline"
                            size="sm"
                            aria-label={t("socketInstrument.removeServer", { hostname: server.hostname })}
                            onClick={() => instrument.removeServer(server.serverId)}
                          >
                            {t("socketInstrument.remove")}
                          </Button>
                        )}
                      </li>
                    )
                  })}
                </ul>
              </ScrollArea>
            ) : (
              <EmptyState message={t(online ? "socketInstrument.noServers" : "socketInstrument.status.offline")} />
            )}
          </CardContent>
        </Card>
      </div>
      <Card className="min-w-0">
        <CardHeader>
          <CardTitle>{t("socketInstrument.eventMessages")}</CardTitle>
          <CardDescription>
            {instrument.data.messages.length} {t("socketInstrument.events")}
          </CardDescription>
        </CardHeader>
        <CardContent className="min-w-0">
          {instrument.data.messages.length ? (
            <ScrollArea className="h-96">
              <ol className="grid min-w-0 gap-3 pr-3">
                {instrument.data.messages.map((event) => (
                  <li key={event.id} className="min-w-0 rounded-md border p-3">
                    <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
                      <Badge variant={event.type === "R" ? "secondary" : "outline"}>
                        {t(event.type === "R" ? "socketInstrument.received" : "socketInstrument.sent")}
                      </Badge>
                      <time dateTime={event.time}>
                        {Number.isFinite(Date.parse(event.time))
                          ? new Date(event.time).toLocaleTimeString(i18n.language)
                          : event.time}
                      </time>
                      <span className="min-w-0 break-all font-mono">{event.event}</span>
                    </div>
                    <p className="mb-2 break-all font-mono text-xs text-muted-foreground">
                      {event.nsp} · {event.sid}
                    </p>
                    <pre className="whitespace-pre-wrap break-all rounded bg-muted p-2 font-mono text-xs">
                      {eventArgs(event.args)}
                    </pre>
                  </li>
                ))}
              </ol>
            </ScrollArea>
          ) : (
            <EmptyState message={t("socketInstrument.noCaptured")} />
          )}
        </CardContent>
      </Card>
      <InstrumentCharts data={instrument.data} now={instrument.now} />
      <InstrumentClients
        key={panel?.type === "namespace" ? panel.name : "history"}
        panel={panel}
        onClose={() => setPanel(null)}
        clients={instrument.data.clients}
        history={instrument.data.history}
        connected={online}
        onKick={instrument.kickClient}
      />
    </div>
  )
}
export default function InstrumentPage() {
  useAuthStore((state) => state.token)
  const read = usePermission("socketio:read"),
    { t } = useTranslation()
  return read ? (
    <InstrumentWorkbench key={getAuthSession()} />
  ) : (
    <Alert variant="destructive">
      <AlertDescription>{t("error.403")}</AlertDescription>
    </Alert>
  )
}
