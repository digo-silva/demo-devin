(function () {
  "use strict";

  var REPO_OWNER = "digo-silva";
  var REPO_NAME = "demo-devin";
  var BASE_BRANCH = "main";
  var PAT_STORAGE_KEY = "demo-devin.pat";
  var METRICS = ["visits", "commits", "prs", "issues"];
  var METRIC_LABELS = {
    visits: "Visitas hoje",
    commits: "Commits (7d)",
    prs: "Pull requests abertos",
    issues: "Issues em aberto",
  };

  function $(sel, root) {
    return (root || document).querySelector(sel);
  }
  function $$(sel, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(sel));
  }

  /* ---------- Tabs ---------- */

  function activateTab(name) {
    $$(".tab-link").forEach(function (el) {
      el.classList.toggle("active", el.dataset.tab === name);
    });
    $$(".tab-panel").forEach(function (el) {
      el.classList.toggle("active", el.dataset.tabPanel === name);
    });
  }

  function initTabs() {
    $$(".tab-link").forEach(function (el) {
      el.addEventListener("click", function (e) {
        var name = el.dataset.tab;
        if (!name) return;
        e.preventDefault();
        if (history.pushState) {
          history.pushState(null, "", "#" + name);
        } else {
          location.hash = name;
        }
        activateTab(name);
      });
    });
    window.addEventListener("hashchange", function () {
      var name = (location.hash || "#overview").replace("#", "");
      if (name === "overview" || name === "update") activateTab(name);
    });
    var initial = (location.hash || "#overview").replace("#", "");
    if (initial === "update") activateTab("update");
  }

  /* ---------- Load metrics from DB/*.txt ---------- */

  function loadMetric(name) {
    var url = "DB/" + name + ".txt?ts=" + Date.now();
    return fetch(url, { cache: "no-store" })
      .then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.text();
      })
      .then(function (txt) {
        return txt.trim();
      });
  }

  function renderMetric(name, value) {
    var el = document.querySelector('[data-metric="' + name + '"]');
    if (el) el.textContent = value;
    var input = document.getElementById("in-" + name);
    if (input && !input.dataset.dirty) input.value = value;
  }

  function loadAllMetrics() {
    METRICS.forEach(function (name) {
      loadMetric(name)
        .then(function (value) {
          renderMetric(name, value);
        })
        .catch(function () {
          renderMetric(name, "?");
        });
    });
  }

  /* ---------- PAT management ---------- */

  function getPat() {
    try {
      return localStorage.getItem(PAT_STORAGE_KEY) || "";
    } catch (e) {
      return "";
    }
  }
  function setPat(value) {
    try {
      if (value) localStorage.setItem(PAT_STORAGE_KEY, value);
      else localStorage.removeItem(PAT_STORAGE_KEY);
    } catch (e) {}
  }
  function updatePatStatus() {
    var status = document.getElementById("pat-status");
    if (!status) return;
    var pat = getPat();
    if (pat) {
      status.textContent = "Token salvo (termina em …" + pat.slice(-4) + ").";
      status.classList.remove("err");
    } else {
      status.textContent = "Nenhum token salvo ainda.";
    }
  }
  function initPatControls() {
    var input = document.getElementById("pat");
    var toggle = document.getElementById("toggle-pat");
    var save = document.getElementById("save-pat");
    var clear = document.getElementById("clear-pat");
    if (!input) return;

    var existing = getPat();
    if (existing) input.value = existing;

    if (toggle) {
      toggle.addEventListener("click", function () {
        input.type = input.type === "password" ? "text" : "password";
      });
    }
    if (save) {
      save.addEventListener("click", function () {
        var v = input.value.trim();
        setPat(v);
        updatePatStatus();
      });
    }
    if (clear) {
      clear.addEventListener("click", function () {
        input.value = "";
        setPat("");
        updatePatStatus();
      });
    }
    updatePatStatus();
  }

  /* ---------- Status rendering ---------- */

  function showStatus(kind, html) {
    var el = document.getElementById("submit-status");
    if (!el) return;
    el.hidden = false;
    el.className = "status " + kind;
    el.innerHTML = html;
  }

  /* ---------- GitHub API ---------- */

  function gh(path, opts) {
    var pat = getPat();
    if (!pat) return Promise.reject(new Error("Token não configurado. Cole um PAT e clique em 'Salvar token'."));
    opts = opts || {};
    opts.headers = Object.assign(
      {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        Authorization: "Bearer " + pat,
      },
      opts.headers || {}
    );
    return fetch("https://api.github.com" + path, opts).then(function (r) {
      return r.json().then(function (body) {
        if (!r.ok) {
          var msg = (body && body.message) || ("HTTP " + r.status);
          throw new Error(msg);
        }
        return body;
      });
    });
  }

  function b64encode(str) {
    // UTF-8 safe base64
    return btoa(unescape(encodeURIComponent(str)));
  }

  function getRefSha(branch) {
    return gh("/repos/" + REPO_OWNER + "/" + REPO_NAME + "/git/ref/heads/" + encodeURIComponent(branch)).then(
      function (ref) {
        return ref.object.sha;
      }
    );
  }

  function createBranch(branch, fromSha) {
    return gh("/repos/" + REPO_OWNER + "/" + REPO_NAME + "/git/refs", {
      method: "POST",
      body: JSON.stringify({ ref: "refs/heads/" + branch, sha: fromSha }),
    });
  }

  function getFileSha(path, branch) {
    return gh(
      "/repos/" +
        REPO_OWNER +
        "/" +
        REPO_NAME +
        "/contents/" +
        encodeURI(path) +
        "?ref=" +
        encodeURIComponent(branch)
    )
      .then(function (f) {
        return f.sha;
      })
      .catch(function () {
        return null;
      });
  }

  function putFile(path, content, branch, message, sha) {
    var body = {
      message: message,
      content: b64encode(content),
      branch: branch,
    };
    if (sha) body.sha = sha;
    return gh("/repos/" + REPO_OWNER + "/" + REPO_NAME + "/contents/" + encodeURI(path), {
      method: "PUT",
      body: JSON.stringify(body),
    });
  }

  function openPR(branch, title, body) {
    return gh("/repos/" + REPO_OWNER + "/" + REPO_NAME + "/pulls", {
      method: "POST",
      body: JSON.stringify({
        title: title,
        head: branch,
        base: BASE_BRANCH,
        body: body,
      }),
    });
  }

  /* ---------- Submit flow ---------- */

  function formatDiffList(values) {
    return METRICS.map(function (m) {
      return "- **" + METRIC_LABELS[m] + "** (`DB/" + m + ".txt`): `" + values[m] + "`";
    }).join("\n");
  }

  function submitUpdate(values) {
    var ts = Math.floor(Date.now() / 1000);
    var branch = "dashboard/update-" + ts;
    var summary = formatDiffList(values);
    var commitMsg = "chore(dashboard): update DB values\n\n" + summary;
    var prTitle = "Dashboard: atualizar valores (" + ts + ")";
    var prBody =
      "Atualização automática gerada pelo dashboard (`index.html` → aba **Atualização**).\n\n" +
      "## Valores novos\n" +
      summary +
      "\n\nDepois do merge, o GitHub Pages rebuilda e a **Visão geral** passa a exibir os novos números.";

    showStatus("info", "Criando branch <code>" + branch + "</code>…");
    return getRefSha(BASE_BRANCH)
      .then(function (sha) {
        return createBranch(branch, sha);
      })
      .then(function () {
        showStatus("info", "Atualizando arquivos <code>DB/*.txt</code>…");
        // Commit one file at a time (Contents API supports single-file writes).
        return METRICS.reduce(function (p, m) {
          return p.then(function () {
            return getFileSha("DB/" + m + ".txt", branch).then(function (sha) {
              return putFile(
                "DB/" + m + ".txt",
                String(values[m]),
                branch,
                "chore(db): update " + m + " to " + values[m],
                sha
              );
            });
          });
        }, Promise.resolve());
      })
      .then(function () {
        showStatus("info", "Abrindo Pull Request…");
        return openPR(branch, prTitle, prBody);
      })
      .then(function (pr) {
        showStatus(
          "ok",
          "PR criada com sucesso: <a href=\"" +
            pr.html_url +
            "\" target=\"_blank\" rel=\"noopener\">#" +
            pr.number +
            " " +
            pr.title +
            "</a>. Revise e faça merge para atualizar o dashboard."
        );
      })
      .catch(function (err) {
        showStatus("err", "Falha: " + (err && err.message ? err.message : String(err)));
      });
  }

  function initForm() {
    var form = document.getElementById("update-form");
    if (!form) return;

    METRICS.forEach(function (m) {
      var input = document.getElementById("in-" + m);
      if (!input) return;
      input.addEventListener("input", function () {
        input.dataset.dirty = "1";
      });
    });

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var values = {};
      var ok = true;
      METRICS.forEach(function (m) {
        var input = document.getElementById("in-" + m);
        var n = parseInt(input.value, 10);
        if (isNaN(n) || n < 0) ok = false;
        values[m] = n;
      });
      if (!ok) {
        showStatus("err", "Preencha todos os campos com números inteiros ≥ 0.");
        return;
      }
      if (!getPat()) {
        showStatus("err", "Cole um Personal Access Token no campo acima e clique em 'Salvar token' antes de enviar.");
        return;
      }
      var btn = document.getElementById("submit-btn");
      if (btn) {
        btn.disabled = true;
        btn.textContent = "Enviando…";
      }
      submitUpdate(values).then(function () {
        if (btn) {
          btn.disabled = false;
          btn.textContent = "Salvar e abrir PR";
        }
      });
    });

    var reloadBtn = document.getElementById("reload-form");
    if (reloadBtn) {
      reloadBtn.addEventListener("click", function () {
        METRICS.forEach(function (m) {
          var input = document.getElementById("in-" + m);
          if (input) delete input.dataset.dirty;
        });
        loadAllMetrics();
      });
    }
  }

  function initReload() {
    var btn = document.getElementById("reload");
    if (!btn) return;
    btn.addEventListener("click", function () {
      btn.disabled = true;
      btn.textContent = "Recarregando…";
      setTimeout(function () {
        loadAllMetrics();
        btn.disabled = false;
        btn.textContent = "Recarregar";
      }, 200);
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    initTabs();
    initPatControls();
    initForm();
    initReload();
    loadAllMetrics();
  });
})();
