import { NavigationProgress } from "@/features/router/route-effects"

export const APP_NAME = "RapidKit Admin"

export function AppLoading() {
  return (
    <div className="flex h-screen w-screen flex-col items-center justify-center bg-background" aria-label={APP_NAME}>
      <NavigationProgress active />
      <img src="/logo-loading.svg" className="size-32" alt="RapidKit" />
      <h1 className="mt-3 text-3xl font-medium text-primary">{APP_NAME}</h1>
    </div>
  )
}
