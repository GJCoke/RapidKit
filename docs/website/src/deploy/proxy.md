# Nginx / Caddy 反向代理

生产环境通过 Nginx 统一接入全部流量，将请求分发到前端静态文件、后端 API、WebSocket 和 MinIO 四个目标。配置文件位于 `docker/prod/nginx.conf`。

## 路由规则

Nginx 共定义 5 条 `location` 规则，按优先级从高到低排列：

### 1. 静态资源长缓存 -- `/assets/`

Vite 构建产物的文件名包含内容哈希，可以安全地设置长期缓存：

```nginx
location /assets/ {
    expires 1y;
    add_header Cache-Control "public, immutable";
}
```

`immutable` 指令告知浏览器在缓存有效期内无需发起条件请求，显著减少不必要的网络往返。

### 2. 后端 API -- `/api/`

```nginx
location /api/ {
    proxy_pass http://backend/api/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;

    proxy_read_timeout 300s;
    proxy_send_timeout 300s;
}
```

- `backend` 是 upstream 名称，指向 `backend-api:8006`。
- 超时设为 300 秒，适配长时间运行的 API 请求（如报表导出）。

### 3. WebSocket -- `/socket.io/`

```nginx
location /socket.io/ {
    proxy_pass http://backend/socket.io/;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;

    proxy_read_timeout 86400s;
}
```

::: tip WebSocket 关键配置
必须设置 `proxy_http_version 1.1` 并传递 `Upgrade` / `Connection` 头，否则 WebSocket 握手会失败。`proxy_read_timeout` 设为 86400 秒（24 小时），防止空闲连接被过早断开。
:::

### 4. MinIO 对象存储 -- `/minio/`

```nginx
location /minio/ {
    proxy_pass http://minio:9000/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;

    client_max_body_size 100m;
}
```

`client_max_body_size 100m` 允许最大 100 MB 的文件上传。如需调整上传限制，修改此值即可。

### 5. SPA 兜底 -- `/`

```nginx
location / {
    try_files $uri $uri/ /index.html;
}
```

所有未匹配上述规则的请求都回落到此规则。`try_files` 先尝试匹配静态文件，若不存在则返回 `index.html`，由前端路由接管 -- 这是 SPA History 模式的标准做法。

## Gzip 压缩

全局启用 Gzip，覆盖常见的文本类型：

```nginx
gzip on;
gzip_types text/plain text/css application/json application/javascript
           text/xml application/xml application/xml+rss
           text/javascript image/svg+xml;
gzip_min_length 1024;
```

小于 1024 字节的响应不压缩，避免压缩开销超过传输节省。

## Upstream 定义

```nginx
upstream backend {
    server backend-api:8006;
}
```

`backend-api` 是 Docker Compose 内部服务名，Nginx 通过 Docker 内部 DNS 自动解析。若需水平扩展后端，可在此添加多个 `server` 条目并配置负载均衡策略。

## 生产端口

Nginx 容器内监听 `80` 端口，通过 Docker Compose 映射到宿主机 `18080`：

```yaml
nginx:
  ports:
    - "18080:80"
```

部署后通过 `http://<服务器IP>:18080` 访问应用。如需使用标准 80/443 端口，修改映射或在前方再加一层负载均衡即可。

## 端口规划表

| 端口  | 环境         | 服务          | 说明               |
| ----- | ------------ | ------------- | ------------------ |
| 18080 | 生产         | Nginx         | 对外唯一入口       |
| 8006  | 生产（内部） | Backend API   | Nginx 反向代理目标 |
| 9000  | 生产（内部） | MinIO API     | Nginx 反向代理目标 |
| 35432 | 开发         | PostgreSQL    | 宿主机映射         |
| 36379 | 开发         | Redis         | 宿主机映射         |
| 9000  | 开发         | MinIO API     | 宿主机映射         |
| 9001  | 开发         | MinIO Console | 宿主机映射         |

::: info
生产环境中除 Nginx 的 18080 端口外，其余服务均不暴露到宿主机，通过 Docker 内部网络通信。
:::

## Caddy 替代方案

如果倾向于使用 Caddy 替代 Nginx，以下为等效配置参考：

```
:18080 {
    # SPA
    handle {
        root * /srv/dist
        try_files {path} /index.html
        file_server
    }

    # API 反向代理
    handle_path /api/* {
        reverse_proxy backend-api:8006
    }

    # WebSocket
    handle_path /socket.io/* {
        reverse_proxy backend-api:8006
    }

    # MinIO
    handle_path /minio/* {
        reverse_proxy minio:9000
    }
}
```

Caddy 自动管理 HTTPS 证书（通过 Let's Encrypt），适合不想手动配置 TLS 的场景。但需注意 Caddy 的 `handle_path` 会自动去除前缀，路由行为与 Nginx 的 `proxy_pass` 存在差异，迁移时需要验证后端路由匹配是否正确。
