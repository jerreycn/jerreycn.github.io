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
  var POSTS_PER_PAGE = 20;

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

    var posts = (data.posts || []).slice().sort(function (a, b) {
      return (b.date || "").localeCompare(a.date || "");
    });

    var totalPages = Math.max(1, Math.ceil(posts.length / POSTS_PER_PAGE));
    var params = new URLSearchParams(location.search);
    var page = parseInt(params.get("page"), 10);
    if (!page || page < 1) page = 1;
    if (page > totalPages) page = totalPages;

    renderPostList(posts, page);
    renderPagination(page, totalPages);
  }

  function renderPostList(posts, page) {
    var list = el("post-list");
    list.innerHTML = "";

    var start = (page - 1) * POSTS_PER_PAGE;
    var pagePosts = posts.slice(start, start + POSTS_PER_PAGE);

    if (pagePosts.length === 0) {
      list.innerHTML = '<li class="muted">还没有文章，去 data/content.json 里添加吧。</li>';
      return;
    }

    pagePosts.forEach(function (post) {
      var li = document.createElement("li");
      li.className = "post-item";

      var titleLink = document.createElement("a");
      titleLink.href = "./article.html?post=" + encodeURIComponent(post.slug || "");
      titleLink.textContent = post.title || "无标题";

      var summary = document.createElement("p");
      summary.className = "post-summary";
      summary.textContent = post.summary || "";

      var meta = document.createElement("div");
      meta.className = "post-meta-row";

      var dateSpan = document.createElement("span");
      dateSpan.className = "post-date";
      dateSpan.textContent = post.date || "";
      meta.appendChild(dateSpan);

      var tagsSpan = document.createElement("span");
      tagsSpan.className = "post-tags";
      (post.tags || []).forEach(function (t) {
        var tag = document.createElement("span");
        tag.className = "tag";
        tag.textContent = t;
        tagsSpan.appendChild(tag);
      });
      meta.appendChild(tagsSpan);

      li.appendChild(titleLink);
      li.appendChild(summary);
      li.appendChild(meta);
      list.appendChild(li);
    });
  }

  function renderPagination(current, totalPages) {
    var box = el("pagination");
    box.innerHTML = "";
    if (totalPages <= 1) return;

    function pageUrl(n) {
      return n === 1 ? "./" : "./?page=" + n;
    }

    function appendLink(text, targetPage, disabled, current) {
      var a = document.createElement("a");
      a.textContent = text;
      a.href = disabled ? "javascript:void(0)" : pageUrl(targetPage);
      if (disabled) a.className = "pg-disabled";
      if (current) a.className = "pg-current";
      if (!disabled && !current) {
        a.addEventListener("click", function (e) {
          e.preventDefault();
          gotoPage(targetPage);
        });
      }
      box.appendChild(a);
    }

    appendLink("← 上一页", current - 1, current === 1, false);

    var numbers = [];
    if (totalPages <= 10) {
      // 不超过 10 页时全部显示
      for (var i = 1; i <= totalPages; i++) numbers.push(i);
    } else {
      // 超过 10 页：首尾页 + 当前页前后各 3 页，页码总数不超过 10
      var wanted = {};
      wanted[1] = true;
      wanted[totalPages] = true;
      for (var i = Math.max(1, current - 3); i <= Math.min(totalPages, current + 3); i++) {
        wanted[i] = true;
      }
      for (var k = 1; k <= totalPages; k++) {
        if (wanted[k]) numbers.push(k);
      }
    }

    var pages = [];
    numbers.forEach(function (n, idx) {
      if (idx > 0 && n - numbers[idx - 1] > 1) pages.push("…");
      pages.push(n);
    });
    pages.forEach(function (item) {
      if (item === "…") {
        var span = document.createElement("span");
        span.className = "pg-ellipsis";
        span.textContent = "…";
        box.appendChild(span);
      } else {
        appendLink(String(item), item, false, item === current);
      }
    });

    appendLink("下一页 →", current + 1, current === totalPages, false);
  }

  function gotoPage(n) {
    var url = n === 1 ? location.pathname : location.pathname + "?page=" + n;
    history.pushState(null, "", url);
    loadContent().then(function (data) {
      var posts = (data.posts || []).slice().sort(function (a, b) {
        return (b.date || "").localeCompare(a.date || "");
      });
      var totalPages = Math.max(1, Math.ceil(posts.length / POSTS_PER_PAGE));
      renderPostList(posts, n);
      renderPagination(n, totalPages);
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  window.addEventListener("popstate", function () {
    loadContent().then(function (data) {
      if (document.getElementById("post-list")) renderIndex(data);
    });
  });

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
