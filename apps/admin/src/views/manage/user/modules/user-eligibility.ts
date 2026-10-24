type Actor = { id: string; isAdmin: boolean } | null | undefined
type Target = { id: string; isAdmin: boolean; status: string | null }
export function canImpersonateUser(actor: Actor, target: Target, impersonating: boolean) {
  return Boolean(
    actor?.id &&
    target.id &&
    actor.isAdmin &&
    !impersonating &&
    actor.id !== target.id &&
    !target.isAdmin &&
    target.status === "1",
  )
}
export function canResetUserPassword(actor: Actor, targetId: string, impersonating: boolean) {
  return Boolean(actor?.id && targetId && !impersonating && (actor.isAdmin || actor.id === targetId))
}
