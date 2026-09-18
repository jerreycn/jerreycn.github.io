# 达梦数据库（DM）常用命令及使用说明

> 信创场景下最常见的国产数据库。本文按「装完之后每天真正会用到的命令」组织：初始化、启停、disql 连接、表空间、备份还原、参数管理到故障排查。基于 **DM8** 整理，并标注了 **DM9** 的差异。

![服务器机柜](https://thumb.wikimedia.org/wikipedia/commons/thumb/f/fa/Rack_with_varoius_servers.jpg/960px-Rack_with_varoius_servers.jpg)
*达梦支持集中式与分布式一体化部署，从单机到共享存储集群都跑在同一套代码上（图：Wikimedia Commons）*

## 一、先说清楚：现在的达梦是什么版本

| 版本 | 状态 | 说明 |
| ---- | ---- | ---- |
| **DM8** | 仍在大量生产环境运行 | 目前绝大多数信创项目的实际载体，本文命令基本通用 |
| **DM9** | 2026-04-22 正式发布 | 第 9 代产品，官方称在 DM8 基础上完成 **450 余项**新特性升级；集中式与分布式一体化架构，内置数据库设计与运维智能体；2026 年上半年已迭代到 DM9.1 |

选型提醒：**DM8 用户可依据授权协议升级到 DM9**，但生产环境换大版本仍需完整的兼容性测试与回退预案。本文命令以 DM8 为准（DM9 保持向下兼容）。

## 二、必须先懂的六个概念，否则命令会用错

**1. 达梦的「模式（Schema）」和「用户」是绑定的** —— 建一个用户，就自动有一个同名模式。所以 `SYSDBA` 用户的表在 `SYSDBA` 模式下，业务用户 `APP` 的表在 `APP` 模式下。迁移时常被 `模式名.表名` 的写法绊住，根源就在这里。

**2. 建库参数初始化后就改不了了** ⚠️ —— 这是达梦最经典的坑。下面这些参数**只能在 `dminit` 初始化时确定**，之后想改必须重新初始化 + 数据迁移：

| 参数 | 影响 |
| ---- | ---- |
| `PAGE_SIZE` | 页大小（4/8/16/32K）。单行数据不能跨页，页越大单行能存的数据越多 |
| `EXTENT_SIZE` | 簇大小，影响大表空间利用率 |
| `CHARSET` | 字符集，**建库时定 UTF-8，别用默认的 GB18030** |
| `CASE_SENSITIVE` | 大小写是否敏感，决定 `"t1"` 和 `T1` 是不是同一张表 |
| `LENGTH_IN_CHAR` | `VARCHAR(10)` 按字节还是按字符（中文场景影响巨大） |

**3. 达梦是单进程多线程架构** —— 没有 Oracle 那样一堆后台进程，`V$SESSIONS` 里**只显示用户会话**，看不到后台线程。

**4. 三权分立** —— `SYSDBA`（数据库管理员）、`SYSSSO`（安全保密员）、`SYSAUDITOR`（安全审计员），初始化时可分别设置口令。这是等保/密评场景的硬要求。

**5. 兼容模式 `COMPATIBLE_MODE`** —— 用于切换对 Oracle / MySQL / PG 等语法行为的兼容程度，属 **in file 类型参数，改完必须重启**。具体取值含义请以官方手册为准（各版本有差异，别照抄博客）。

**6. 文件体系**：

| 文件 | 作用 |
| ---- | ---- |
| `dm.ini` | 数据库主配置文件（实例级参数都在这里） |
| `dm.ctl` | 控制文件，记录数据文件与日志的元信息，**丢了很麻烦，务必单独备份** |
| `*.DBF` | 数据文件（表空间的实际载体） |
| `*.log` / 归档目录 | 联机日志与归档日志，PITR 依赖归档 |

## 三、安装目录与工具一览

装完后，两个目录决定了你 90% 的操作：

```bash
# 假设安装目录为 /dm8（DM_HOME）
/dm8/bin/     # 命令行工具
/dm8/tool/    # 图形化工具
/dm8/script/root/   # 服务注册等 root 脚本
/dm8/data/DAMENG/   # 默认实例的数据目录（dm.ini 在这里）
```

**命令行工具（`/dm8/bin`）**：

| 命令 | 用途 | 一句话用法 |
| ---- | ---- | ---- |
| `dminit` | 初始化数据库实例 | `dminit path=/dm8/data DB_NAME=DMDB` |
| `dmserver` | 启动/停止数据库服务（前台） | `dmserver /dm8/data/DAMENG/dm.ini` |
| `disql` | 命令行客户端（≈ Oracle 的 sqlplus） | `disql SYSDBA/SYSDBA@localhost:5236` |
| `dmrman` | 脱机物理备份还原（≈ Oracle RMAN） | `dmrman` 后执行 `backup database ...` |
| `dexp` / `dimp` | 逻辑导出 / 导入（≈ exp/imp） | `dexp USERID=SYSDBA/SYSDBA FULL=Y ...` |
| `dexpdp` / `dimpdp` | 服务端版本的逻辑导入导出 | 同上，文件落在数据库服务器上 |
| `dmfldr` | 快速数据装载（导入大文本/CSV） | `dmfldr USERID=... CONTROL=...` |
| `dm_service_installer.sh` | 注册系统服务（需 root） | 见下节 |

**图形化工具（`/dm8/tool`）**：`manager`（管理工具，日常最常用）、`console`（控制台：脱机备份还原、参数修改）、`dts`（数据迁移，从 Oracle/MySQL 等迁入）、`monitor`（性能监视）、`nca.sh`（服务名配置）。

## 四、初始化与启停

```bash
# 1) 环境变量（建议写进 dmdba 用户的 ~/.bash_profile）
export DM_HOME=/dm8
export PATH=$DM_HOME/bin:$PATH
export LD_LIBRARY_PATH=$DM_HOME/bin:$LD_LIBRARY_PATH

# 2) 初始化实例（关键一步，参数一旦定下不可改）⚠️
cd /dm8/bin
./dminit path=/dm8/data DB_NAME=DMDB INSTANCE_NAME=DMSERVER PORT_NUM=5236 \
          PAGE_SIZE=32 EXTENT_SIZE=32 CASE_SENSITIVE=y CHARSET=1
# 不带参数直接运行 ./dminit 会打印全部可配置项与默认值——不确定就先看它 ⭐
# 提示：字符集部分版本/资料也写作 CHARSET=1208（同为 UTF-8），以本机 dminit 输出为准

# 3) 前台启动（首次初始化后建议先这样起一次，看有没有报错）
./dmserver /dm8/data/DMDB/dm.ini
```

**注册为系统服务**（root 操作，之后就能用 `systemctl` 管理）：

```bash
cd /dm8/script/root
./dm_service_installer.sh -t dmserver -dm_ini /dm8/data/DMDB/dm.ini -p DMSERVER
# 生成的服务器名即 DmServiceDMSERVER（-p 指定的后缀）

systemctl start   DmServiceDMSERVER
systemctl stop    DmServiceDMSERVER
systemctl status  DmServiceDMSERVER
systemctl enable  DmServiceDMSERVER     # 开机自启

# 辅助服务：备份等操作依赖它，很多"备份报错"其实是这个没起 ⚠️
systemctl status DmAPService
```

> 若用 `dmserver` 手工注册的服务（无 systemd），老写法是 `DmServiceDMSERVER start|stop|status`，路径在 `/dm8/bin` 或 `/etc/rc.d/init.d` 下，两种方式都存在，看你的安装方式。

## 五、用 disql 连接与交互

![命令行终端](https://thumb.wikimedia.org/wikipedia/commons/thumb/d/d0/Ubuntu-terminal-Screenshot20181112.png/960px-Ubuntu-terminal-Screenshot20181112.png)
*disql 是达梦的命令行客户端，交互体验与 Oracle 的 sqlplus 很接近（图：Wikimedia Commons）*

```bash
# 连接：默认端口 5236；省略 host 即本地
disql SYSDBA/SYSDBA@localhost:5236
disql SYSDBA/SYSDBA                 # 等价于 @localhost:5236

# 密码含特殊字符时加引号（Linux 下注意转义）
disql SYSDBA/'"Dameng@1234"'@127.0.0.1:5236

# 只登录一次，失败即退出（脚本里用）
disql -L SYSDBA/SYSDBA@localhost:5236

# 不登录进交互界面（只做本地设置）
disql /NOLOG

# 直接执行一条 SQL 并退出 ⭐
disql SYSDBA/SYSDBA@localhost:5236 -e "select status\$ from v\$instance;"

# 登录时直接跑脚本（Linux 下反引号要转义）⭐
disql SYSDBA/SYSDBA@localhost:5236 \` /dm8/samples/instance_script/dmhr/1-CREATESCHEMA.sql
```

**进入 disql 之后**（提示符 `SQL>`）：

| 命令 | 作用 |
| ---- | ---- |
| `start /path/a.sql` | 执行 SQL 脚本（等价于 `` ` /path/a.sql ``） |
| `host df -Th` | 执行操作系统命令 ⭐ |
| `LOGIN` / `CONN` | 切换到另一个实例/用户 |
| `spool /tmp/a.log` | 会话输出落盘（排查、留证） |
| `shutdown immediate` | 关闭数据库实例 |
| `exit` | 退出 disql |
| `help` | 帮助 |

> 注意：**SQL 语句必须以分号 `;` 结束**；而创建触发器、存储过程、函数、包、模式这类语句块要用 **`/` 单独一行结束**（和 Oracle 一个规矩）。

**用服务名连多台（读写分离/主备切换场景）**：编辑 `dm_svc.conf`（Linux 在 `/etc/dm_svc.conf`），配置后可自动故障转移：

```
TIME_ZONE=(480)
LANGUAGE=(cn)
DMCLUSTER=(192.168.1.150:5236, 192.168.1.151:5236)
```

```bash
disql SYSDBA/Dameng_123@DMCLUSTER    # 第一个 IP 连不通会自动尝试下一个 ⭐
```

## 六、用户、模式与权限

```sql
-- 建用户（同时自动产生同名模式）⭐
CREATE USER APP IDENTIFIED BY "App_2026!";
GRANT DBA TO APP;                             -- 生产环境按最小权限给，别随手 DBA
GRANT RESOURCE, PUBLIC TO APP;

ALTER USER APP IDENTIFIED BY "NewPwd_2026!";  -- 改密码
ALTER USER APP ACCOUNT LOCK;                  -- 锁定（离职、异常登录）
ALTER USER APP ACCOUNT UNLOCK;
DROP USER APP CASCADE;                        -- 连对象一起删 ⚠️

-- 查用户与其模式
SELECT USERNAME, ACCOUNT_STATUS, DEFAULT_TABLESPACE FROM DBA_USERS;
SELECT NAME FROM SYSOBJECTS WHERE TYPE$ = 'SCH';   -- 或 SELECT * FROM DBA_USERS;
```

| 内置用户 | 角色 |
| ---- | ---- |
| `SYSDBA` | 数据库管理员，权限最大 |
| `SYSSSO` | 安全保密员（三权分立） |
| `SYSAUDITOR` | 安全审计员（三权分立） |

> **操作系统认证**：把 OS 用户加进 `dmdba` / `dmsso` / `dmauditor` / `dmusers` 用户组，即可免密登录对应的数据库用户（`disql / AS SYSDBA`）。

## 七、表空间与数据文件

![存储阵列](https://thumb.wikimedia.org/wikipedia/commons/thumb/8/8a/3PAR_SAN_in_the_server_room.jpg/960px-3PAR_SAN_in_the_server_room.jpg)
*达梦的数据最终落在表空间对应的 DBF 数据文件上；生产环境通常规划在独立存储上（图：Wikimedia Commons）*

```sql
-- 建表空间（达梦语法与 Oracle 高度一致）⭐
CREATE TABLESPACE APP_DATA
  DATAFILE 'APP_DATA01.DBF' SIZE 128 AUTOEXTEND ON NEXT 32 MAXSIZE 8192;

-- 加数据文件、扩空间
ALTER TABLESPACE APP_DATA ADD DATAFILE 'APP_DATA02.DBF' SIZE 64 AUTOEXTEND ON NEXT 32;
ALTER TABLESPACE APP_DATA RESIZE DATAFILE 'APP_DATA01.DBF' TO 256;   -- 语法以本版本手册为准

-- 用表空间建表
CREATE TABLE APP.T_ORDER (
  ID        BIGINT IDENTITY(1,1) PRIMARY KEY,
  ORDER_NO  VARCHAR(64) NOT NULL,
  AMOUNT    DECIMAL(14,2) DEFAULT 0,
  CREATED   TIMESTAMP DEFAULT SYSDATE
) STORAGE (ON APP_DATA);

-- 查表空间与数据文件
SELECT NAME, STATUS$, TOTAL_SIZE FROM V$TABLESPACE;
SELECT TABLESPACE_NAME, FILE_NAME, BYTES/1024/1024 AS MB, AUTOEXTENSIBLE FROM DBA_DATA_FILES;
```

**表空间规划建议**：系统表空间（`SYSTEM`）别放业务表；把热点业务表、索引分开到独立表空间，既便于按表空间做备份，也便于空间告警时定位是哪个业务撑爆的。

## 八、表与数据操作（DM 语法要点）

```sql
-- 达梦兼容 Oracle 风格，DUAL 表是存在的
SELECT 1 FROM DUAL;
SELECT SYSDATE, USER, CURRENT_SCHEDULER;

-- 序列
CREATE SEQUENCE SEQ_ORDER START WITH 1000 INCREMENT BY 1 NOCACHE;
SELECT SEQ_ORDER.NEXTVAL;
SELECT SEQ_ORDER.CURRVAL;

-- 自增列（达梦惯用写法）⭐
CREATE TABLE APP.T_LOG (
  ID      BIGINT IDENTITY(1,1) PRIMARY KEY,
  MSG     VARCHAR(2000),
  LOG_TIME TIMESTAMP DEFAULT SYSDATE
);

-- 分页（达梦两种写法都支持）
SELECT * FROM APP.T_LOG ORDER BY ID LIMIT 20 OFFSET 40;
SELECT * FROM (SELECT ROWNUM RN, A.* FROM APP.T_LOG A WHERE ROWNUM <= 60) WHERE RN > 40;

-- 表注释、列注释
COMMENT ON TABLE APP.T_LOG IS '操作日志';
COMMENT ON COLUMN APP.T_LOG.MSG IS '日志内容';

-- 查询元数据
SELECT TABLE_NAME, NUM_ROWS FROM DBA_TABLES WHERE OWNER = 'APP';
SELECT * FROM DBA_TAB_COLUMNS WHERE TABLE_NAME = 'T_LOG';
```

> **`VARCHAR` 的长度语义**：取决于初始化时的 `LENGTH_IN_CHAR`。若按字节，`VARCHAR(50)` 存中文只能存 16 个左右。存量系统改不了这个参数，只能把字段定义放大——这也是迁移时最容易被忽略的一点，建库前务必想清楚。

## 九、备份与还原

达梦有两套备份体系，**两者不是替代关系，生产环境通常都要**。

### 1. 逻辑备份：dexp / dimp（在线、可跨库迁移）

```bash
# 导出：USERID 必须写在最前面
./dexp USERID=SYSDBA/'"Dameng@1234"'@127.0.0.1:5236 \
      FILE=dm_full.dmp LOG=dm_full.log DIRECTORY=/backup FULL=Y

# 导入
./dimp USERID=SYSDBA/'"Dameng@1234"'@127.0.0.1:5236 \
      FILE=/backup/dm_full.dmp LOG=dm_imp.log DIRECTORY=/backup FULL=Y
```

**四个导出层级**（按需选，小范围迁移别整库）：

| 层级 | 参数 | 场景 |
| ---- | ---- | ---- |
| 整库 | `FULL=Y` | 整库搬迁、空库初始化 |
| 用户 | `OWNER=APP` | 按业务用户迁移 |
| 模式 | `SCHEMAS=APP` | 按模式迁移（注意表名/模式名会自动转大写，小写对象要加双引号） |
| 表 | `TABLES=APP.T_ORDER` | 单表备份/恢复 |

**常用参数**（挑几个真正常用的）：

| 参数 | 作用 |
| ---- | ---- |
| `QUERY='WHERE ID<=10000'` | 条件导出（Linux 下注意 shell 转义） |
| `SHOW=Y` | **只查看不导入**，导入前先确认文件内容，强烈建议 ⭐ |
| `ROWS=N` | 只导结构不导数据 |
| `TABLE_EXISTS_ACTION` | 目标表已存在时的策略：`SKIP`/`APPEND`/`TRUNCATE`/`REPLACE`，**导入已有库前必须选对** ⚠️ |
| `REMAP_SCHEMA=A:B` | 模式映射，导入到不同模式 |
| `REMAP_TABLESPACE=A:B` | 表空间映射（目标库表空间规划不同时必用） |
| `PARALLEL` / `TABLE_PARALLEL` | 并行度，大数据量提速 |
| `COMPILE=Y`（dimp） | 导入后编译视图/存储过程 |
| `IGNORE=Y`（dimp） | 忽略导入过程中的错误 |

> **前提**：导入端的数据库版本 **必须 ≥ 导出端**；否则可能因元数据不兼容失败。

### 2. 物理备份：dmrman / 联机 backup（快、能恢复到任意时间点）

**联机备份**（数据库 OPEN 状态，在 disql 里执行）：

```sql
backup database full backupset '/backup/db_full_01' compressed;          -- 全库
backup database increment backupset '/backup/db_inc_01';                 -- 增量（需先有全备）
backup tablespace APP_DATA full backupset '/backup/ts_app_01';           -- 表空间
backup table APP.T_ORDER backupset '/backup/t_order_01';                 -- 单表
backup archive log backupset '/backup/arch_01';                          -- 归档日志
```

**脱机备份**（数据库关闭，用 `dmrman`；需 `DmAPService` 在跑）：

```bash
dmrman
RMAN> backup database '/dm8/data/DAMENG/dm.ini' full backupset '/backup/db_cold_01';
RMAN> check backupset '/backup/db_cold_01';        # 校验备份集是否可用 ⭐
RMAN> show  backupset '/backup/db_cold_01';        # 看内容
RMAN> exit
```

**还原四步法**（顺序不能错，很多"还原后起不来"都是漏了第四步）⚠️：

```bash
# 前提：数据库必须已停止
systemctl stop DmServiceDMSERVER

dmrman
RMAN> restore database '/dm8/data/DAMENG/dm.ini' from backupset '/backup/db_full_01';   # 1. 还原数据文件
RMAN> recover database '/dm8/data/DAMENG/dm.ini' from backupset '/backup/db_full_01';   # 2. 用备份集重做日志
RMAN> recover database '/dm8/data/DAMENG/dm.ini' with archivedir '/dm8/arch';           # 2'. 或用归档做时间点恢复
RMAN> recover database '/dm8/data/DAMENG/dm.ini' update db_magic;                       # 3. 更新魔数 ⭐
RMAN> exit

systemctl start DmServiceDMSERVER
```

| 概念 | 含义 |
| ---- | ---- |
| **RESTORE** | 把备份集里的数据文件拷回磁盘 |
| **RECOVER** | 重做日志、回滚未提交事务，把库拉到一致状态 |
| **update db_magic** | 更新数据库魔数——**还原后必须执行**，否则实例起不来 |
| 归档模式 | 想支持增量备份与时间点恢复，必须先开归档：`dm.ini` 中 `ARCH_INI=1` + 配置 `dmarch.ini`，并重启生效 |

## 十、参数管理（**这里有坑，看官方口径**）

**查看参数**：

```sql
SELECT * FROM V$DM_INI WHERE PARA_NAME = 'MAX_BUFFER';
-- 关键列：PARA_VALUE（当前值）、SESS_VALUE（内存中的值）、FILE_VALUE（配置文件中的值）
```

**修改参数**（`SP_SET_PARA_VALUE` 的 scope 语义，官方手册口径）：

| 函数 | scope | 行为 |
| ---- | ---- | ---- |
| `SP_SET_PARA_VALUE(scope, name, value)` | **1** | **内存 + INI 文件同时改，但只能改「动态参数」**；试图改静态参数会直接报错 |
| | **2** | **只改 INI 文件**，静态参数和动态参数都能改，**需重启生效** |
| `SP_SET_PARA_DOUBLE_VALUE` | 同上 | 浮点型参数 |
| `SP_SET_PARA_STRING_VALUE` | 同上 | 字符串型参数 |
| `SF_SET_SESSION_PARA_VALUE(name, value)` | — | 只对当前会话生效 |

> 这段网上博客写反的特别多（很多说"scope=1 能改静态参数"）。以达梦官方《性能优化》文档为准：**想改静态参数用 scope=2，改完记得重启**。

```sql
-- 动态参数：立即生效
SP_SET_PARA_VALUE(1, 'HFS_CACHE_SIZE', 320);
-- 静态参数：只落盘，重启后生效
SP_SET_PARA_VALUE(2, 'MAX_SESSIONS', 500);

-- 达梦也支持 Oracle 风格的 alter system（参数名要加单引号，spfile 前不加 scope=）
ALTER SYSTEM SET 'COMPATIBLE_MODE' = 2 SPFILE;
```

**参数按生效方式分三类**，改之前先确认属于哪类：

| 类型 | 能否在库内修改 | 生效时机 |
| ---- | ---- | ---- |
| `read only` | 不能，只能手改 `dm.ini` | 重启后 |
| `in file` | 能（scope=2） | 重启后 |
| `sys` / `session` | 能（scope=1） | 立即生效 |

## 十一、运维视图与故障排查

![数据库管理工具](https://upload.wikimedia.org/wikipedia/commons/3/3f/Navicat_Premium_v12.png)
*达梦自带 Manager / Console / Monitor 等图形工具，能力与常见数据库管理工具类似（图为通用数据库管理工具界面示意，仅供参照；图：Wikimedia Commons）*

```sql
-- 实例状态：返回 OPEN 为正常 ⭐
SELECT STATUS$, MODE$ FROM V$INSTANCE;

-- 会话：达梦只显示用户会话，没有后台连接
SELECT SESS_ID, USER_NAME, STATE, CLNT_IP, LAST_SEND_TIME, SQL_TEXT
FROM V$SESSIONS WHERE STATE = 'ACTIVE';

-- 杀会话（达梦没有 Oracle 的 alter system kill session）⚠️
SP_CLOSE_SESSION(140723);            -- 参数是 SESS_ID

-- 日志与归档
SELECT * FROM V$RLOG;
SELECT * FROM V$ARCHIVED_LOG ORDER BY FIRST_TIME DESC;

-- 备份历史（查"昨晚的备份到底成没成"）
SELECT * FROM V$RMAN_BACKUP_JOB_DETAILS ORDER BY BEGIN_TIME DESC;

-- 表大小排行，找撑爆磁盘的元凶
SELECT OWNER, SEGMENT_NAME, BYTES/1024/1024 AS MB
FROM DBA_SEGMENTS WHERE SEGMENT_TYPE = 'TABLE'
ORDER BY BYTES DESC LIMIT 10;
```

**故障速查表**：

| 现象 | 优先排查 |
| ---- | ---- |
| 客户端连不上 | `DmAPService`/`DmServiceDMSERVER` 状态、`PORT_NUM` 是否 5236、防火墙、`dm.ini` 里 `LISTEN_IP` |
| 连接数爆满 | `SELECT COUNT(*) FROM V$SESSIONS;` 对比 `MAX_SESSIONS` 参数；应用连接池是否泄漏 |
| 备份报错 | 先看 `DmAPService` 是否启动、备份目录（`dmdba` 用户）权限、磁盘空间 |
| 还原后实例起不来 | **是不是漏了 `update db_magic`** ⚠️ |
| 表导入报"对象已存在" | 用 `SHOW=Y` 先看文件内容，再选 `TABLE_EXISTS_ACTION` |
| 大小写导致"对象不存在" | 建库参数 `CASE_SENSITIVE`；小写对象名必须加双引号 |
| 中文截断 | `LENGTH_IN_CHAR` 与 `VARCHAR` 长度语义；字段是否够长 |

## 十二、迁移与兼容

| 工具 | 用途 |
| ---- | ---- |
| **DTS**（`/dm8/tool/dts`） | 图形化数据迁移，支持从 Oracle / MySQL / SQL Server / PG 等迁入达梦 |
| **DMDIS**（数据集成） | 数据清洗转换整合 |
| **DMDRS**（数据复制） | 异构数据库实时同步，"柔性替代"双轨并行方案的核心 |
| **DMDVS**（数据校验） | 迁移后一致性校验与修复——**割接前的最后一道关** ⭐ |

**从 Oracle 迁到达梦的常见差异**（迁移前先自查）：

1. **空字符串**：Oracle 里 `''` 等价于 NULL，达梦默认按空串处理（是否兼容可配），有 `NOT NULL` 约束的列最容易炸。
2. **分页语法**：`ROWNUM` 嵌套写法、`LIMIT/OFFSET` 都要测一遍。
3. **隐式类型转换**：Oracle 容忍度更高，达梦更严格，字符串与数字比较可能直接报错。
4. **PL/SQL 兼容性**：存储过程、包的兼容度较高但仍需逐个编译验证。
5. **对象名大小写与双引号**：迁移后出现"对象不存在"，九成是这个原因。

## 十三、踩坑与红线

1. **建库参数一次性定死**：`PAGE_SIZE`、`CHARSET`、`CASE_SENSITIVE`、`LENGTH_IN_CHAR` 建库前确认清楚，改的代价是整库重建 + 迁移。
2. **务必单独备份 `dm.ctl` 与 `dm.ini`**：数据文件能还原，控制文件丢了代价极大。
3. **还原必须走完 4 步**：`restore` → `recover` →（如需）`with archivedir` → `update db_magic`。
4. **开归档才有 PITR**：没开归档的库，出事后最多只能回到"昨晚的全备"。
5. **`DBA` 权限不要发给应用账号**：按最小权限给业务账号授权。
6. **导入生产库前先 `SHOW=Y`**，并想清楚 `TABLE_EXISTS_ACTION`，`TRUNCATE` / `REPLACE` 会清数据 ⚠️。
7. **重视 `DmAPService`**：它不启动，很多备份/作业类操作会莫名失败。

## 参考来源

- 达梦在线服务平台官方文档：DIsql 入门（`eco.dameng.com/document/dm/zh-cn/pm/getting-started-disql.html`）、性能优化（`eco.dameng.com/document/dm/zh-cn/ops/performance-optimization`）
- 达梦官方社区技术文章：数据库备份还原（物理备份与逻辑备份）、DM8 备份恢复与快速装载、DM 数据库参数修改
- 达梦数据官网（`www.dameng.com`）：产品与版本信息、客户案例、公司新闻
- 版本与市场信息：DM9 于 2026-04-22 在「2026 中国数据库技术与产业大会」发布（第 9 代，官方称 450 余项新特性升级）；赛迪顾问《2025-2026 年中国平台软件市场研究年度报告》显示 2025 年达梦位居中国数据库管理系统市场厂商排行榜首；达梦数据 2025 年营收 13.06 亿元、同比增长 25.03%（公司公开业绩）

**提醒**：达梦参数默认值、语法细节在不同大版本（DM8 / DM9）间存在差异，本文命令以上述官方渠道为据整理；执行前请以**你所用版本**的官方手册与 `dminit`、`help` 实测输出为准。生产环境操作前务必备份。
