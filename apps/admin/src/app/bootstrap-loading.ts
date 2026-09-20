const BOOTSTRAP_LOADING_ID = "app-bootstrap-loading"

export function setupBootstrapLoading() {
  if (document.getElementById(BOOTSTRAP_LOADING_ID)) return

  const loading = document.createElement("div")
  loading.id = BOOTSTRAP_LOADING_ID
  loading.className = "app-bootstrap-loading font-sans"
  loading.setAttribute("aria-label", "RapidKit Admin")

  const logo = document.createElement("img")
  logo.src = "/logo-loading.svg"
  logo.alt = "RapidKit"

  const title = document.createElement("strong")
  title.textContent = "RapidKit Admin"

  loading.append(logo, title)
  document.body.append(loading)
}

export function finishBootstrapLoading() {
  const loading = document.getElementById(BOOTSTRAP_LOADING_ID)
  if (!loading || loading.classList.contains("app-bootstrap-loading-exit")) return

  loading.classList.add("app-bootstrap-loading-exit")
  const remove = () => loading.remove()
  loading.addEventListener("animationend", remove, { once: true })
  window.setTimeout(remove, 250)
}
