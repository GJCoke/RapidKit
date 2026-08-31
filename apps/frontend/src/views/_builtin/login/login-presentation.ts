export function getLoginPresentation(module?: UnionKey.LoginModule) {
  const isActivation = module === "set-password" || module === "reset-password"

  return {
    mode: isActivation ? ("activation" as const) : ("default" as const),
    showModuleTitle: !isActivation,
  }
}
