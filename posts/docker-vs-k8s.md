# Docker vs Kubernetes：怎么选，容器部署怎么做

> "上了 Docker 还要不要上 K8s？"——先搞清楚两者是干什么的，再看自己的规模，最后给出一条务实的落地路径。

## 一、先纠正一个常见误解

**Docker 和 K8s 不是竞争关系，而是上下游。**

- **Docker** 解决的是"**单机**上把应用打包成容器、跑起来"的问题：环境一致、秒级启动、镜像分发。
- **Kubernetes（K8s）** 解决的是"**一大堆机器**上管理成百上千个容器"的问题：调度、自愈、扩缩容、服务发现、滚动发布。

类比：Docker 是集装箱，K8s 是整个港口的调度系统。集装箱再多，才需要调度系统。

## 二、能力对比

| 能力 | Docker / Compose | Kubernetes |
| ---- | ---------------- | ---------- |
| 单机运行容器 | ✅ 核心能力 | ✅ |
| 多机容器编排 | ❌ | ✅ 核心能力 |
| 故障自愈（挂了自动拉起） | `--restart=always` 仅限本机 | ✅ 集群级，节点宕机自动迁移 |
| 弹性扩缩容 | 手动 | ✅ HPA 按 CPU/内存/指标自动扩缩 |
| 滚动更新 / 回滚 | 手动逐个换 | ✅ 原生，按批次替换可秒回滚 |
| 服务发现 / 负载均衡 | Compose 内 DNS，单机 | ✅ Service + Ingress 集群级 |
| 配置与密钥管理 | 环境变量 / 文件 | ✅ ConfigMap / Secret |
| 学习与运维成本 | 低，半天上手 | 高，需要专人维护集群 |
| 资源开销 | 几乎为零 | 控制面 + 每节点 agent，吃资源 |

**一句话**：Docker 够用就别上 K8s。K8s 解决的是规模问题——机器多了、服务多了、发布频繁了、要求高可用了，它的价值才大于它的成本。

## 三、怎么选：按规模对号入座

**1~5 台机器、十来个服务以内** → Docker + Compose 足够。一台服务器跑十几个容器，配合 `--restart=always` 和日志轮转，很多中小系统就这样稳定跑了多年。

**机器更多、微服务多、发布频繁、要求 99.9%+ 可用** → 上 K8s。不要自己从零搭（kubeadm 裸装运维成本极高），优先选云托管：

- 阿里云 ACK / 腾讯云 TKE / 华为云 CCE：控制面托管，免维护 master
- 小团队试水：K3s（轻量 K8s，单二进制，内网/边缘环境友好）

**过渡方案**：先 Compose，服务数涨到十几二十个、或者出现"半夜起来重启容器"的情况，再迁移 K8s。容器化本身做到位了，迁移成本是可控的。

## 四、容器部署的正确姿势（通用八步）

无论最后用不用 K8s，前六步都一样：

**1. 应用容器化** —— 写好 Dockerfile（分层：依赖层与代码层分开，利用构建缓存）

**2. 选择了 .dockerignore** —— 排除 `.git`、`node_modules`、日志、密钥文件

**3. 配置与代码分离** —— 配置走环境变量或挂载文件，绝不写死在镜像里；一个镜像从开发跑到生产，只有环境变量不同

**4. 数据外置** —— 数据库数据、上传文件用 Volume 挂载；有状态和无状态分开考虑

**5. 镜像托管** —— push 到镜像仓库（Docker Hub / 云厂商 ACR），服务器 `docker pull` 拉取；**不要在服务器上当场 build**，构建在 CI 里完成

**6. CI/CD 自动化** —— 最简版：GitHub Actions 里 build → push → SSH 到服务器 `docker compose up -d --pull`

**7. 可观测性** —— 日志收集（或至少限制日志大小 `--log-opt max-size=10m`）、健康检查 `HEALTHCHECK`、`docker stats`/监控告警

**8. 安全基线** —— 不用 `latest` 标签部署生产（用版本号）、镜像来源可信、不把密码打进镜像（用 Secret/环境变量）

## 五、两种部署形态实例

**形态 A：单机/少量机器 —— Docker Compose**

```yaml
services:
  app:
    image: myrepo/myapp:v1.2.0     # 用版本号，不用 latest
    restart: always
    ports: ["8080:3000"]
    environment:
      - NODE_ENV=production
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
    depends_on: [db]
  db:
    image: mysql:8.0
    restart: always
    volumes: ["dbdata:/var/lib/mysql"]

volumes:
  dbdata:
```

升级 = `docker compose pull && docker compose up -d`；回滚 = 把 tag 换回旧版本再 up。

**形态 B：K8s —— Deployment + Service + Ingress**

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: myapp
spec:
  replicas: 3                      # 3 个副本，挂一个自动补
  selector:
    matchLabels: { app: myapp }
  template:
    metadata:
      labels: { app: myapp }
    spec:
      containers:
        - name: myapp
          image: myrepo/myapp:v1.2.0
          ports: [{ containerPort: 3000 }]
          resources:
            requests: { cpu: 100m, memory: 128Mi }
            limits: { cpu: 500m, memory: 512Mi }
---
apiVersion: v1
kind: Service
metadata:
  name: myapp-svc
spec:
  selector: { app: myapp }
  ports: [{ port: 80, targetPort: 3000 }]
```

升级 = `kubectl set image deployment/myapp myapp=myrepo/myapp:v1.3.0`，自动滚动替换；回滚 = `kubectl rollout undo deployment/myapp`。

## 六、迁移 K8s 前的自检清单

- [ ] 所有服务已经容器化且无状态化（状态都在数据库/对象存储里）？
- [ ] 镜像有统一仓库和版本管理？
- [ ] 团队里有人愿意啃 K8s 运维（或预算买云托管）？
- [ ] 发布频率真的高到需要滚动更新/自动回滚？
- [ ] 能接受额外的资源开销和学习成本？

三个以上是"否"，就继续用 Compose，别为了简历上好看上 K8s。

---

**总结**：Docker 解决打包与隔离，K8s 解决编排与规模化。小规模 Compose 起步、CI/CD 自动发布、镜像版本化管理——这套打好了底子，将来无论迁不迁 K8s 都不亏。
