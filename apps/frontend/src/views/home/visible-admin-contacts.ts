export function visibleAdminContacts<T>(contacts: readonly T[], expanded: boolean): T[] {
  return expanded ? [...contacts] : contacts.slice(0, 3)
}
