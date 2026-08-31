export function shouldRedirectLoggedInUserFromLogin(module: unknown, isLoggedIn: boolean) {
  return isLoggedIn && module !== "set-password" && module !== "reset-password"
}
