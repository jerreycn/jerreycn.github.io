# Git 常用命令及使用说明

> 面向日常开发的 Git 速查手册，按使用场景分类，附常用参数说明。

## 一、配置

```bash
git config --global user.name "你的名字"        # 设置全局用户名
git config --global user.email "you@mail.com"   # 设置全局邮箱
git config --global core.editor vim             # 设置默认编辑器
git config --list                               # 查看所有配置
git config --global alias.st status             # 设置别名，之后可用 git st
```

## 二、基础操作

```bash
git init                        # 在当前目录初始化仓库
git clone <url>                 # 克隆远程仓库
git status                      # 查看工作区状态
git add <file>                  # 暂存单个文件
git add .                       # 暂存所有改动
git commit -m "说明"            # 提交暂存区
git commit -am "说明"           # 跳过 add，直接提交已跟踪文件的改动
git log --oneline --graph       # 简洁图形化查看历史
git diff                        # 查看未暂存的改动
git diff --staged               # 查看已暂存未提交的改动
```

## 三、分支操作

```bash
git branch                      # 列出本地分支
git branch dev                  # 创建分支
git switch dev                  # 切换分支（推荐的新写法）
git switch -c dev               # 创建并切换
git merge dev                   # 把 dev 合并到当前分支
git branch -d dev               # 删除已合并的分支
git branch -D dev               # 强制删除未合并的分支
git rebase main                 # 把当前分支变基到 main 上
```

**merge 与 rebase 的区别**：`merge` 保留完整历史并产生合并提交；`rebase` 把提交"搬到"目标分支末尾，历史更线性，但会改写提交，**不要对已推送到公共分支的提交做 rebase**。

## 四、远程操作

```bash
git remote -v                          # 查看远程仓库
git remote add origin <url>            # 添加远程仓库
git push -u origin main                # 首次推送并建立跟踪
git push                               # 推送
git pull                               # 拉取并合并（= fetch + merge）
git pull --rebase                      # 拉取并变基，避免多余的合并提交
git fetch                              # 只拉取，不合并
git push origin --delete dev           # 删除远程分支
```

## 五、撤销与回退

```bash
git restore <file>              # 丢弃工作区改动（未 add）
git restore --staged <file>     # 把文件移出暂存区（未 commit）
git reset --soft HEAD~1         # 撤销上一次提交，改动保留在暂存区
git reset --mixed HEAD~1        # 撤销提交和暂存，改动保留在工作区（默认）
git reset --hard HEAD~1         # 彻底丢弃上一次提交及所有改动 ⚠️ 危险
git revert <commit>             # 生成一个"反向提交"来撤销某次提交，安全可推送
git checkout <commit> -- <file> # 从历史提交中恢复某个文件
```

**reset 与 revert 的选择**：本地未推送的提交用 `reset`；已推送到公共分支的提交用 `revert`，它不改写历史。

## 六、储藏（stash）

临时切分支但不想提交半成品代码时：

```bash
git stash                       # 储藏当前改动
git stash push -m "说明"        # 带说明地储藏
git stash list                  # 查看储藏列表
git stash pop                   # 恢复最近一次储藏并删除记录
git stash apply stash@{1}       # 恢复指定储藏（保留记录）
git stash drop stash@{0}        # 删除指定储藏
```

## 七、标签（tag）

```bash
git tag                         # 列出标签
git tag v1.0.0                  # 打轻量标签
git tag -a v1.0.0 -m "说明"     # 打附注标签（推荐）
git push origin v1.0.0          # 推送单个标签
git push --tags                 # 推送所有标签
git tag -d v1.0.0               # 删除本地标签
```

## 八、排查问题

```bash
git blame <file>                # 查看文件每行最后是谁改的
git bisect start                # 二分法定位引入 bug 的提交
git log -p <file>               # 查看文件的修改历史
git reflog                      # 查看 HEAD 移动记录（找回"丢失"的提交）
git show <commit>               # 查看某次提交的详情
```

> `git reflog` 是后悔药：只要提交过（哪怕被 reset 掉），都能在这里找到它的哈希值，然后 `git reset --hard <hash>` 回去。

## 九、常见场景速查

| 场景 | 命令 |
| ---- | ---- |
| 提交信息写错了（未推送） | `git commit --amend -m "新说明"` |
| 想把多个提交合成一个 | `git rebase -i HEAD~3`（交互式变基） |
| 合并时冲突太多想放弃 | `git merge --abort` |
| 误删了分支 | `git reflog` 找到哈希后 `git branch dev <hash>` |
| 只想提交文件的一部分 | `git add -p`（逐块暂存） |

---

记住三条安全底线：公共分支不 rebase、危险命令想三秒、迷路了先 `git status` 和 `git reflog`。
