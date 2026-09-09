# 你好，世界

这是你的第一篇文章。本站没有任何框架，写文章就是写 Markdown。

## 如何发布新文章（只需两步）

1. 在 `posts/` 目录新建一个文件，比如 `my-first-post.md`，用 Markdown 写内容；
2. 打开 `data/content.json`，在 `posts` 数组里加一条记录：

```json
{
  "slug": "my-first-post",
  "date": "2026-09-10",
  "title": "我的第一篇文章",
  "summary": "一句话摘要，显示在首页列表里。",
  "tags": ["随笔"]
}
```

push 到 GitHub 后，访问 `https://你的用户名.github.io/` 就能看到新文章了。

## Markdown 常用语法

- **加粗**、*斜体*、`行内代码`
- [链接](https://github.com)
- 列表、引用：

> 这是一段引用。

```python
# 代码块
print("hello")
```

| 表格 | 示例 |
| ---- | ---- |
| A    | 1    |
| B    | 2    |

## 注意事项

- 文件名（slug）建议用英文小写 + 中划线，如 `my-first-post`；
- `content.json` 里的 `slug` 必须和文件名完全一致（不含 .md 后缀）；
- 图片建议用图床或直接引用 GitHub 上的图片链接，避免把大图 commit 进仓库。
