import { useNavigate } from "react-router"

export default function Forbidden() {
  const navigate = useNavigate()

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4">
      <h1 className="text-6xl font-bold text-muted-foreground">403</h1>
      <p className="text-lg text-muted-foreground">无权限访问此页面</p>
      <button
        type="button"
        className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90"
        onClick={() => navigate("/home")}
      >
        返回首页
      </button>
    </div>
  )
}

export const Component = Forbidden
