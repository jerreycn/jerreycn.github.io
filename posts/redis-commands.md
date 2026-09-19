# Redis 常用命令及使用说明

> 从连接、九种数据类型到持久化、高可用与内存治理：一份可以直接放在手边的 Redis 命令速查。

![Redis](https://thumb.wikimedia.org/wikipedia/commons/thumb/e/ee/Redis_logo.svg/960px-Redis_logo.svg.png)
*Redis（REmote DIctionary Server）名字里的"字典"二字，点明了它的本质：一个跑在内存里的键值字典（图：Wikimedia Commons）*

## 一、先理清几个基本认知

Redis 由 Salvatore Sanfilippo（antirez）于 **2009 年**发布，如今是使用最广的内存数据存储。真正决定它行为方式的，是下面这几条：

| 特性 | 说明 |
| ---- | ---- |
| **数据在内存** | 所有数据常驻内存，读写是微秒级，比磁盘数据库快 2~3 个数量级 |
| **单线程执行命令** | 命令串行执行，天然无锁、每个命令都是原子的——这是很多用法的前提 |
| **I/O 多线程** | 6.0 起网络读写可多线程，但**命令执行仍是单线程**，别混淆 |
| **默认端口 6379** | 默认 16 个数据库（`SELECT 0`~`15`）；**集群模式只有 db 0** |
| **key 是二进制安全字符串** | 最大 512MB；value 按类型组织，String 类型单值也上限 512MB |

![计算机内存层级](https://thumb.wikimedia.org/wikipedia/commons/thumb/0/0c/ComputerMemoryHierarchy.svg/960px-ComputerMemoryHierarchy.svg.png)
*内存层级：越靠上越快越小越贵。Redis 把数据放在主存这一层，代价是掉电即失——所以持久化和备份才必须单独设计（图：Wikimedia Commons）*

### 版本与许可（这一点容易踩坑）

Redis 的许可证近几年变化很大，选型时必须确认清楚：

| 版本区间 | 许可证 |
| ---- | ---- |
| 7.2.x 及更早 | BSD-3-Clause（宽松，可自由商用） |
| 7.4 ~ 7.8 | 仅 RSALv2 / SSPLv1（已不是 OSI 认可的开源许可） |
| **8.0 及以后** | 三许可：RSALv2 / SSPLv1 / **AGPLv3**（2025-05 加入 AGPLv3） |

要点：

- **AGPLv3 是 OSI 认可的开源许可，但带网络传染性**：如果你修改了 Redis 并以网络服务形式对外提供，通常需要公开修改部分。原样使用一般不受影响。
- **RSALv2 禁止把软件作为托管服务对外商业化**；SSPLv1 要求公开管理层面代码。
- Redis 8.0 起把原先 Redis Stack 的能力（JSON、TimeSeries、Bloom/Cuckoo/Count-min/TopK/t-digest 五种概率结构、Vector Sets 向量集）**并入核心**，开源分发即可用。
- **Valkey**：由 Linux Foundation 治理的 BSD-3-Clause 分支，从 Redis 7.2.4 分叉而来。若你的场景要求宽松许可（自建托管服务、嵌入商业产品），Valkey 是更省事的选择。⚠️ 注意 **Redis CE 7.4+ / 8.x 的数据文件与 Valkey 不兼容**，换过去要走数据迁移而不是直接替换文件。

本文命令基于 **Redis 8.x** 整理（8.10 于 2026-07-29 GA，8.10.1 为 2026-08 的安全补丁版本）。

## 二、安装、启动与连接

### 安装与启动

```bash
# 方式一：源码编译（拿到最新版）
wget https://download.redis.io/releases/redis-8.10.1.tar.gz
tar -xzf redis-8.10.1.tar.gz && cd redis-8.10.1
make && make install          # 默认装到 /usr/local/bin

# 方式二：包管理（版本通常略旧，但省事）
apt install redis-server      # Debian/Ubuntu
yum install redis             # RHEL/CentOS

# 启动
redis-server                          # 前台启动，默认 6379
redis-server /etc/redis/redis.conf    # 指定配置文件 ⭐
redis-server --port 6380 --daemonize yes   # 命令行覆盖配置

# 停止（走命令而不是 kill -9）
redis-cli shutdown                    # 优雅关闭，会先持久化 ⭐
redis-cli -p 6380 shutdown nosave     # 不保存直接关（数据会丢）

# systemd 托管的场景
systemctl start|stop|restart|status redis
```

### 连接

```bash
redis-cli                             # 默认 127.0.0.1:6379
redis-cli -h 10.0.0.5 -p 6379         # 指定主机端口
redis-cli -n 2                        # 直接连到 db 2
redis-cli -s /tmp/redis.sock          # Unix socket（本机通信更快更安全）

# 带密码：-a 会把密码暴露在 ps 里，改用环境变量 ⭐
redis-cli -a '密码'                    # ⚠️ 不推荐
REDISCLI_AUTH='密码' redis-cli -h 10.0.0.5    # 推荐

# ACL 用户（Redis 6+）
redis-cli --user appuser --pass '密码'
```

进入交互界面后：

```text
AUTH 密码            # 或 AUTH 用户名 密码
SELECT 2             # 切库
PING                 # → PONG，探活
QUIT                 # 退出（也可用 exit / Ctrl+D）
```

### 附带的小工具

| 工具 | 用途 |
| ---- | ---- |
| `redis-benchmark` | 压测：`redis-benchmark -h x -p 6379 -c 50 -n 100000 -t set,get` |
| `redis-cli --rdb out.rdb` | 从远端拉取 RDB 快照，**在线备份的常用手段** ⭐ |
| `redis-cli --bigkeys` | 扫描大 key，巡检必跑 |
| `redis-cli --hotkeys` | 扫描热 key（需 LFU 策略） |
| `redis-cli --memkeys` | 按内存占用扫描 key |
| `redis-check-aof` / `redis-check-rdb` | 修复损坏的持久化文件 |
| `redis-sentinel` | 哨兵进程 |

## 三、通用键（Key）命令

```bash
# 遍历
KEYS user:*                     # ⚠️ O(N) 且阻塞主线程，生产环境禁用
SCAN 0 MATCH user:* COUNT 100   # 游标式增量遍历，不阻塞 ⭐ 用这个
SCAN 0 TYPE hash                # 只遍历指定类型

# 存在性与类型
EXISTS key [key ...]            # 返回存在的个数（可一次判断多个）
TYPE key                        # string / hash / list / set / zset / stream / none
TOUCH key [key ...]             # 更新访问时间，影响 LRU/LFU

# 数量与随机
DBSIZE                          # 当前库 key 总数，O(1)
RANDOMKEY                       # 随机返回一个 key

# 删除
DEL key [key ...]               # 同步删除，大 key 会阻塞 ⚠️
UNLINK key [key ...]            # 异步删除（后台回收内存）⭐ 大 key 用它

# 改名与复制
RENAME k1 k2                    # k2 存在则覆盖
RENAMENX k1 k2                  # k2 存在则失败
COPY src dst [DB n] [REPLACE]   # 6.2+，不改变源 key
MOVE key 2                      # 把 key 移到 db 2

# 过期时间
EXPIRE key 60                   # 秒
PEXPIRE key 60000               # 毫秒
EXPIREAT key 1800000000         # Unix 时间戳（秒）
PEXPIREAT key 1800000000000     # 毫秒时间戳
EXPIRE key 60 NX                # 7.0+：仅当没有 TTL 时才设
EXPIRE key 60 XX                # 7.0+：仅当已有 TTL 时才设
EXPIRE key 60 GT                # 7.0+：仅当新 TTL 更大时才设
EXPIRE key 60 LT                # 7.0+：仅当新 TTL 更小（快到期）时才设

TTL key                         # 剩余秒数：-1 = 永不过期，-2 = key 不存在 ⭐
PTTL key                        # 毫秒版
EXPIRETIME key                  # 返回过期的绝对时间戳
PERSIST key                     # 去掉 TTL，变永久

# 查看底层编码（调优时很有用）
OBJECT ENCODING mykey           # int / embstr / raw / listpack / quicklist / hashtable / intset / skiplist / stream
OBJECT FREQ mykey               # LFU 访问频率（需 maxmemory-policy 为 LFU）
OBJECT IDLETIME mykey           # 空闲秒数
OBJECT REFCOUNT mykey

# 序列化
DUMP key                        # 导出为二进制（配合 RESTORE 跨实例搬运）
RESTORE key 0 "<binary>" [REPLACE]

SORT mylist ALPHA LIMIT 0 10    # 排序（会阻塞，量大时慎用）
SORT_RO mylist                  # 只读版，可路由到从库
```

**SCAN 的正确用法**：游标从 0 开始，返回的新游标为 0 时遍历结束。

```bash
# 一次迭代
SCAN 0 MATCH user:* COUNT 100     # → 1) "17"  2) 1) "user:1" 2) "user:5"

# 另一种遍历方式：用 shell 循环
redis-cli --scan --pattern 'user:*' | head -100
```

⚠️ `SCAN` 只保证**在遍历期间一直存在的 key 一定被返回**；遍历过程中新增或删除的 key 可能返回也可能不返回。它做的是「弱一致性遍历」，但不阻塞。

## 四、String（字符串）

最基础也最常用。值可以是文本、JSON、序列化对象或二进制。

```bash
# 写入
SET k v                              # 覆盖旧值，并清除原 TTL
SET k v EX 60                        # 60 秒后过期 ⭐
SET k v PX 10000                     # 毫秒
SET k v EX 60 NX                     # 仅当 k 不存在时才设置（分布式锁基础）⭐
SET k v XX                           # 仅当 k 已存在时才设置
SET k v KEEPTTL                      # 保留原有 TTL
SET k v GET                          # 返回旧值
SETNX k v                            # 等价于 SET k v NX
SETEX k 60 v                         # 等价于 SET k v EX 60
PSETEX k 60000 v

# 读取
GET k
GETEX k EX 100                       # 6.2+：读取并同时刷新/设置 TTL
GETDEL k                             # 6.2+：读取后删除（单次取走令牌）⭐
MGET k1 k2 k3                        # 批量读，减少往返
STRLEN k

# 批量写
MSET k1 v1 k2 v2                     # 一次设置多个
MSETNX k1 v1 k2 v2                   # 全部不存在才设置

# 追加与截取
APPEND k "suffix"
GETRANGE k 0 4                       # 取前 5 个字符（闭区间）
SETRANGE k 5 "xx"                    # 从偏移 5 开始覆盖 ⚠️ 会补 \x00

# 计数（原子）
INCR k                               # +1，非法整数会报错
DECR k
INCRBY k 10
DECRBY k 5
INCRBYFLOAT k 1.5
```

**典型用法**

```bash
# 分布式锁：SET NX PX + 唯一值，释放时校验值（生产建议直接用 Redlock 或成熟客户端）
SET lock:order:123 8f3a... NX PX 30000

# 缓存对象：序列化后整体存取
SET user:1001 '{"name":"张三","age":30}' EX 3600

# 计数器：文章阅读量
INCR article:1001:views

# 限流：固定窗口（配合 EXPIRE）
SET rate:uid:100 1 EX 60 NX      # 第一次
INCR rate:uid:100                # 后续自增，超过阈值即拒绝
```

## 五、Hash（哈希）

一个 key 下存多个字段-值对，适合**存对象**。相比把对象序列化成 String，Hash 可以单独读写某个字段。

```bash
# 写
HSET user:1001 name 张三 age 30 city 杭州    # 返回新增字段数
HMSET user:1001 name 张三 age 30            # 旧命令，已被 HSET 替代
HSETNX user:1001 name 李四                  # 字段不存在才设置

# 读
HGET user:1001 name
HMGET user:1001 name age                   # 批量取字段
HGETALL user:1001                          # ⚠️ 大 hash 慎用，会一次返回全部
HKEYS user:1001 / HVALS user:1001
HLEN user:1001
HEXISTS user:1001 name
HSTRLEN user:1001 name

# 删与计数
HDEL user:1001 city
HINCRBY user:1001 age 1
HINCRBYFLOAT user:1001 balance 10.5

# 随机字段
HRANDFIELD user:1001 2 WITHVALUES          # 6.2+，抽奖/采样

# 遍历（大 hash 用这个）
HSCAN user:1001 0 MATCH a* COUNT 100
HSCAN user:1001 0 NOVALUES                 # 7.4+，只返回字段名不返回值
```

### 字段级过期（Redis 7.4+，9 个新命令）

以前只能给整个 key 设过期，现在可以精确到字段——比如「用户资料永久保留，但会话令牌 1 小时后失效」：

```bash
HSET user:1001 name 张三 session abc123
HEXPIRE user:1001 3600 FIELDS 1 session        # 秒
HPEXPIRE user:1001 3600000 FIELDS 1 session    # 毫秒
HEXPIREAT user:1001 1800000000 FIELDS 1 session
HPEXPIREAT user:1001 1800000000000 FIELDS 1 session

HTTL user:1001 FIELDS 1 session        # 剩余秒数（-1 永久，-2 字段不存在）
HPTTL user:1001 FIELDS 1 session
HEXPIRETIME user:1001 FIELDS 1 session # 绝对过期时间戳
HPEXPIRETIME user:1001 FIELDS 1 session

HPERSIST user:1001 FIELDS 1 session    # 取消字段过期
```

`HEXPIRE` 也支持 `NX / XX / GT / LT` 选项，语义与 key 级 `EXPIRE` 一致。

![哈希表](https://thumb.wikimedia.org/wikipedia/commons/thumb/5/58/Hash_table_4_1_1_0_0_1_0_LL.svg/960px-Hash_table_4_1_1_0_0_1_0_LL.svg.png)
*哈希表（拉链法解决冲突）是 Redis 最核心的结构：整个键空间是一个大 dict，Hash/Set/ZSet 内部也各有一个 dict。它保证了平均 O(1) 的查找（图：Wikimedia Commons）*

**底层编码**：字段较少且短 → `listpack`（紧凑连续内存）；超过阈值 → `hashtable`（真正的哈希表）。阈值由 `hash-max-listpack-entries`（默认 128）和 `hash-max-listpack-value`（默认 64 字节）控制。

**Redis 8.10 的新东西**：紧凑哈希（compact hash / hash templates）让**共享同一套字段名**的大量 hash 只存一份字段名，官方称内存最多降 50%；配套的 `HIMPORT` 命令可批量导入，吞吐提升最多 2 倍。

```bash
HIMPORT PREPARE user-profile name email country last_login
HIMPORT SET user:1 user-profile "Alice" "a@x.com" "UK" "2026-07-14"
HIMPORT SET user:2 user-profile "Bob"   "b@x.com" "US" "2026-07-14"
```

## 六、List（列表）

有序、可重复，支持两端高效插入弹出，是**队列和栈**的天然实现。

```bash
# 插入
LPUSH mylist a b c            # 从左侧依次插入 → 顺序是 c b a
RPUSH mylist x y z            # 从右侧插入
LPUSHX mylist v               # 仅当 key 存在
LINSERT mylist BEFORE b tmp   # 在指定元素前/后插入

# 读取
LRANGE mylist 0 -1            # 全部（-1 表示最后一个）⭐
LRANGE mylist 0 9             # 前 10 个
LINDEX mylist 0
LLEN mylist
LPOS mylist b [RANK 1] [COUNT 2]   # 6.0+ 查找元素位置

# 修改
LSET mylist 0 newval
LTRIM mylist 0 99             # 只保留前 100 个 ⭐ 配合 LPUSH 做定长列表

# 弹出
LPOP mylist                   # 左弹一个
RPOP mylist 2                 # 6.2+ 一次弹多个
LPOP mylist COUNT 5

# 删除元素
LREM mylist 0 b               # count>0 从头删 n 个；<0 从尾；=0 全删

# 原子移动（跨列表搬运）
LMOVE src dst LEFT RIGHT          # 6.2+
RPOPLPUSH src dst                 # LMOVE 的特例

# 阻塞版本（用于消费者等待）
BLPOP mylist 5                    # 最多阻塞 5 秒，0 表示永久
BRPOP mylist 5
BLMOVE src dst LEFT RIGHT 5
BLMOVEM src dst LEFT RIGHT 2 5    # 8.10+ 一次搬多个元素
```

**两种经典结构**

```bash
# 队列：左进右出（或右进左出）
RPUSH queue:jobs job1 job2
BLPOP queue:jobs 0                    # 消费者阻塞等待

# 栈：同端进出
LPUSH stack a b c && LPOP stack

# 时间线/最近N条：写入 + 裁剪
LPUSH feed:1001 "post:9527" && LTRIM feed:1001 0 999
```

⚠️ List 是链表结构（`quicklist` = 多个 listpack 节点串成的双向链表），按**下标随机访问是 O(N)**。频繁按下标读取的场景改用 Hash 或 ZSet。

## 七、Set（集合）

无序、**自动去重**，支持交并差运算。

```bash
# 增删
SADD tags:1001 redis cache nosql
SREM tags:1001 cache
SPOP tags:1001 [3]            # 随机弹出（会删除）⭐ 抽奖
SMOVE src dst member          # 原子移动到另一个集合

# 查询
SMEMBERS tags:1001            # ⚠️ 大集合慎用
SCARD tags:1001               # 元素个数
SISMEMBER tags:1001 redis
SMISMEMBER tags:1001 redis abc    # 6.2+ 批量判断
SRANDMEMBER tags:1001 [3]     # 随机取（不删除）
SSCAN tags:1001 0 MATCH r* COUNT 100   # 大集合遍历

# 集合运算
SINTER s1 s2                  # 交集 ⭐ 共同好友
SUNION s1 s2                  # 并集
SDIFF s1 s2                   # 差集（s1 有 s2 没有）
SINTERCARD 2 s1 s2 LIMIT 100  # 7.0+ 只算基数，不返回元素
SUNIONCARD s1 s2              # 8.10+ 并集基数
SDIFFCARD s1 s2               # 8.10+ 差集基数

# 运算结果落盘
SINTERSTORE dst s1 s2
SUNIONSTORE dst s1 s2
SDIFFSTORE dst s1 s2
```

**底层编码**：全是整数且数量少 → `intset`；否则 → `listpack`，再大 → `hashtable`。阈值：`set-max-intset-entries`（512）、`set-max-listpack-entries`（128）。

## 八、ZSet（有序集合）

每个成员带一个 **score**，按 score 自动排序——排行榜的标准答案。

```bash
# 增改
ZADD rank 100 user:1 200 user:2              # 返回新增成员数
ZADD rank GT CH 150 user:1                   # GT：仅当新分数更大才更新；CH：返回变化个数
ZADD rank NX 100 user:3                      # NX：仅新增，不更新已有
ZINCRBY rank 10 user:1                       # 原子加分 ⭐

# 按排名区间读
ZRANGE rank 0 9 [WITHSCORES]                 # 前 10 名（升序）⭐
ZREVRANGE rank 0 9 WITHSCORES                # 降序 → 排行榜
ZRANK rank user:1                            # 升序名次（从 0 开始）
ZREVRANK rank user:1                         # 降序名次

# 按分数区间读
ZRANGEBYSCORE rank 100 200 WITHSCORES LIMIT 0 10
ZREVRANGEBYSCORE rank 200 100                # 注意：参数是从大到小
ZRANGE rank "(100" 200 BYSCORE               # 6.2+ 新语法，`(` 表示开区间
ZCOUNT rank 100 200                          # 区间内成员数

# 统一语法（6.2+，推荐）
ZRANGE rank 0 -1 REV                         # 等价 ZREVRANGE
ZRANGE rank 0 9 BYSCORE LIMIT 0 10           # 等价 ZRANGEBYSCORE
ZRANGE rank - + BYLEX                        # 等价 ZRANGEBYLEX（分数相同时按字典序）

# 查询分数
ZSCORE rank user:1
ZMSCORE rank user:1 user:2                   # 6.2+

# 删除
ZREM rank user:1
ZREMRANGEBYRANK rank 0 9                     # 按名次删
ZREMRANGEBYSCORE rank 0 99                   # 按分数删
ZREMRANGEBYLEX rank [a [c                    # 按字典序区间删

# 弹出
ZPOPMIN rank [2] / ZPOPMAX rank [2]
BZPOPMIN rank 5 / BZPOPMAX rank 5            # 阻塞版
ZRANDMEMBER rank 3 WITHSCORES                # 6.2+ 随机成员

# 多集合运算
ZUNIONSTORE dst 2 z1 z2 WEIGHTS 1 2 AGGREGATE SUM
ZINTERSTORE dst 2 z1 z2
ZDIFFSTORE dst 2 z1 z2
ZUNION 2 z1 z2 WITHSCORES                    # 6.2+ 不落盘
ZINTERCARD 2 z1 z2 LIMIT 10                  # 7.0+
```

**典型用法**

```bash
# 实时排行榜
ZINCRBY rank:daily 1 user:1001
ZREVRANGE rank:daily 0 9 WITHSCORES

# 延时队列：score 存执行时间戳，消费者轮询到期任务
ZADD delay:queue 1800000000 "order:123:timeout"
ZRANGEBYSCORE delay:queue 0 $(date +%s) LIMIT 0 10

# 滑动窗口限流：score 存请求时间，先清理过期再计数
ZREMRANGEBYSCORE rate:uid 0 $(($(date +%s) - 60))
ZCARD rate:uid
ZADD rate:uid $(date +%s) "$RANDOM"
```

**底层编码**：元素少 → `listpack`；多 → `skiplist` + `dict` 双结构（skiplist 保证有序遍历，dict 保证 O(1) 查分数）。阈值 `zset-max-listpack-entries`（128）、`zset-max-listpack-value`（64）。

## 九、Bitmap、HyperLogLog、GEO、Stream

### Bitmap（位图）

本质是 String，按位操作，极度省内存——1 亿用户签到只需约 12MB。

```bash
SETBIT sign:202609 1001 1        # 用户 1001 签到（偏移量可到 2^32-1）
GETBIT sign:202609 1001
BITCOUNT sign:202609             # 置 1 的位数 ⭐ 今日签到人数
BITCOUNT sign:202609 0 0 BYTE    # 限定字节范围
BITPOS sign:202609 1             # 第一个为 1 的位置
BITOP AND dest b1 b2             # 位运算：AND/OR/XOR/NOT
BITFIELD bf SET u8 0 255         # 位域操作，可当计数器数组用
```

⚠️ 偏移量极大时（如 `SETBIT k 100000000 1`）会立即分配内存，别用稀疏的大偏移。

### HyperLogLog（基数估算）

用约 12KB 估算任意规模集合的**去重后数量**，标准误差 0.81%。不可逆，取不出元素。

```bash
PFADD uv:20260901 user1 user2 user3
PFCOUNT uv:20260901              # 估算 UV ⭐
PFMERGE uv:week uv:20260901 uv:20260902   # 合并多天
```

对比：`SCARD` 精确但占内存（集合越大越吃内存）；`PFCOUNT` 固定 12KB 但是近似值。日活/UV 统计选前者。

### GEO（地理位置）

底层就是 ZSet（把经纬度编码成 score），所以 `ZREM`、`ZCARD` 都能直接用。

```bash
GEOADD cities 116.4074 39.9042 beijing 121.4737 31.2304 shanghai
GEOPOS cities beijing                              # 取回坐标
GEODIST cities beijing shanghai km                 # 距离：m/km/mi/ft
GEOHASH cities beijing

# 附近的人
GEOSEARCH cities FROMLONLAT 116.4074 39.9042 BYRADIUS 500 km ASC COUNT 10 WITHCOORD WITHDIST
GEOSEARCH cities FROMMEMBER beijing BYBOX 100 100 km ASC
GEOSEARCHSTORE dst cities FROMMEMBER beijing BYRADIUS 100 km   # 结果落盘
```

⚠️ 北京/上海等国内城市坐标若需合规使用，应基于国家规定的坐标系（如 CGCS2000 及测绘资质要求），不能直接用 WGS84 对外提供地图服务。

### Stream（流）

Redis 5.0 引入的日志型数据结构，**带消费组、可持久化、可回溯**——比 Pub/Sub 更适合做消息队列。

```bash
XADD orders * item 1001 qty 2        # * 让 Redis 自动生成 ID（毫秒时间戳-序号）
XADD orders 1800000000000-0 item 1001 qty 2   # 或指定 ID
XLEN orders
XRANGE orders - + [COUNT 10]         # - 最早，+ 最新
XREVRANGE orders + - COUNT 10
XDEL orders 1800000000000-0
XTRIM orders MAXLEN ~ 10000          # 裁剪，~ 表示近似（更高效）

# 读取
XREAD COUNT 10 BLOCK 5000 STREAMS orders $     # $ 表示只读新消息；0 表示从头读
XREAD COUNT 10 MAXCOUNT 100 MAXSIZE 1mb STREAMS orders $   # 8.10+ 限制单次返回量

# 消费组
XGROUP CREATE orders g1 $ MKSTREAM    # $ 从最新开始；0 从头开始
XREADGROUP GROUP g1 consumer1 COUNT 10 STREAMS orders >
XACK orders g1 1800000000000-0        # 确认已处理
XPENDING orders g1                    # 查看未确认
XPENDING orders g1 IDLE 60000         # 空闲超 60 秒的（可能已挂）
XAUTOCLAIM orders g1 consumer2 60000 0-0 COUNT 10   # 认领超时消息 ⭐
XCLAIM orders g1 consumer2 60000 <id>
XINFO STREAM orders / XINFO GROUPS orders / XINFO CONSUMERS orders g1
XGROUP DESTROY orders g1 / XGROUP DELCONSUMER orders g1 c1
```

关键差异：**Stream 的消息不会因为消费组不存在就丢**；`XACK` 之前消息一直留在 PEL（pending entries list）里，可以重投。这是它比 Pub/Sub 可靠的原因。

## 十、发布订阅（Pub/Sub）

![发布订阅模式](https://thumb.wikimedia.org/wikipedia/commons/thumb/e/ee/DDS_pub_sub.svg/960px-DDS_pub_sub.svg.png)
*发布订阅模型：发布者与订阅者不直接认识，靠频道解耦。Redis 的实现是"即发即忘"——消息不落盘，也不保证送达（图：Wikimedia Commons）*

```bash
# 订阅（进入订阅态后，该连接只能执行订阅相关命令）
SUBSCRIBE news.tech news.sports
PSUBSCRIBE news.*                    # 按模式订阅
UNSUBSCRIBE [news.tech]              # 不写参数则退订全部
PUNSUBSCRIBE [news.*]

# 发布
PUBLISH news.tech "Redis 8.10 发布"   # 返回收到消息的订阅者数量
PUBLISH news.tech "hello"            # 返回 0 说明当时无人订阅 ⚠️

# 查看
PUBSUB CHANNELS [news.*]             # 活跃频道
PUBSUB NUMSUB news.tech              # 该频道的订阅者数
PUBSUB NUMPAT                        # 模式订阅总数

# 分片频道（7.0+，集群模式下可水平扩展）⭐
SSUBSCRIBE news.tech
SPUBLISH news.tech "msg"
SUNSUBSCRIBE news.tech
```

⚠️ **三个必须知道的限制**

1. **不持久化**：订阅者离线期间的消息直接丢失，没有补偿机制。
2. **不保证送达**：没有任何 ack/重试语义。
3. **集群下普通 Pub/Sub 会广播到所有节点**，规模化场景用分片频道（`SSUBSCRIBE`/`SPUBLISH`）。

需要可靠性 → 用 **Stream + 消费组**；需要广播通知（配置变更、缓存失效）→ Pub/Sub 足够。

## 十一、事务与脚本

### MULTI/EXEC 事务

```bash
MULTI                       # 开启事务，后续命令进入队列
SET k1 v1
INCR counter
EXEC                        # 一次性顺序执行
DISCARD                     # 放弃事务

WATCH k1                    # 乐观锁：k1 被别的客户端改过，EXEC 就会返回 nil ⭐
UNWATCH
```

⚠️ **Redis 事务不支持回滚**，这点和关系型数据库完全不同：

- 命令**语法错误**（如拼错的命令）→ 入队时即报错，`EXEC` 整个不执行。
- 命令**运行时错误**（如对非数字字符串 `INCR`）→ 出错的那条失败，**其余命令照常执行**。

需要「要么全成、要么全不成」的原子性，用 Lua 脚本。

### Lua 脚本

```bash
EVAL "return redis.call('SET', KEYS[1], ARGV[1])" 1 mykey myvalue
EVAL "return redis.call('GET', KEYS[1])" 1 mykey

SCRIPT LOAD "return 1"          # 只加载，返回 SHA1
EVALSHA <sha1> 1 mykey myvalue  # 用 SHA1 执行，省带宽 ⭐
SCRIPT EXISTS <sha1>
SCRIPT FLUSH [ASYNC|SYNC]
```

要点：

- `KEYS[]` 传 key，`ARGV[]` 传参数——**key 必须走 KEYS**，否则集群模式无法正确路由。
- 脚本执行期间**阻塞整个实例**，别写循环。
- 卡住的脚本：`SCRIPT KILL`（未写过数据时可杀）；已写过数据只能 `SHUTDOWN NOSAVE`（会丢数据）。

### Functions（Redis 7.0+）

比 Lua 脚本更适合复用：函数有名字、可持久化、可随 RDB/AOF 一起备份。

```bash
FUNCTION LOAD "#!lua name=mylib
redis.register_function('setget', function(keys, args)
  redis.call('SET', keys[1], args[1])
  return redis.call('GET', keys[1])
end)"

FCALL setget 1 mykey hello
FCALL_RO setget 1 mykey            # 只读版，可路由到从库
FUNCTION LIST [LIBRARYNAME mylib] [WITHCODE]
FUNCTION STATS
FUNCTION DUMP / FUNCTION RESTORE <payload>
FUNCTION DELETE mylib / FUNCTION FLUSH
```

## 十二、持久化：RDB 与 AOF

![数据中心](https://thumb.wikimedia.org/wikipedia/commons/thumb/9/98/Cern_datacenter.jpg/960px-Cern_datacenter.jpg)
*持久化决定了"进程挂了数据还在不在"。但再完整的持久化也替代不了异地备份——这是两件事（图：Wikimedia Commons）*

### RDB（快照）

某个时间点的全量二进制快照，文件小、恢复快，但**两次快照之间的数据会丢**。

```bash
BGSAVE                       # fork 子进程写快照，主进程继续服务 ⭐
SAVE                         # ⚠️ 同步执行，阻塞主线程，生产禁用
LASTSAVE                     # 上次成功保存的 Unix 时间戳
INFO persistence             # 查看 rdb_last_bgsave_status 等指标

CONFIG GET save
CONFIG SET save "900 1 300 10 60 10000"   # 900秒内1个改动/300秒内10个/60秒内1万个 → 触发
CONFIG GET dir / dbfilename                    # 落盘目录与文件名
CONFIG SET stop-writes-on-bgsave-error yes     # 默认 yes，bgsave 失败则拒写
```

⚠️ `BGSAVE` 需要 fork，fork 耗时与内存量正相关；大实例（>16GB）会出现明显延迟毛刺。控制单实例内存、关闭透明大页（THP）能显著缓解。

### AOF（追加日志）

记录每一条写命令，默认 `everysec` 刷盘，**最多丢 1 秒数据**。

```bash
CONFIG SET appendonly yes        # 4.0+ 默认关闭，建议开启
CONFIG SET appendfsync everysec  # always（最安全最慢）/ everysec（默认，推荐）/ no（交给 OS）
CONFIG SET no-appendfsync-on-rewrite no
BGREWRITEAOF                     # 手动触发重写，压缩日志体积 ⭐
CONFIG REWRITE                   # 把运行时配置写回配置文件

CONFIG GET auto-aof-rewrite-percentage   # 默认 100（增长一倍触发）
CONFIG GET auto-aof-rewrite-min-size     # 默认 64mb
```

要理解的几点：

- **Redis 7.0 起改用 MP-AOF（多部分 AOF）**：拆成 base（基础快照）+ incr（增量）多个文件，由 manifest 文件统一管理，重写更可控。
- **`aof-use-rdb-preamble yes`（默认）**：AOF 的 base 部分用 RDB 格式存，兼顾体积小和恢复快。
- **恢复优先级**：启动时若开启 AOF，用 AOF 恢复；否则用 RDB。
- **前端刷新策略**：`appendfsync always` 每条命令都 fsync（性能极差）；`everysec` 每秒一次（推荐的默认值）；`no` 完全交给操作系统（重启可能丢更多）。

### 8.10 新增：BACKUP 命令

基于 MP-AOF 的节点级备份与恢复，可在集群中**协调各分片分批快照**，避免同一时刻全量备份把资源打满。

```bash
BACKUP ...        # 具体参数以官方文档为准，属 8.10 新增能力
```

### 一条铁律

**Redis 是缓存/内存数据结构服务，RDB/AOF 不是数据库备份的替代品。**

- 持久化解决的是「进程/机器重启后能否恢复」，不是「误删后能否找回」。
- 一定要做到：主从 + AOF everysec + 定期 `redis-cli --rdb` 或 RDB 文件异地归档 + **演练过恢复流程**（没验证过的备份不算备份）。
- 关键业务数据必须有落地持久化数据库的那一份。

## 十三、高可用：主从、哨兵、集群

### 主从复制

```bash
REPLICAOF 10.0.0.5 6379          # 从节点指向主节点（5.0+ 新名，SLAVEOF 是旧名）
REPLICAOF NO ONE                 # 提升为独立主节点（故障切换后手动提升用）
INFO replication                 # 查看 role / connected_slaves / master_link_status ⭐
WAIT 1 1000                      # 等待至少 1 个副本确认，超时 1000 毫秒
```

- 默认**异步复制**：`WAIT` 可以把「已写入主库」提升为「已同步到 N 个副本」，但它不是强一致性保证（超时未达成也不回滚）。
- 从节点默认 `replica-read-only yes`，写操作会报 `READONLY`。
- 复制积压缓冲区 `repl-backlog-size` 决定短暂断线能否增量续传；太小会退化为全量同步（`PSYNC` → `FULLRESYNC`）。
- 哨兵与集群都用到 `min-replicas-to-write` / `min-replicas-max-lag`，用来防止主节点与多数副本失联时仍接受写入。

### 哨兵（Sentinel）

负责监控、通知、自动故障转移，通常 3 个以上奇数节点部署。

```bash
redis-sentinel /etc/redis/sentinel.conf

SENTINEL masters                              # 所有被监控的主节点
SENTINEL master mymaster                      # 单个主节点详情
SENTINEL get-master-addr-by-name mymaster     # 当前主节点地址 ⭐
SENTINEL replicas mymaster                    # 副本列表
SENTINEL sentinels mymaster
SENTINEL failover mymaster                    # 手动触发故障转移
SENTINEL ckquorum mymaster                    # 检查客观下线所需票数是否足够
SENTINEL reset mymaster
```

关键配置：`quorum`（判定客观下线所需票数）、`down-after-milliseconds`（主观下线超时）、`failover-timeout`。

### 集群（Cluster）

数据按 **16384 个哈希槽**分片，`CRC16(key) mod 16384` 决定归属。

```bash
# 查看
CLUSTER INFO                       # cluster_state:ok / slots_assigned 等 ⭐
CLUSTER NODES                      # 所有节点与槽分配
CLUSTER SHARDS                     # 7.0+ 更易读的分片视图
CLUSTER SLOTS                      # 槽 → 节点映射
CLUSTER KEYSLOT mykey              # 计算 key 属于哪个槽
CLUSTER COUNTKEYSINSLOT 1234       # 某个槽里有多少 key
CLUSTER GETKEYSINSLOT 1234 10      # 列出某个槽内的 key

# 组建与调整
CLUSTER MEET 10.0.0.6 6379
CLUSTER ADDSLOTS 0 1 2 3 ...
CLUSTER ADDSLOTSRANGE 0 1000           # 7.0+
CLUSTER DELSLOTS 0 1
CLUSTER REPLICATE <node-id>            # 把当前节点设为某节点的副本
CLUSTER FORGET <node-id>
CLUSTER RESET [HARD|SOFT]
CLUSTER FAILOVER [FORCE|TAKEOVER]      # 手动切换主从
CLUSTER SET-CONFIG-EPOCH 1
CLUSTER BUMPEPOCH

# 用 redis-cli 一键操作（更常用）⭐
redis-cli --cluster create 10.0.0.5:6379 10.0.0.6:6379 10.0.0.7:6379 \
  --cluster-replicas 1
redis-cli --cluster check 10.0.0.5:6379
redis-cli --cluster info 10.0.0.5:6379
redis-cli --cluster reshard 10.0.0.5:6379
redis-cli --cluster rebalance 10.0.0.5:6379
redis-cli --cluster add-node 10.0.0.8:6379 10.0.0.5:6379
redis-cli --cluster del-node 10.0.0.5:6379 <node-id>
redis-cli --cluster fix 10.0.0.5:6379
redis-cli -c -h 10.0.0.5 -p 6379        # -c 开启重定向跟随 ⭐
```

**Hash tag：多 key 必须同槽**

集群模式下跨槽的多 key 命令（`MGET`、`SINTER`、Lua 里的多个 KEYS）会报 `CROSSSLOT`。用 `{}` 强制路由到同一槽：

```bash
MGET user:1 user:2                   # ✗ 可能跨槽 → CROSSSLOT
MGET {u1}:name {u1}:age              # ✓ 只按 {u1} 算槽，保证同槽
```

⚠️ hash tag 用得太集中会造成**数据倾斜**（全落一个节点），需要权衡。

8.10 引入了**原子槽迁移**，让 reshard 过程更不易出现中间态异常。

## 十四、内存与性能治理

![内存条](https://thumb.wikimedia.org/wikipedia/commons/thumb/b/b2/HYR186420G-653.jpg/960px-HYR186420G-653.jpg)
*内存是 Redis 的成本中心，也是它的性能来源。单 key 过大、实例内存过大，都会在 fork 持久化和主从全量同步时被放大成故障（图：Wikimedia Commons）*

### 巡检命令

```bash
INFO                      # 全量指标
INFO memory               # used_memory / used_memory_rss / mem_fragmentation_ratio ⭐
INFO stats                # 命中率 keyspace_hits / keyspace_misses
INFO replication          # 主从状态
INFO keyspace             # 各 db 的 key 数与过期数
INFO commandstats
INFO everything

MEMORY USAGE mykey [SAMPLES 5]   # 单个 key 的内存占用 ⭐
MEMORY STATS
MEMORY DOCTOR                    # 体检建议

SLOWLOG GET 10                   # 慢查询日志
SLOWLOG LEN
SLOWLOG RESET
CONFIG SET slowlog-log-slower-than 10000   # 超过 10000 微秒（10ms）记录
CONFIG SET slowlog-max-len 128

LATENCY DOCTOR
LATENCY HISTORY command
LATENCY RESET

CLIENT LIST                      # 连接列表（含 addr / cmd / age / mem）
CLIENT INFO
CLIENT KILL ID 12345
CLIENT KILL ADDR 1.2.3.4:5678
CLIENT NO-EVICT on               # 该连接的内存不计入淘汰范围
CLIENT PAUSE 5000 WRITE          # 暂停写入 5 秒（做安全运维）
CLIENT UNPAUSE

MONITOR                          # ⚠️ 打印所有命令，性能开销大，生产慎用
CONFIG GET maxmemory / CONFIG SET maxmemory 4gb
CONFIG GET "*"                   # 列出所有配置（6.0+ 支持 glob）
```

### 淘汰策略（maxmemory-policy）

必须先设 `maxmemory`，否则 Redis 会一直吃到把系统内存耗尽。

| 策略 | 行为 |
| ---- | ---- |
| `noeviction` | **默认**。内存满后写命令直接报错（读仍可用） |
| `allkeys-lru` | 所有 key 中淘汰最近最少使用的 ⭐ 纯缓存场景首选 |
| `allkeys-lfu` | 按访问频率淘汰（4.0+）⭐ 热点稳定时通常优于 LRU |
| `allkeys-random` | 随机淘汰 |
| `volatile-lru` | 只在设置了 TTL 的 key 中按 LRU 淘汰 |
| `volatile-lfu` | 只在设置了 TTL 的 key 中按 LFU 淘汰 |
| `volatile-random` | 只在设置了 TTL 的 key 中随机淘汰 |
| `volatile-ttl` | 优先淘汰剩余存活时间最短的 |

```bash
CONFIG SET maxmemory 4gb
CONFIG SET maxmemory-policy allkeys-lfu
CONFIG SET maxmemory-samples 5        # LRU/LFU 的采样数，越大越精确越慢
```

⚠️ **只要允许淘汰，就意味着数据会悄悄丢失**。所以「用 Redis 当唯一数据源」+「开了淘汰策略」是一个自相矛盾的组合。

### 内存碎片

```bash
CONFIG GET mem_fragmentation_ratio     # >1.5 说明碎片偏高
CONFIG SET activedefrag yes            # 开启主动碎片整理（4.0+）
CONFIG GET active-defrag-threshold-lower    # 默认 10（碎片率超过 10% 才启动）
CONFIG GET active-defrag-cycle-min
```

也别忘了在操作系统层面关闭 THP（透明大页），否则 fork 时 COW 拷贝会明显变慢：

```bash
echo never > /sys/kernel/mm/transparent_hugepage/enabled
```

## 十五、ACL 与安全

Redis 6.0 引入 ACL，可以按用户 + 命令 + key 前缀做细粒度授权。

```bash
ACL WHOAMI                                    # 当前用户
ACL LIST                                      # 所有用户及其权限
ACL CAT [read|write|dangerous]                # 命令分类
ACL GETUSER appuser
ACL SETUSER appuser on >强密码 ~app:* +@read +@write -@dangerous ⭐
ACL SETUSER readonly on >pwd ~cache:* +@read
ACL DELUSER appuser
ACL LOG [10]                                  # 被拒绝的访问记录
ACL SAVE                                      # 持久化 ACL 规则
```

配置红线：

1. **`bind` 别用 `0.0.0.0` 裸奔**，只监听内网或本机，前面加防火墙/安全组。
2. **必须设 `requirepass` 或 ACL 强密码**，密码别写死在代码里。
3. `protected-mode yes` 保持开启（无密码且非本机监听时会拒绝连接）。
4. **`CONFIG` 是提权入口**：能用 ACL 禁掉就禁；老版本可用 `rename-command CONFIG ""`。
5. 公网暴露的实例**必须走 TLS**（`tls-port`、`tls-cert-file`、`tls-key-file`、`tls-ca-cert-file`）。
6. 用专用低权限账号跑 Redis 进程，`dir` 目录权限收紧——RDB 文件本身就是完整数据。
7. `FLUSHALL`/`FLUSHDB`/`KEYS`/`SHUTDOWN` 对普通业务账号一律 `-` 掉。

## 十六、故障速查

| 报错/现象 | 原因 | 处理 |
| ---- | ---- | ---- |
| `NOAUTH Authentication required` | 未认证 | `AUTH` 或 `REDISCLI_AUTH` |
| `MISCONF ... can't save to disk` | `BGSAVE` 失败（磁盘满/权限/目录不可写） | 查磁盘与 `dir` 权限；临时 `CONFIG SET stop-writes-on-bgsave-error no` |
| `LOADING Redis is loading the dataset` | 正在加载 RDB/AOF | 等待，`INFO persistence` 看 `loading` |
| `OOM command not allowed` | 内存超 `maxmemory` 且策略为 `noeviction` | 扩容或改淘汰策略 |
| `READONLY You can't write against a read only replica` | 写到了从库 | 写主库 |
| `CROSSSLOT Keys in request don't hash to the same slot` | 集群多 key 跨槽 | 用 `{}` hash tag |
| `MOVED 3999 10.0.0.6:6379` | 槽不在当前节点 | 客户端开启集群模式（`redis-cli -c`） |
| `ASK 3999 ...` | 槽正在迁移中 | 客户端发 `ASKING` 后重试（客户端库自动处理） |
| `CLUSTERDOWN The cluster is down` | 槽覆盖不完整 | `CLUSTER INFO` 查 `slots_assigned` |
| `BUSY Redis is busy running a script` | Lua 脚本超时 | `SCRIPT KILL`（未写）/ `SHUTDOWN NOSAVE`（已写） |
| `ERR max number of clients reached` | 连接数打满 | 查 `CLIENT LIST` 泄漏源；调 `maxclients` |
| 周期性延迟毛刺 | `BGSAVE` fork 开销、大 key、THP | 控制单实例内存、关 THP、拆大 key |
| 主从全量同步反复发生 | `repl-backlog-size` 太小 | 调大积压缓冲区 |
| 内存持续增长但 key 数不涨 | 碎片或客户端缓冲区 | `MEMORY DOCTOR`、查 `client-output-buffer-limit` |

## 十七、操作红线

1. **生产禁用**：`KEYS`、`FLUSHALL`、`FLUSHDB`、`MONITOR`、`SAVE`（改 `BGSAVE`）、`DEBUG` 系列。
2. **大 key 是万恶之源**：单 key 超过 10MB 就该拆。`redis-cli --bigkeys` 定期巡检；删除大 key 用 `UNLINK` 而非 `DEL`。
3. **别把 Redis 当唯一数据源**，除非你同时具备：AOF `everysec` + 主从/哨兵 + 定期异地归档 + **演练过的恢复流程**。
4. **集群多 key 必须同槽**，但 hash tag 别过度集中以免数据倾斜。
5. **Lua 脚本别写死循环**，脚本执行期间整个实例阻塞。
6. **`maxmemory` 必须显式设置**，且留出 fork COW 的余量（一般不超过物理内存的 70%~75%）。
7. **明确回答一个问题**：数据丢了能不能接受？答案决定你要不要淘汰策略、要不要持久化、要不要落地数据库。

## 参考来源

- Redis 官方文档与命令参考：redis.io/docs（各命令页标注了"Available since"版本）
- Redis Open Source 8.10 发布说明：8.10.0 于 **2026-07-29** GA，8.10.1 为 **2026-08** 的安全修复版本（含 CVE-2026-62356）——redis.io/docs/.../redisos-8.10-release-notes
- Redis 许可说明：redis.io/legal/licenses（8.0+ 为 RSALv2/SSPLv1/AGPLv3 三许可；7.4~7.8 仅 RSALv2/SSPLv1；7.2.x 及更早为 BSD-3-Clause）
- Redis Community Edition 7.4 发布说明：字段级 TTL 的 9 个命令（HEXPIRE/HPEXPIRE/HEXPIREAT/HPEXPIREAT/HTTL/HPTTL/HEXPIRETIME/HPEXPIRETIME/HPERSIST）自 **7.4.0** 引入
- Valkey 项目与许可：valkey.io（Linux Foundation 治理，BSD-3-Clause，自 Redis 7.2.4 分叉）

**提醒**：本文命令基于 Redis 8.x 整理。Redis 迭代节奏快（8.0 之后陆续有 8.2/8.4/8.6/8.8/8.10），新命令与默认参数可能随版本调整；上线前请以官方文档当日口径为准，并用 `COMMAND INFO <cmd>`（6.0+）在目标实例上核对命令是否存在。
