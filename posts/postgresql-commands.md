# PostgreSQL 常用命令及使用说明

> 从连接、建库建表到索引优化、备份恢复与故障排查的完整命令速查。基于 **PostgreSQL 18**（2026 年 9 月时点最新稳定大版本，小版本 18.6）整理。

![PostgreSQL](https://thumb.wikimedia.org/wikipedia/commons/thumb/2/29/Postgresql_elephant.svg/960px-Postgresql_elephant.svg.png)
*PostgreSQL 的吉祥物大象「Slonik」——开源数据库里功能最接近商业库的一个（图：Wikimedia Commons）*

## 一、先理清概念，命令才不乱

新手最容易搞混的是**层级**，先看图：

![集群与模式层级](https://thumb.wikimedia.org/wikipedia/commons/thumb/3/34/PostgreSQL_cluster_db_schema.svg/960px-PostgreSQL_cluster_db_schema.svg.png)
*数据库集群 → 数据库 → 模式 → 表/索引等对象的层级关系（图：Wikimedia Commons）*

| 概念 | 说明 | 容易踩的坑 |
| ---- | ---- | ---- |
| 集群 / 实例（Cluster） | 一个数据目录（PGDATA）+ 一组后台进程，监听一个端口 | 一台机器可以跑多个实例，靠端口和数据目录区分 |
| 数据库（Database） | 集群内的逻辑库，默认有 `postgres`、`template0/1` | **一次连接只能属于一个库**，不能跨库 JOIN（要用 dblink/FDW） |
| 模式（Schema） | 库内的命名空间，默认 `public` | MySQL 里"库=模式"，PG 里是两层，迁移时最容易蒙 |
| 表空间（Tablespace） | 数据文件的物理存放位置 | 可以把热表放到 SSD 上 |

**工具分工**（都在 `$PGHOME/bin`，装完即用）：

| 命令 | 用途 |
| ---- | ---- |
| `initdb` | 初始化数据目录（建集群） |
| `pg_ctl` | 启停、重载、查看状态 |
| `psql` | 官方命令行客户端（日常用得最多） |
| `pg_dump` / `pg_restore` | 逻辑备份 / 恢复 |
| `pg_dumpall` | 整集群备份（含角色等全局对象） |
| `pg_basebackup` | 物理全量备份（搭从库、做 PITR 的基础） |
| `pg_upgrade` | 大版本升级（15 → 18 这种） |
| `createdb` / `dropdb` / `createuser` | `CREATE DATABASE` 等 SQL 的快捷包装 |

## 二、连接数据库：psql

```bash
# 最常用的四种连法
psql -U postgres -d mydb                      # 本地 Unix socket，默认端口 5432
psql -h 10.0.0.5 -p 5432 -U app -d mydb       # 走 TCP 连远程
psql "postgresql://app:pwd@10.0.0.5:5432/mydb?sslmode=require"   # URI 形式，带 SSL ⭐
psql -h 10.0.0.5 -U app -d mydb -c "SELECT version();"           # 非交互，执行完即退出 ⭐

# 免密与环境变量（写脚本、跑定时任务必备）
export PGHOST=10.0.0.5 PGPORT=5432 PGUSER=app PGDATABASE=mydb
export PGPASSWORD='xxx'      # 简单但会进 history/进程列表，生产建议用 ~/.pgpass
# ~/.pgpass 格式：host:port:db:user:password，权限必须是 600
chmod 600 ~/.pgpass
```

**psql 元命令**（反斜杠开头，是客户端命令不是 SQL，末尾**不加分号**）：

| 命令 | 作用 | 命令 | 作用 |
| ---- | ---- | ---- | ---- |
| `\l` | 列出所有数据库 | `\dt` | 列出当前库的表 |
| `\c dbname` | 切换数据库 | `\dt+` | 带大小、描述 |
| `\dn` | 列出模式 | `\d tablename` | 看表结构（含索引、外键） |
| `\du` | 列出角色/权限 | `\di` | 列出索引 |
| `\dv` | 列出视图 | `\df` | 列出函数 |
| `\dp` | 查看对象权限 | `\conninfo` | 当前连接信息 |
| `\timing` | 打开执行计时 ⭐ | `\x` | 宽表纵向展开显示 ⭐ |
| `\e` | 调用编辑器写 SQL | `\i file.sql` | 执行 SQL 脚本文件 |
| `\o out.txt` | 查询结果输出到文件 | `\watch 5` | 每 5 秒重跑上一条 SQL ⭐ |
| `\encoding` | 查看/设置客户端编码 | `\?` | 所有元命令帮助 |

```bash
# 批量导出为 CSV（-A 去对齐、-t 去表头、-F 指定分隔符）
psql -h 10.0.0.5 -U app -d mydb -c "\copy (SELECT * FROM orders WHERE dt='2026-09-01') TO 'orders.csv' CSV HEADER"
```

## 三、库、模式、用户与权限

```sql
-- 库
CREATE DATABASE mydb OWNER app ENCODING 'UTF8' TEMPLATE template0;
ALTER  DATABASE mydb RENAME TO mydb2;
DROP   DATABASE mydb2;                       -- 有连接时会失败，先踢连接再删

-- 模式
CREATE SCHEMA app AUTHORIZATION app;
SET search_path TO app, public;              -- 不写模式名时的查找顺序 ⭐
ALTER ROLE app SET search_path TO app, public;  -- 给用户永久设上

-- 用户与角色（PG 里"用户"就是带 LOGIN 的角色）
CREATE ROLE app LOGIN PASSWORD 'StrongPwd!';
CREATE ROLE readonly;                        -- 不登录的角色，当权限组用
GRANT readonly TO analyst;
GRANT CONNECT ON DATABASE mydb TO readonly;
GRANT USAGE  ON SCHEMA app TO readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA app TO readonly;
ALTER DEFAULT PRIVILEGES IN SCHEMA app GRANT SELECT ON TABLES TO readonly;  -- 未来新表自动授权 ⭐
REVOKE ALL ON ALL TABLES IN SCHEMA app FROM readonly;
```

**认证配置 `pg_hba.conf`**（改完 `SELECT pg_reload_conf();` 或 `pg_ctl reload` 即可生效，不用重启）：

```
# TYPE  DATABASE  USER  ADDRESS         METHOD
local   all       all                   peer
host    all       all   10.0.0.0/8      scram-sha-256
hostssl all       all   0.0.0.0/0       scram-sha-256
```

> **注意**：PG 18 已弃用 MD5 认证，新建用户一律用 `scram-sha-256`。

## 四、表与数据操作

```sql
CREATE TABLE orders (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,  -- 现代写法，优于 serial ⭐
  order_no    text NOT NULL UNIQUE,
  user_id     uuid NOT NULL DEFAULT uuidv7(),                   -- PG 18 新增，时间有序 ⭐
  amount      numeric(14,2) NOT NULL CHECK (amount >= 0),
  tags        text[]    DEFAULT '{}',                           -- 数组类型
  extra       jsonb     DEFAULT '{}'::jsonb,                    -- JSONB，可建 GIN 索引
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_orders_created ON orders (created_at DESC);
COMMENT ON TABLE orders IS '订单主表';

-- 改表
ALTER TABLE orders ADD COLUMN remark text;
ALTER TABLE orders ALTER COLUMN remark SET DEFAULT '';
ALTER TABLE orders RENAME COLUMN remark TO note;
ALTER TABLE orders DROP COLUMN note;

-- UPSERT（有则更新、无则插入）⭐
INSERT INTO orders (order_no, amount) VALUES ('A1001', 99.9)
ON CONFLICT (order_no) DO UPDATE SET amount = EXCLUDED.amount
RETURNING id, created_at;

-- 批量导入导出：COPY 走服务端文件，比逐条 INSERT 快一个量级 ⭐
COPY orders FROM '/tmp/orders.csv' WITH (FORMAT csv, HEADER true);
COPY (SELECT * FROM orders WHERE created_at >= '2026-09-01') TO '/tmp/sept.csv' CSV HEADER;
-- 客户端本地文件用 \copy（权限不同，不需要超级用户）
\copy orders FROM 'D:/data/orders.csv' WITH (FORMAT csv, HEADER true)
```

**分区表**（大表按时间滚动，PG 原生支持）：

```sql
CREATE TABLE logs (id bigint, dt date NOT NULL, msg text) PARTITION BY RANGE (dt);
CREATE TABLE logs_2026m09 PARTITION OF logs FOR VALUES FROM ('2026-09-01') TO ('2026-10-01');
ALTER TABLE logs DETACH PARTITION logs_2026m09 CONCURRENTLY;  -- 在线摘分区，不阻塞写入 ⭐
```

## 五、索引、优化与统计

![B-tree 索引结构](https://thumb.wikimedia.org/wikipedia/commons/thumb/e/ee/PostgreSQL_B-tree.svg/960px-PostgreSQL_B-tree.svg.png)
*B-tree 是最常用的索引结构，PG 还支持 Hash、GIN、GiST、BRIN 等类型（图：Wikimedia Commons）*

```sql
CREATE INDEX idx_orders_user ON orders (user_id);
CREATE INDEX CONCURRENTLY idx_orders_no ON orders (order_no);      -- 不锁表建索引 ⭐
CREATE INDEX idx_orders_paid ON orders (created_at) WHERE amount > 0;   -- 部分索引，更小更快
CREATE INDEX idx_orders_month ON orders (date_trunc('month', created_at));  -- 表达式索引
CREATE INDEX idx_orders_extra ON orders USING gin (extra jsonb_path_ops);   -- JSONB 检索
DROP INDEX CONCURRENTLY idx_orders_no;

-- 看执行计划：ANALYZE 真跑、BUFFERS 看缓存命中（PG 18 默认就显示缓冲区）⭐
EXPLAIN (ANALYZE, BUFFERS, VERBOSE) SELECT * FROM orders WHERE user_id = 42;
```

| 现象 | 大概率原因 | 处理 |
| ---- | ---- | ---- |
| `Seq Scan` 扫大表 | 没走索引 / 统计信息过期 | `ANALYZE tablename;` 看是否转 `Index Scan` |
| 预估行数与实际差几个数量级 | 统计信息不准 | 提高该列 `ALTER TABLE ... ALTER COLUMN c SET STATISTICS 500;` |
| 慢查询找不到源头 | 没装扩展 | `CREATE EXTENSION pg_stat_statements;` + 加进 `shared_preload_libraries` |

```sql
-- 最耗时的 SQL 排行（需先装 pg_stat_statements）⭐
SELECT calls, round(total_exec_time) AS total_ms, round(mean_exec_time,1) AS avg_ms, left(query,80)
FROM pg_stat_statements ORDER BY total_exec_time DESC LIMIT 10;

-- 表膨胀与最后一次 autovacuum
SELECT relname, n_live_tup, n_dead_tup, last_autovacuum, last_autoanalyze
FROM pg_stat_user_tables ORDER BY n_dead_tup DESC LIMIT 10;

-- 维护命令
VACUUM (VERBOSE, ANALYZE) orders;      -- 日常：回收可见性、更新统计
VACUUM FULL orders;                    -- 彻底回收磁盘空间，但会全程锁表 ⚠️
REINDEX INDEX CONCURRENTLY idx_orders_user;
```

**几个最该调的性能参数**（`postgresql.conf`，改完 `pg_ctl reload` 或重启）：

| 参数 | 建议 | 说明 |
| ---- | ---- | ---- |
| `shared_buffers` | 物理内存的 25% | 最大的一块，收益最直接 |
| `work_mem` | 4MB ~ 64MB | 每个排序/哈希操作单独占用，别盲目调大 |
| `maintenance_work_mem` | 256MB ~ 2GB | 影响 VACUUM、建索引速度 |
| `effective_cache_size` | 内存的 50%~75% | 给优化器的提示值，不实际占内存 |
| `io_method` | `worker` 或 `io_uring` | **PG 18 新增异步 I/O**，顺序扫描等场景官方实测最高 3 倍提升 ⭐ |
| `log_min_duration_statement` | `500ms` | 慢 SQL 自动进日志，排查神器 |

## 六、备份与恢复

![备份与恢复流程](https://thumb.wikimedia.org/wikipedia/commons/thumb/9/99/PostgreSQL_dump_restore.svg/960px-PostgreSQL_dump_restore.svg.png)
*pg_dump 逻辑备份与恢复的基本流程（图：Wikimedia Commons）*

```bash
# ---- 逻辑备份：pg_dump ----
pg_dump -h 10.0.0.5 -U app mydb > mydb.sql              # 纯 SQL 文本，可读可改
pg_dump -Fc -Z9 mydb > mydb.dump                        # 自定义压缩格式，推荐 ⭐
pg_dump -Fd -j 4 mydb -f /backup/mydb.dir               # 目录格式 + 4 并发，最快 ⭐
pg_dump -Fc -t 'orders*' mydb > orders.dump             # 只备指定表
pg_dump -Fc --schema-only mydb > schema.dump            # 只要结构不要数据
pg_dumpall -g > globals.sql                             # 角色、表空间等全局对象 ⭐

# ---- 恢复 ----
psql -U postgres -d newdb -f mydb.sql                   # 恢复纯文本备份
pg_restore -U postgres -d newdb -j 4 /backup/mydb.dir   # 恢复自定义/目录格式，并行 ⭐
pg_restore -l mydb.dump                                 # 先看备份里有什么对象
pg_restore -U postgres -d newdb -t orders mydb.dump     # 只恢复某张表

# ---- 物理备份：搭从库、做时间点恢复（PITR）----
pg_basebackup -h 10.0.0.5 -U repl -D /backup/base -Ft -z -P -X stream
```

> **关键区别**：`pg_dump` 是**逻辑**备份，跨版本、跨平台、可选择性恢复，但恢复的是"备份那一刻"的状态；要做**任意时间点恢复**或搭主从，必须用 `pg_basebackup` + 归档 WAL（`archive_mode=on` + `archive_command`）。

## 七、服务、会话与故障排查

```bash
# 服务管理（用系统包安装时走 systemd；源码/自管理时用 pg_ctl）
systemctl start|stop|restart|status postgresql-18
pg_ctl -D /var/lib/pgsql/18/data -l /var/log/pg.log start
pg_ctl -D /var/lib/pgsql/18/data reload      # 只重载配置，不中断连接 ⭐
pg_ctl -D /var/lib/pgsql/18/data status
pg_isready -h 10.0.0.5 -p 5432               # 探活，脚本里判断数据库是否可用
```

```sql
-- 当前连接与慢会话
SELECT pid, usename, state, wait_event_type, wait_event, now()-query_start AS dur, left(query,60)
FROM pg_stat_activity WHERE state <> 'idle' ORDER BY dur DESC;
SELECT pg_cancel_backend(12345);      -- 取消当前查询，温和
SELECT pg_terminate_backend(12345);   -- 断开整个连接，强硬 ⚠️

-- 锁等待：谁堵了谁 ⭐（两处 pg_stat_activity 联表）
SELECT blocked.pid AS blocked_pid, blocked.query AS blocked_sql,
       blocking.pid AS blocking_pid, blocking.query AS blocking_sql
FROM pg_stat_activity blocked
JOIN pg_locks bl ON bl.pid = blocked.pid
JOIN pg_locks kl ON kl.locktype = bl.locktype AND kl.relation = bl.relation AND kl.pid <> bl.pid
JOIN pg_stat_activity blocking ON blocking.pid = kl.pid
WHERE NOT bl.granted;

-- 主从与复制槽
SELECT client_addr, state, sent_lsn, replay_lsn, replay_lag FROM pg_stat_replication;
SELECT slot_name, active, restart_lsn FROM pg_replication_slots;
SELECT pg_drop_replication_slot('slot_name');   -- 废弃的槽会撑爆磁盘 ⚠️
```

```bash
# 大版本升级（15 → 18 这种）
pg_upgrade --old-datadir=/var/lib/pgsql/15/data --new-datadir=/var/lib/pgsql/18/data \
           --old-bindir=/usr/pgsql-15/bin --new-bindir=/usr/pgsql-18/bin --check   # 先体检 ⭐
```

**故障速查**：

| 现象 | 先看哪里 |
| ---- | ---- |
| 连不上（`could not connect`） | 服务起没起（`pg_isready`）、`listen_addresses`、防火墙、`pg_hba.conf` 拒绝 |
| 报 `too many clients` | `SHOW max_connections;`、`pg_stat_activity` 是不是有连接池泄漏 |
| 磁盘突然满 | 复制槽堆积、WAL 未清理、日志暴涨 |
| 查询突然变慢 | 统计信息过期、表膨胀、锁等待、执行计划翻转 |
| 大版本升级后变慢 | 统计信息没带过去（**PG 18 已支持保留**，官方公布） |

## 八、PostgreSQL 18 值得知道的变化

| 变化 | 为什么重要 |
| ---- | ---- |
| **异步 I/O 子系统**（`io_method = worker / io_uring / sync`） | 顺序扫描、位图堆扫描、VACUUM 官方实测最高 **3 倍**提升 |
| **`uuidv7()`** | 时间有序的 UUID，解决随机 UUID 写放大、索引碎片问题 |
| **虚拟生成列** | 查询时计算、不占存储，成为生成列的默认形态 |
| **索引跳过扫描（skip scan）** | 多列 B-tree 索引在未带前缀列条件时也能命中 |
| **升级保留优化器统计** | 大版本升级后不再需要漫长等待性能回升；`pg_upgrade` 新增 `--swap` |
| **`initdb` 默认开启数据校验和** | 老集群升级需加 `--no-data-checksums` 保持一致 |
| **OAuth 2.0 认证**、MD5 认证弃用 | 对接 SSO；密码认证一律迁到 SCRAM |

> **版本寿命提醒**：PostgreSQL 14 将于 **2026 年 11 月 12 日**停止修复支持，仍在跑 14 的环境该排升级计划了。PostgreSQL 19 目前处于 Beta（官方目标是 2026 年 9/10 月 GA），生产环境建议先留在 18。

## 九、安全与操作红线

1. **`VACUUM FULL`、`ALTER TABLE ... SET NOT NULL`、`CREATE INDEX`（不加 CONCURRENTLY）都会锁表**，生产环境务必评估或改到窗口期执行。
2. **`DROP DATABASE` / `TRUNCATE` 前先确认备份可用**，并且验证过恢复流程（没恢复过的备份不算备份）。
3. **`pg_hba.conf` 里别用 `trust`**，尤其是 `0.0.0.0/0`；能用 `hostssl` 就别用 `host`。
4. **复制槽是定时炸弹**：下游不消费就会一直堆积 WAL，记得巡检 `pg_replication_slots`。
5. **生产库慎用超级用户连接应用**，按最小权限原则给业务账号 `SELECT/INSERT/UPDATE/DELETE` + 必要序列权限即可。

## 参考来源

- PostgreSQL 官方文档与发布说明：postgresql.org（PostgreSQL 18 发布公告 2025-09-25；18.6 等小版本更新公告；版本支持策略 FAQ）
- PostgreSQL 18 中文发行说明：postgresql.ac.cn/docs/current/release-18.html
- PostgreSQL 官方消息列表：PostgreSQL 19 Beta 4 发布计划（2026-09-03，Jonathan Katz）

**提醒**：本文命令基于 PostgreSQL 18 整理，参数默认值与行为可能随小版本调整；上线前请以官方文档当日口径为准。
