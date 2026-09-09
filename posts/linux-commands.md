# Linux 常用命令及使用说明

> 服务器日常运维和开发的高频命令速查，按场景分类。

## 一、文件与目录

```bash
ls -lah                # 列出文件（含隐藏、人类可读的大小）
cd /path/to/dir        # 切换目录，cd ~ 回家目录，cd - 回上个目录
pwd                    # 显示当前目录
mkdir -p a/b/c         # 递归创建多级目录
cp -r src dst          # 复制目录需 -r
mv old new             # 移动/重命名
rm -rf dir             # 递归强制删除 ⚠️ 没有回收站，敲之前看三遍路径
ln -s /real/path link  # 创建软链接
tree -L 2              # 树状显示目录（两层）
stat file              # 查看文件详细元数据
```

## 二、查看文件内容

```bash
cat file               # 输出整个文件
less file              # 分页查看（空格翻页，q 退出，/ 搜索）
head -n 20 file        # 前 20 行
tail -n 20 file        # 后 20 行
tail -f app.log        # 实时追踪日志 ⭐ 运维必备
wc -l file             # 统计行数
diff a.txt b.txt       # 比较两个文件差异
```

## 三、查找与搜索

```bash
find /var/log -name "*.log"            # 按名字找文件
find . -size +100M                     # 找大于 100M 的文件
find . -mtime -7 -type f               # 7 天内修改过的文件
grep -rn "error" ./src                 # 递归搜索关键字（-n 带行号）
grep -i "warning" app.log              # 忽略大小写搜索
grep -C 3 "Exception" app.log          # 显示匹配行前后 3 行上下文
locate nginx.conf                      # 从索引快速定位（需 updatedb）
which python                           # 查看命令的可执行文件位置
```

## 四、文本处理三剑客

```bash
# awk：按列处理
awk '{print $1}' access.log            # 输出第 1 列
awk -F: '{print $1, $3}' /etc/passwd   # 指定冒号为分隔符

# sed：流编辑
sed 's/old/new/g' file.txt             # 全局替换（输出到屏幕）
sed -i 's/8080/9090/g' conf.yml        # 直接修改文件 ⚠️ 先备份
sed -n '10,20p' file.txt               # 打印第 10~20 行

# sort / uniq：排序去重
sort file | uniq -c | sort -rn         # 统计重复行次数并倒序（经典组合）
```

配合管道 `|` 可以把小命令串成强大的流水线，例如统计访问最多的 IP：

```bash
awk '{print $1}' access.log | sort | uniq -c | sort -rn | head -10
```

## 五、权限与用户

```bash
chmod 755 script.sh     # rwxr-xr-x：所有者全权，组和其他人读+执行
chmod +x script.sh      # 添加可执行权限
chown user:group file   # 改文件属主属组
sudo -l                 # 查看当前用户可用的 sudo 权限
useradd -m tom          # 创建用户并建家目录
passwd tom              # 设置密码
who / w                 # 查看当前登录用户
su - tom                # 切换用户（带 - 加载环境变量）
```

数字含义：`r`=4、`w`=2、`x`=1，`755` 即 `rwxr-xr-x`。

## 六、进程与系统资源

```bash
ps aux | grep nginx     # 查找进程
top                     # 实时资源监控（P 按CPU排序，M 按内存排序）
htop                    # 更好看的 top（需安装）
kill -9 <pid>           # 强制杀死进程 ⚠️ 先试 kill -15 优雅退出
killall nginx           # 按名字杀进程
nohup cmd &             # 后台运行且退出终端不中断
jobs / fg / bg          # 查看后台任务 / 调回前台 / 继续后台执行
df -h                   # 磁盘空间
du -sh *                # 当前目录下各项占用大小
free -h                 # 内存使用
uptime                  # 负载与运行时长
lsof -i :8080           # 查看端口被哪个进程占用 ⭐
```

## 七、网络

```bash
ping -c 4 host          # 测试连通性
curl -I https://x.com   # 只看响应头
curl -o file url        # 下载文件
wget url                # 下载文件
ssh user@host           # 远程登录
scp file user@host:/p   # 远程复制
rsync -avz src/ host:/dst  # 增量同步（比 scp 高效）
netstat -tlnp           # 监听端口与进程（新系统可用 ss -tlnp）
ip addr                 # 查看 IP（替代旧 ifconfig）
dig domain.com          # DNS 解析查询
```

## 八、压缩与解压

```bash
tar -czvf a.tar.gz dir/     # 打包并 gzip 压缩
tar -xzvf a.tar.gz          # 解压（记法：c=create，x=extract，z=gzip，v=显示，f=文件）
zip -r a.zip dir/           # zip 压缩
unzip a.zip                 # zip 解压
tar -tzf a.tar.gz           # 只查看内容不解压
```

## 九、包管理与系统服务

```bash
# Debian/Ubuntu
apt update && apt install nginx     # 更新索引并安装

# CentOS/RHEL
yum install nginx                   # 或 dnf install nginx

systemctl start nginx               # 启动服务
systemctl enable nginx              # 设置开机自启
systemctl status nginx              # 查看状态
journalctl -u nginx -f              # 追踪某服务的日志
reboot / shutdown -h now            # 重启 / 关机
```

## 十、实用技巧

- `!!` 执行上一条命令，`sudo !!` 用 sudo 重跑上一条
- `Ctrl+R` 搜索历史命令，`history` 查看全部
- `command1 && command2` 前者成功才执行后者；`;` 无条件顺序执行
- 改关键配置前先 `cp conf conf.bak`，比任何后悔药都快

---

命令不用背，用 `man <命令>` 或 `<命令> --help` 随时查，混个眼熟知道"有这个能力"就行。
