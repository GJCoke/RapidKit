export function canImpersonate(
  actor: { id: string; isAdmin: boolean },
  target: { id: string; isAdmin: boolean; status: string | null },
  active: boolean,
) {
  return (
    Boolean(actor.id && target.id) &&
    actor.isAdmin &&
    !active &&
    target.id !== actor.id &&
    !target.isAdmin &&
    target.status === "1"
  )
}
