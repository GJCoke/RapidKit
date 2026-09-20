import { useQuery } from "@tanstack/react-query"
import { useNavigate, useParams } from "react-router"
import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from "@rapidkit/ui"
import { PageHeader } from "@/features/layout/components/page-header"
import { fetchUser } from "@/services/api/user"
import { userQueryKeys } from "@/services/user-query-keys"
import { useAuthStore } from "@/stores/auth"

export default function UserDetailPage() {
  const { id = "" } = useParams()
  const navigate = useNavigate()
  const token = useAuthStore((state) => state.token)
  const query = useQuery({
    queryKey: userQueryKeys.detail(token, id),
    queryFn: async () => {
      const result = await fetchUser(id)
      if (result.error) throw result.error
      if (!result.data) throw new Error("User not found")
      return result.data
    },
    enabled: Boolean(id),
  })
  return (
    <div className="grid gap-4">
      <PageHeader
        title="用户详情"
        description="查看账户及组织信息"
        actions={
          <Button variant="outline" onClick={() => navigate(-1)}>
            返回
          </Button>
        }
      />
      {query.isLoading ? (
        <div>加载中…</div>
      ) : query.isError || !query.data ? (
        <div className="grid gap-2">
          <span>用户信息加载失败</span>
          <Button variant="outline" onClick={() => void query.refetch()}>
            重试
          </Button>
        </div>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>{query.data.name}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <Info label="用户名" value={query.data.username} />
            <Info label="邮箱" value={query.data.email} />
            <Info label="手机" value={query.data.phone} />
            <Info label="昵称" value={query.data.nickname} />
            <Info label="部门" value={query.data.departmentId} />
            <Info label="最后登录" value={query.data.lastLoginTime} />
            <div>
              <span className="text-sm text-muted-foreground">状态</span>
              <div>
                <Badge>{query.data.status}</Badge>
              </div>
            </div>
            <div>
              <span className="text-sm text-muted-foreground">角色</span>
              <div className="flex gap-1">
                {query.data.roles.map((role) => (
                  <Badge key={role} variant="secondary">
                    {role}
                  </Badge>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
function Info({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <div className="text-sm text-muted-foreground">{label}</div>
      <div>{value || "—"}</div>
    </div>
  )
}
