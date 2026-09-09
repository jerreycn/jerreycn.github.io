# 个人网站（零框架 · GitHub Pages）

纯 HTML + CSS + 原生 JS 的个人网站，无任何构建工具和框架。Markdown 渲染用本地内置的 `marked.min.js`（MIT 协议，已下载到 `vendor/`，不依赖 CDN）。

## 一、发布到 GitHub（一次性）

1. 在 GitHub 新建一个**公开**仓库，命名为 `<你的用户名>.github.io`（用户名小写）
2. 把本目录推上去：

   ```bash
   cd personal-site
   git remote add origin https://github.com/<你的用户名>/<你的用户名>.github.io.git
   git push -u origin main
   ```

3. 打开仓库 **Settings → Pages → Build and deployment → Source 选 "GitHub Actions"**
4. 等 1~2 分钟，访问 `https://<你的用户名>.github.io/`

## 二、发布新文章（日常操作，两步）

1. 在 `posts/` 目录新建 `my-post.md`，用 Markdown 写（可复制 `_template.md`）
2. 打开 `data/content.json`，在 `posts` 数组里加一条：

   ```json
   {
     "slug": "my-post",
     "date": "2026-09-10",
     "title": "文章标题",
     "summary": "一句话摘要",
     "tags": ["标签"]
   }
   ```

3. `git add . && git commit -m "new post" && git push`，1~2 分钟后自动上线

> 注意：`slug` 必须和文件名一致（不含 `.md`），且文件名建议英文小写 + 中划线。

## 三、修改个人信息

编辑 `data/content.json` 的 `profile` 字段：名字、签名、头像 URL、简介、社交链接。头像建议用外链（比如 GitHub 头像 URL），不要把大图 commit 进仓库。

## 四、本地预览

`fetch()` 在 `file://` 协议下无法工作，需要起一个本地 HTTP 服务：

```bash
cd personal-site
python -m http.server 8080
# 浏览器打开 http://localhost:8080
```

## 五、文件结构

```
personal-site/
├── index.html          # 首页：个人资料 + 文章列表
├── article.html        # 文章页：article.html?post=<slug>
├── style.css           # 样式（自动适配系统深/浅色模式）
├── app.js              # 渲染逻辑（fetch content.json + marked 渲染）
├── data/content.json   # ⭐ 唯一需要经常改的文件（个人资料 + 文章索引）
├── posts/              # ⭐ 文章目录，每篇一个 .md 文件
│   ├── hello-world.md
│   └── _template.md    # 文章模板，复制它开始写
├── vendor/marked.min.js
└── .github/workflows/pages.yml   # push 后自动部署
```
