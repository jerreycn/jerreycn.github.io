# Docker 常用命令及使用说明

> 容器日常开发与运维的高频命令速查：镜像、容器、网络、数据卷、构建与编排。

## 一、核心概念

一句话理清三个东西的关系：

- **镜像（Image）**：只读模板，相当于"安装光盘"
- **容器（Container）**：镜像跑起来的实例，相当于"装好的系统"
- **仓库（Registry）**：存镜像的地方，如 Docker Hub、阿里云 ACR

## 二、镜像操作

```bash
docker pull nginx:latest          # 拉取镜像（不写 tag 默认 latest）
docker images                     # 列出本地镜像
docker image ls -a                # 含中间层全部列出
docker rmi nginx:latest           # 删除镜像（有容器占用时需先删容器）
docker search redis               # 在 Docker Hub 搜索镜像
docker inspect nginx              # 查看镜像/容器详细元数据
docker history nginx              # 查看镜像构建层次
docker save -o nginx.tar nginx    # 导出镜像为文件（离线环境常用）⭐
docker load -i nginx.tar          # 从文件导入镜像 ⭐
docker tag nginx myrepo/nginx:v1  # 打标签（推送私有仓库前必做）
docker system df                  # 查看 docker 磁盘占用
```

## 三、容器操作

```bash
docker run -d --name web -p 8080:80 nginx   # 后台运行并映射端口
docker run -it ubuntu bash                  # 交互式进入容器
docker ps                                   # 查看运行中的容器
docker ps -a                                # 含已停止的容器
docker stop web / docker start web          # 停止 / 启动
docker restart web                          # 重启
docker rm web                               # 删除容器（运行中需 -f）
docker exec -it web bash                    # 进入运行中的容器 ⭐
docker logs -f --tail 100 web               # 实时追踪日志（最后100行）⭐
docker stats                                # 容器资源占用实时监控
docker cp file.txt web:/tmp/                # 宿主机与容器间拷贝文件
docker top web                              # 查看容器内进程
```

**`docker run` 常用参数**：

| 参数 | 说明 | 示例 |
| ---- | ---- | ---- |
| `-d` | 后台运行 | `docker run -d nginx` |
| `-p 宿主:容器` | 端口映射 | `-p 8080:80` |
| `-v 宿主:容器` | 目录/卷挂载 | `-v /data:/app/data` |
| `-e` | 环境变量 | `-e TZ=Asia/Shanghai` |
| `--name` | 容器命名 | `--name web` |
| `--restart=always` | 开机/异常自动重启 | 服务器上建议都加 |
| `--rm` | 退出后自动删除 | 适合一次性任务 |
| `--network` | 指定网络 | `--network mynet` |

## 四、数据卷（Volume）

容器删了数据就没了，持久化必须挂载：

```bash
docker volume create mydata           # 创建卷
docker volume ls                      # 列出卷
docker run -d -v mydata:/var/lib/mysql mysql    # 挂载命名卷（docker 管理位置）
docker run -d -v /host/path:/app/data nginx     # 挂载宿主机目录（bind mount）
docker volume prune                   # 清理无主卷 ⚠️ 确认没数据要留
```

**两种挂载怎么选**：数据库这类"容器专管"的数据用命名卷；配置文件、开发代码同步用 bind mount（路径直观好改）。

## 五、网络

```bash
docker network ls                     # 列出网络
docker network create mynet           # 创建自定义 bridge 网络
docker run -d --network mynet --name app myapp    # 容器加入网络
docker network connect mynet web      # 把已有容器接入
docker network inspect mynet          # 查看网络内容器与 IP
```

**要点**：加入同一个自定义网络后，容器之间**可以直接用容器名当域名互访**（如 `mysql:3306`），不用记 IP；默认的 `bridge` 网络没有这个 DNS 能力。

## 六、Dockerfile 构建镜像

```dockerfile
# 最典型的 Node 应用 Dockerfile
FROM node:20-alpine            # 基础镜像（alpine 体积小）
WORKDIR /app                   # 工作目录
COPY package*.json ./          # 先拷依赖清单，利用缓存层
RUN npm ci --production        # 装依赖（这层不常变，改代码不会重装）
COPY . .                       # 再拷源码
EXPOSE 3000                    # 声明端口（文档作用）
CMD ["node", "server.js"]      # 启动命令
```

```bash
docker build -t myapp:v1 .              # 构建（注意结尾的 . 是构建上下文）
docker build -t myapp:v1 -f Dockerfile.prod .   # 指定 dockerfile
docker build --no-cache -t myapp:v1 .   # 不用缓存重建
docker push myrepo/myapp:v1             # 推送到仓库
```

**镜像瘦身三板斧**：选 alpine/slim 基础镜像、依赖清单和源码分两层写（利用缓存）、`.dockerignore` 排除 node_modules/.git。

## 七、Compose：一键编排多容器

单机跑多个容器（应用+数据库+缓存），用 `docker-compose.yml`：

```yaml
services:
  web:
    build: .
    ports:
      - "8080:3000"
    depends_on:
      - db
    environment:
      - DB_HOST=db
  db:
    image: mysql:8.0
    restart: always
    environment:
      MYSQL_ROOT_PASSWORD: secret
    volumes:
      - dbdata:/var/lib/mysql

volumes:
  dbdata:
```

```bash
docker compose up -d        # 一键启动所有服务
docker compose logs -f web  # 看某个服务的日志
docker compose down         # 停止并删除（加 -v 连卷一起删 ⚠️）
docker compose up -d --build  # 改代码后重建并启动
```

## 八、清理与维护

```bash
docker container prune      # 清理所有已停止的容器
docker image prune -a       # 清理未被使用的镜像
docker system prune -a --volumes   # 大扫除 ⚠️ 会删除所有未使用资源，生产慎用
docker update --restart=always web # 修改运行中容器的重启策略
```

---

日常最高频的六条：`docker ps`、`docker logs -f`、`docker exec -it`、`docker compose up -d`、`docker restart`、`docker system df`，先把这六条用熟。
