const loginModules: UnionKey.LoginModule[] = [
  "pwd-login",
  "code-login",
  "register",
  "reset-pwd",
  "bind-wechat",
  "set-password",
  "reset-password",
]

export function getLoginModulePattern() {
  return loginModules.join("|")
}

export function getLoginRoutePath() {
  return `/login/:module(${getLoginModulePattern()})?`
}
