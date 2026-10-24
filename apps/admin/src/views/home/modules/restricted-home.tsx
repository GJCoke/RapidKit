import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { Button } from "@rapidkit/ui"
import { Avatar, AvatarFallback, AvatarImage } from "@rapidkit/ui/components/avatar"
import { useHomeContacts } from "@/services/hooks/use-home-dashboard"
import { getAuthSession } from "@/services/auth-session"
import { HomeState } from "./home-card"
export function RestrictedHome() {
  const { t } = useTranslation(),
    query = useHomeContacts(),
    [expanded, setExpanded] = useState(false),
    [copying, setCopying] = useState(false)
  const [feedback, setFeedback] = useState<{ success: boolean; name: string } | null>(null)
  const session = useRef(getAuthSession()).current,
    mounted = useRef(false)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  const contacts = query.data ?? [],
    visible = expanded ? contacts : contacts.slice(0, 3)
  async function copy(name: string, email: string) {
    if (copying) return
    setCopying(true)
    try {
      await navigator.clipboard.writeText(email)
      if (mounted.current && getAuthSession() === session) setFeedback({ success: true, name })
    } catch {
      if (mounted.current && getAuthSession() === session) setFeedback({ success: false, name })
    } finally {
      if (mounted.current && getAuthSession() === session) setCopying(false)
    }
  }
  return (
    <div className="mx-auto max-w-4xl space-y-8 py-6">
      <header className="mx-auto max-w-2xl space-y-3 text-center">
        <h1 className="text-2xl font-semibold">{t("homeDashboard.permission.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("home.restricted")}</p>
      </header>
      <ol className="grid gap-5 rounded-xl border bg-card p-5 md:grid-cols-3">
        {(["contactAdmin", "configure", "refresh"] as const).map((key, index) => (
          <li key={key} className="flex gap-3">
            <span className="grid size-7 shrink-0 place-content-center rounded-full bg-primary text-sm text-primary-foreground">
              {index + 1}
            </span>
            <div>
              <h2 className="font-semibold">{t(`homeDashboard.permission.steps.${key}.title`)}</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                {t(`homeDashboard.permission.steps.${key}.description`)}
              </p>
            </div>
          </li>
        ))}
      </ol>
      <section className="space-y-3">
        <h2 className="font-semibold">{t("homeDashboard.permission.contactTitle")}</h2>
        <p className="text-sm text-muted-foreground">{t("homeDashboard.permission.contactDescription")}</p>
        <HomeState
          query={query}
          empty={contacts.length === 0}
          emptyLabel={t("homeDashboard.permission.contactsUnavailable")}
        >
          <ul className="divide-y rounded-xl border bg-card px-4">
            {visible.map((contact) => (
              <li key={contact.id} className="flex flex-wrap items-center gap-3 py-4">
                <Avatar>
                  {contact.avatar && <AvatarImage src={contact.avatar} alt="" />}
                  <AvatarFallback>{contact.name.slice(0, 1).toUpperCase()}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold">{contact.name}</h3>
                  <p className="break-all text-sm text-muted-foreground">{contact.email}</p>
                </div>
                <Button
                  variant="ghost"
                  disabled={copying}
                  aria-label={t("homeDashboard.permission.copyEmailFor", { name: contact.name })}
                  onClick={() => void copy(contact.name, contact.email)}
                >
                  {t("homeDashboard.permission.copyEmail")}
                </Button>
              </li>
            ))}
          </ul>
        </HomeState>
        {feedback && (
          <p
            role={feedback.success ? "status" : "alert"}
            className={feedback.success ? "text-sm text-success" : "text-sm text-destructive"}
          >
            {feedback.success
              ? t("homeDashboard.permission.copySuccess", { name: feedback.name })
              : t("homeDashboard.permission.copyFailed")}
          </p>
        )}
        {contacts.length > 3 && (
          <Button variant="link" onClick={() => setExpanded((value) => !value)}>
            {expanded
              ? t("homeDashboard.permission.collapse")
              : t("homeDashboard.permission.viewAll", { count: contacts.length })}
          </Button>
        )}
      </section>
    </div>
  )
}
