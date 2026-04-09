## 关于在 podman 中修改国内加速镜像 Mac

1. 进入 Podman VM:

```bash
podman machine ssh
sudo nano /etc/containers/registries.conf
```

2. 写入国内加速源(V2格式):

```toml
unqualified-search-registries = ["docker.io"]

[[registry]]
prefix = "docker.io"
location = "docker.1ms.run"
```

3. 保存退出(control + O 然后回车)
4. 重启 Podman machine:

```bash
exit
podman machine stop
podman machine start
```

5. 运行服务器

```bash
cd apps/backend
```

:::tabs
== docker

```bash
docker compose up -d --build
```

== podman

```bash
podman-compose up -d --build
```

:::
