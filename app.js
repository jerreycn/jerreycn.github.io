/* ============================================================
 * app.js — 零框架渲染逻辑
 * 首页(index.html)：渲染个人资料 + 文章列表（数据来自 data/content.json）
 * 文章页(article.html?post=<slug>)：按 slug 加载 posts/<slug>.md 并渲染
 * ============================================================ */

(function () {
  "use strict";

  // 加时间戳避免 GitHub Pages / 浏览器缓存旧 JSON
  function loadContent() {
    return fetch("./data/content.json?v=" + Date.now())
      .then(function (res) {
        if (!res.ok) throw new Error("content.json 加载失败: " + res.status);
        return res.json();
      });
  }

  function el(id) { return document.getElementById(id); }

  /* ---------------- 首页 ---------------- */
  function renderIndex(data) {
    var p = data.profile || {};

    el("profile-name").textContent = p.name || "My Site";
    el("profile-tagline").textContent = p.tagline || "";
    el("profile-bio").textContent = p.bio || "";
    el("footer-name").textContent = p.name || "";
    el("year").textContent = new Date().getFullYear();
    document.title = (p.name || "My Site") + " - 个人网站";

    if (p.avatar) {
      var img = el("avatar");
      img.src = p.avatar;
      img.hidden = false;
    }

    var social = el("social");
    social.innerHTML = "";
    (p.social || []).forEach(function (s) {
      var a = document.createElement("a");
      a.href = s.url;
      a.target = "_blank";
      a.rel = "noopener";
      a.textContent = s.label;
      social.appendChild(a);
    });

    var list = el("post-list");
    list.innerHTML = "";
    var posts = (data.posts || []).slice().sort(function (a, b) {
      return (b.date || "").localeCompare(a.date || "");
    });

    if (posts.length === 0) {
      list.innerHTML = '<li class="muted">还没有文章，去 data/content.json 里添加吧。</li>';
      return;
    }

    posts.forEach(function (post) {
      var li = document.createElement("li");
      li.className = "post-item";

      var titleLink = document.createElement("a");
      titleLink.href = "./article.html?post=" + encodeURIComponent(post.slug || "");
      titleLink.textContent = post.title || "无标题";

      var summary = document.createElement("p");
      summary.className = "post-summary";
      summary.textContent = post.summary || "";

      var meta = document.createElement("div");
      meta.className = "post-date";
      meta.textContent = post.date || "";

      (post.tags || []).forEach(function (t) {
        var tag = document.createElement("span");
        tag.className = "tag";
        tag.textContent = t;
        meta.appendChild(tag);
      });

      li.appendChild(titleLink);
      li.appendChild(summary);
      li.appendChild(meta);
      list.appendChild(li);
    });
  }

  /* ---------------- 文章页 ---------------- */
  function renderArticle(data) {
    el("year").textContent = new Date().getFullYear();

    var params = new URLSearchParams(location.search);
    var slug = params.get("post");
    if (!slug) { showError("缺少文章参数，请从首页进入。"); return; }

    var post = (data.posts || []).find(function (p) { return p.slug === slug; });

    var mdUrl = "./posts/" + encodeURIComponent(slug) + ".md?v=" + Date.now();
    fetch(mdUrl)
      .then(function (res) {
        if (!res.ok) throw new Error("文章不存在（" + res.status + "）");
        return res.text();
      })
      .then(function (md) {
        // 去掉 Markdown 文件顶部的 YAML front-matter（--- ... ---）
        md = md.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, "");

        var title = (post && post.title) || firstHeading(md) || slug;
        document.title = title + " - 文章";
        el("post-title").textContent = title;
        el("post-meta").textContent = (post && post.date ? post.date : "") +
          ((post && post.tags && post.tags.length) ? " · " + post.tags.join(" / ") : "");

        el("post-content").innerHTML = marked.parse(md);
      })
      .catch(function (err) {
        showError(err.message || "加载失败");
      });
  }

  function firstHeading(md) {
    var m = md.match(/^#\s+(.+)$/m);
    return m ? m[1].trim() : null;
  }

  function showError(msg) {
    el("post-title").textContent = "出错了";
    el("post-content").innerHTML = '<p class="muted">' + msg + "</p>";
  }

  /* ---------------- 入口 ---------------- */
  document.addEventListener("DOMContentLoaded", function () {
    loadContent()
      .then(function (data) {
        if (document.getElementById("post-list")) renderIndex(data);
        if (document.getElementById("post-content")) renderArticle(data);
      })
      .catch(function (err) {
        console.error(err);
        var list = document.getElementById("post-list");
        if (list) list.innerHTML = '<li class="muted">数据加载失败：' + err.message + "</li>";
      });
  });
})();
