"use strict";
(() => {
  const D = window.STUDY_DATA;
  const DAY = 864e5;
  const KEY = "learnmaxxing.v1";
  const LEGACY_KEY = "chem-study-hub.v1"; // saves made before the rename
  const app = document.getElementById("app");
  const $ = (sel, root = document) => root.querySelector(sel);
  const pad = (n) => String(n).padStart(2, "0");
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const pct = (x) => Math.round(x * 100) + "%";

  /* ---------- storage (every access guarded: private mode can throw) ---------- */
  let S = { q: {}, cards: {}, log: [], sched: {}, settings: {}, ui: null };
  try {
    S = { ...S, ...JSON.parse(localStorage.getItem(KEY) || localStorage.getItem(LEGACY_KEY) || "{}") };
  } catch (e) {
    /* storage blocked or corrupt: start fresh */
  }
  const HUB = window.HubUI || null;
  if (HUB) S.ui = HUB.normalize(S.ui);
  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(S));
      try { localStorage.removeItem(LEGACY_KEY); } catch (e) { /* already gone */ }
    } catch (e) {
      toast("Progress could not be saved in this browser.");
    }
  }

  /* ---------- index the course data ---------- */
  const PARTS = {};
  const QS = [];
  const QMAP = {};
  const CARDS = [];
  const CMAP = {};
  const CHAPS = {};
  D.chapters.forEach((c) => {
    CHAPS[c.num] = c;
    c.parts.forEach((p) => {
      PARTS[p.id] = { ...p, ch: c.num };
      p.questions.forEach((q) => {
        const row = { ...q, part: p.id, ch: c.num, partTitle: p.title };
        QS.push(row);
        QMAP[q.id] = row;
      });
      p.cards.forEach((k) => {
        const row = { ...k, ch: c.num, partTitle: p.title };
        CARDS.push(row);
        CMAP[k.id] = row;
      });
    });
  });

  /* ---------- dates ---------- */
  const startToday = () => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  };
  const endToday = () => startToday() + DAY - 1;
  const isoOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const todayIso = () => isoOf(new Date());
  const daysUntil = (iso) => {
    const [y, m, d] = iso.split("-").map(Number);
    return Math.round((new Date(y, m - 1, d) - startToday()) / DAY);
  };
  const fmtDate = (iso) => {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  };
  const fmtTime = (s) => `${Math.floor(s / 60)}:${pad(s % 60)}`;

  /* ---------- question + card state ---------- */
  const scoreOf = (last) => (last === "got" ? 1 : last === "partial" ? 0.5 : 0);
  const isWeak = (id) => S.q[id] && (S.q[id].last === "missed" || S.q[id].last === "partial");
  const isDue = (id) => S.q[id] && S.q[id].n > 0 && S.q[id].due <= endToday();
  const isCardDue = (id) => S.cards[id] && S.cards[id].due <= endToday();

  function gradeQuestion(id, res) {
    const r = S.q[id] || (S.q[id] = { n: 0, ivl: 0, ease: 2.5, due: 0, last: null, flag: false });
    r.n += 1;
    r.last = res;
    r.at = Date.now();
    if (res === "missed") {
      r.ivl = 1;
      r.ease = Math.max(1.3, r.ease - 0.2);
    } else if (res === "partial") {
      r.ivl = Math.max(1, Math.round(Math.max(r.ivl, 1) * 1.2));
    } else {
      r.ivl = r.ivl < 1 ? 1 : r.ivl < 3 ? 3 : Math.round(r.ivl * r.ease);
      r.ease = Math.min(3, r.ease + 0.1);
    }
    r.due = startToday() + r.ivl * DAY;
    S.log.push({ t: Date.now(), id, res });
    if (S.log.length > 5000) S.log.splice(0, S.log.length - 5000);
    save();
  }

  function gradeCard(id, rating) {
    const r = S.cards[id] || (S.cards[id] = { n: 0, ivl: 0, ease: 2.5, due: 0 });
    r.n += 1;
    if (rating === "again") {
      r.ivl = 0;
      r.ease = Math.max(1.3, r.ease - 0.2);
      r.due = Date.now() + 10 * 60e3;
    } else {
      if (rating === "hard") {
        r.ivl = Math.max(1, Math.round(Math.max(r.ivl, 1) * 1.2));
        r.ease = Math.max(1.3, r.ease - 0.15);
      } else if (rating === "good") {
        r.ivl = r.ivl < 1 ? 1 : r.ivl < 3 ? 3 : Math.round(r.ivl * r.ease);
      } else {
        r.ivl = r.ivl < 1 ? 4 : Math.round(r.ivl * r.ease * 1.3);
        r.ease = Math.min(3, r.ease + 0.15);
      }
      r.due = startToday() + r.ivl * DAY;
    }
    save();
  }

  function flagQuestion(id) {
    const r = S.q[id] || (S.q[id] = { n: 0, ivl: 0, ease: 2.5, due: 0, last: null, flag: false });
    r.flag = !r.flag;
    save();
  }

  function masteryOf(ids) {
    let sum = 0;
    let n = 0;
    ids.forEach((id) => {
      const r = S.q[id];
      if (r && r.last) {
        n += 1;
        sum += scoreOf(r.last);
      }
    });
    return { mastery: n ? sum / n : null, answered: n, total: ids.length };
  }

  const chapterIds = (num) => QS.filter((q) => q.ch === num).map((q) => q.id);
  const partIds = (id) => QS.filter((q) => q.part === id).map((q) => q.id);

  function poolFor(source, chapters) {
    let list = QS.filter((q) => !chapters || chapters.includes(q.ch));
    switch (source) {
      case "unseen":
        list = list.filter((q) => !(S.q[q.id] && S.q[q.id].n));
        break;
      case "weak":
        list = list.filter((q) => isWeak(q.id)).sort((a, b) => scoreOf(S.q[a.id].last) - scoreOf(S.q[b.id].last));
        break;
      case "due":
        list = list.filter((q) => isDue(q.id)).sort((a, b) => S.q[a.id].due - S.q[b.id].due);
        break;
      case "flagged":
        list = list.filter((q) => S.q[q.id] && S.q[q.id].flag);
        break;
      case "practice":
        list = list.filter((q) => q.kind === "practice");
        break;
      case "extra":
        list = list.filter((q) => q.kind === "extra");
        break;
      default:
        break;
    }
    return list.map((q) => q.id);
  }

  const shuffle = (arr) => {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  /* ---------- helpers ---------- */
  const plainOf = (html) => {
    const d = document.createElement("div");
    d.innerHTML = html;
    return d.textContent.replace(/\s+/g, " ").trim();
  };
  const SUP = "⁰¹²³⁴⁵⁶⁷⁸⁹⁻";
  const supToPlain = (s) => [...s].map((c) => (SUP.includes(c) ? (c === "⁻" ? "-" : String(SUP.indexOf(c))) : c)).join("");
  // First number typed by the user, in plain form (handles 2.00 x 10^-19, 2.00e-19, 2.00 × 10⁻¹⁹).
  function parseTyped(text) {
    const s = text
      .replace(/−/g, "-")
      .replace(/,/g, "")
      .replace(/\s*[×x*]\s*10\s*\^?\s*([⁰¹²³⁴⁵⁶⁷⁸⁹⁻]+|-?\d+)/g, (m, e) => "e" + supToPlain(e));
    const m = s.match(/-?\d+(?:\.\d+)?(?:e-?\d+)?/);
    return m ? Number(m[0]) : NaN;
  }
  const hintOf = (html) => {
    const words = plainOf(html).split(" ");
    return words.slice(0, 10).join(" ") + (words.length > 10 ? " …" : "");
  };

  function toast(msg) {
    const el = $("#toast");
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toast.t);
    toast.t = setTimeout(() => el.classList.remove("show"), 2200);
  }

  /* ---------- session state (in memory; progress itself is in S) ---------- */
  let sess = null;
  let timerHandle = null;
  function stopTimer() {
    if (timerHandle) {
      clearInterval(timerHandle);
      timerHandle = null;
    }
  }

  function startSession({ ids, title, shuffleIt = false, count = 0, exam = false, minutes = 0 }) {
    if (!ids.length) {
      toast("No questions match that filter yet.");
      return;
    }
    stopTimer();
    let list = shuffleIt ? shuffle(ids) : ids.slice();
    if (count && count < list.length) list = list.slice(0, count);
    sess = {
      kind: "q",
      title,
      exam,
      ids: list,
      i: 0,
      res: {},
      typed: {},
      cur: { picked: null, revealed: false, hint: false, check: null },
      phase: "take",
      t0: Date.now(),
      left: minutes * 60,
    };
    go("#/session");
  }

  function startCards() {
    const due = CARDS.filter((c) => isCardDue(c.id)).sort((a, b) => S.cards[a.id].due - S.cards[b.id].due);
    const fresh = CARDS.filter((c) => !S.cards[c.id]).slice(0, 15);
    const queue = [...due, ...fresh].map((c) => c.id);
    if (!queue.length) {
      toast("No flashcards due. Nice.");
      return;
    }
    stopTimer();
    sess = { kind: "cards", queue, i: 0, flipped: false, total: queue.length, done: 0 };
    go("#/review");
  }

  /* ---------- router ---------- */
  let current = { name: "", arg: "", params: new URLSearchParams() };
  function go(hash) {
    if (location.hash === hash) route();
    else location.hash = hash;
  }
  function route() {
    const raw = location.hash.replace(/^#\/?/, "");
    const [path, query = ""] = raw.split("?");
    const [name = "", arg = ""] = path.split("/");
    if (!/^(session|review)$/.test(name)) stopTimer();
    current = { name, arg: decodeURIComponent(arg), params: new URLSearchParams(query) };
    document.querySelectorAll("[data-nav]").forEach((a) => {
      const on = a.dataset.nav === (["chapter", "part"].includes(name) ? "chapters" : name === "review" ? "cards" : name === "session" ? "quiz" : name);
      a.classList.toggle("active", on);
    });
    paint();
    window.scrollTo(0, 0);
  }
  function paint() {
    const views = {
      "": viewHome,
      chapters: viewChapters,
      chapter: viewChapter,
      part: viewPart,
      quiz: viewQuizSetup,
      session: viewSession,
      review: viewSession,
      cards: viewCardsHome,
      schedule: viewSchedule,
      reference: viewReference,
      stats: viewStats,
      search: viewSearch,
      upload: viewUpload,
      settings: viewSettings,
    };
    (views[current.name] || viewHome)();
  }

  const bar = (p) => `<div class="bar"><span style="width:${Math.round((p || 0) * 100)}%"></span></div>`;
  const badge = (last) =>
    last === "got" ? '<span class="badge good">Got it</span>'
    : last === "partial" ? '<span class="badge mid">Partial</span>'
    : last === "missed" ? '<span class="badge bad">Missed</span>'
    : '<span class="badge">New</span>';

  /* ---------- views ---------- */
  function viewHome() {
    const today = todayIso();
    const days = daysUntil(D.course.exam);
    const todayTask = D.schedule.find((s) => s.date === today);
    const overall = masteryOf(QS.map((q) => q.id));
    const dueQ = poolFor("due").length;
    const weakQ = poolFor("weak").length;
    const dueC = CARDS.filter((c) => isCardDue(c.id)).length;
    const ring = overall.mastery == null ? 0 : overall.mastery;

    /* Each dashboard block is a widget the student can move, hide or re-add. */
    const parts = {
      countdown: `
      <section class="hero panel">
        <div>
          <p class="eyebrow">${esc(D.course.name)}</p>
          <h1>${days > 0 ? `${days} days to final` : days === 0 ? "Final is today" : "Final has passed"}</h1>
          <p class="sub">Final exam ${fmtDate(D.course.exam)}. Study one part a day, then drill what you missed.</p>
          <div class="today">
            <span class="label">Today, ${fmtDate(today)}</span>
            ${todayTask
              ? `<p>${todayTask.task}</p>${todayTask.href ? `<a class="btn primary" href="${todayTask.href}">Open today's part</a>` : ""}`
              : `<p class="muted">${today < D.course.start ? "Study starts " + fmtDate(D.course.start) + "." : "No scheduled task today."}</p>`}
          </div>
        </div>
        <div class="ring" style="--p:${Math.round(ring * 100)}">
          <div><b>${overall.mastery == null ? "–" : pct(ring)}</b><span>mastery</span></div>
        </div>
      </section>`,

      tiles: `
      <section class="tiles">
        <a class="tile" href="#/quiz?due"><b>${dueQ}</b><span>questions due</span></a>
        <a class="tile" href="#/quiz?weak"><b>${weakQ}</b><span>weak spots</span></a>
        <a class="tile" href="#/cards"><b>${dueC}</b><span>cards due</span></a>
        <a class="tile" href="#/stats"><b>${overall.answered}</b><span>of ${overall.total} answered</span></a>
      </section>`,

      chapters: `
      <section class="grid-cards">
        ${D.chapters.map((c) => {
          const m = masteryOf(chapterIds(c.num));
          return `<a class="card-link" href="#/chapter/${c.num}">
            <span class="num">Ch ${c.num}</span>
            <h3>${esc(c.title)}</h3>
            ${bar(m.mastery)}
            <small>${m.mastery == null ? "Not started" : pct(m.mastery) + " mastery"}</small>
          </a>`;
        }).join("")}
      </section>`,

      uploads: `
      <section class="panel">
        <h2>Your uploads</h2>
        <div id="home-uploads"><p class="muted">Loading…</p></div>
        <a class="btn ghost" href="#/upload">Upload &amp; study</a>
      </section>`,

      schedule: (() => {
        const next = D.schedule
          .filter((s) => s.date >= today)
          .sort((a, b) => a.date.localeCompare(b.date))
          .slice(0, 3);
        if (!next.length) return "";
        return `<section class="panel">
          <h2>Next up</h2>
          <ul class="plain">${next
            .map((s) => `<li><b>${fmtDate(s.date)}</b> — ${s.href ? `<a href="${esc(s.href)}">${esc(s.task)}</a>` : esc(s.task)}</li>`)
            .join("")}</ul>
          <a class="btn ghost" href="#/schedule">Open schedule</a>
        </section>`;
      })(),

      quick: `
      <section class="panel">
        <h2>Jump back in</h2>
        <div class="row">
          <a class="btn primary" href="#/quiz?due">${dueQ ? `Review ${dueQ} due` : "Start a quiz"}</a>
          <a class="btn" href="#/upload">Upload notes</a>
          <a class="btn ghost" href="#/cards">Flashcards</a>
          <a class="btn ghost" href="#/search">Search notes</a>
        </div>
      </section>`,

      photo: S.ui.photo
        ? `<section class="panel home-photo">
            <img src="${esc(S.ui.photo)}" alt="${esc(S.ui.photoCaption || "Your picture")}">
            ${S.ui.photoCaption ? `<p class="muted">${esc(S.ui.photoCaption)}</p>` : ""}
          </section>`
        : "",
    };

    const order = S.ui ? S.ui.widgets : ["countdown", "tiles", "chapters"];
    app.innerHTML = order.map((id) => parts[id] || "").join("\n");
    fillHomeUploads();
  }

  function viewChapters() {
    app.innerHTML = `
      <header class="page-head"><h1>Chapters</h1><p class="sub">${D.chapters.length} chapters, ${QS.length} questions, ${CARDS.length} flashcards.</p></header>
      <section class="grid-cards">
        ${D.chapters.map((c) => {
          const m = masteryOf(chapterIds(c.num));
          return `<div class="panel chapter-card">
            <span class="num">Ch ${c.num}</span>
            <h3><a href="#/chapter/${c.num}">${esc(c.title)}</a></h3>
            ${bar(m.mastery)}
            <small>${m.mastery == null ? "Not started" : pct(m.mastery) + " mastery"} · ${m.answered}/${m.total} answered</small>
            <div class="row">
              <a class="btn ghost" href="#/chapter/${c.num}">Open</a>
              <button class="btn ghost" data-act="quiz-ch" data-ch="${c.num}">Quiz chapter</button>
            </div>
          </div>`;
        }).join("")}
      </section>`;
  }

  function viewChapter() {
    const c = CHAPS[current.arg];
    if (!c) return go("#/chapters");
    const m = masteryOf(chapterIds(c.num));
    app.innerHTML = `
      <p class="crumbs"><a href="#/chapters">Chapters</a> / Ch ${c.num}</p>
      <header class="page-head">
        <h1>Ch ${c.num}: ${esc(c.title)}</h1>
        <p class="sub">${c.lecture ? c.lecture : ""}</p>
      </header>
      <div class="row wrap-row">
        <button class="btn primary" data-act="quiz-ch" data-ch="${c.num}">Quiz this chapter (${m.total})</button>
        ${c.worksheet ? `<a class="btn ghost" href="${encodeURI(c.worksheet)}" target="_blank" rel="noopener">Worksheet PDF</a>` : ""}
        <a class="btn ghost" href="#/cards">Flashcards</a>
      </div>
      <section class="part-list">
        ${c.parts.map((p) => {
          const pm = masteryOf(partIds(p.id));
          return `<a class="panel part-row" href="#/part/${p.id}">
            <span class="num">${p.id}</span>
            <div><h3>${esc(p.title)}</h3>${bar(pm.mastery)}</div>
            <small>${pm.answered}/${pm.total}</small>
          </a>`;
        }).join("")}
      </section>`;
  }

  function viewPart() {
    const p = PARTS[current.arg];
    if (!p) return go("#/chapters");
    const ids = partIds(p.id);
    const order = Object.keys(PARTS);
    const i = order.indexOf(p.id);
    const prev = order[i - 1];
    const next = order[i + 1];
    app.innerHTML = `
      <p class="crumbs"><a href="#/chapters">Chapters</a> / <a href="#/chapter/${p.ch}">Ch ${p.ch}</a> / ${p.id}</p>
      <header class="page-head"><h1>${p.id} ${esc(p.title)}</h1></header>
      <div class="row wrap-row">
        <button class="btn primary" data-act="quiz-part" data-part="${p.id}">Quiz this part (${ids.length})</button>
        <button class="btn ghost" data-act="quiz-part-exam" data-part="${p.id}">Timed mini-exam</button>
      </div>
      <article class="panel prose">${p.learn || "<p class='muted'>No notes for this part.</p>"}</article>
      <section>
        <h2>Practice questions</h2>
        ${p.questions.map((q) => `
          <details class="panel qrow">
            <summary>${badge(S.q[q.id] && S.q[q.id].last)} <span class="qlabel">${q.label}${q.kind === "extra" ? " · extra" : ""}</span> ${q.q}</summary>
            <div class="answer">${q.answer}</div>
          </details>`).join("")}
      </section>
      ${p.cards.length ? `<section><h2>Flashcards</h2><div class="panel">
        ${p.cards.map((k) => `<p class="cardline"><b>${k.q}</b><br><span class="muted">${k.a}</span></p>`).join("")}
      </div></section>` : ""}
      <nav class="pager">
        ${prev ? `<a class="btn ghost" href="#/part/${prev}">← ${prev}</a>` : "<span></span>"}
        ${next ? `<a class="btn ghost" href="#/part/${next}">${next} →</a>` : "<span></span>"}
      </nav>`;
  }

  function viewQuizSetup() {
    const chips = D.chapters.map((c) => `<label class="chip"><input type="checkbox" name="ch" value="${c.num}" checked><span>Ch ${c.num}</span></label>`).join("");
    const preset = (src, label, n) => `<button class="panel preset" data-act="preset" data-src="${src}">
        <b>${n}</b><span>${label}</span></button>`;
    const pre = current.params;
    app.innerHTML = `
      <header class="page-head"><h1>Quiz</h1><p class="sub">Practice grades as you go. Exam mode hides answers until the end and runs on a timer.</p></header>
      <div class="presets">
        ${preset("due", "Due today (SRS)", poolFor("due").length)}
        ${preset("weak", "Weak spots", poolFor("weak").length)}
        ${preset("flagged", "Flagged", poolFor("flagged").length)}
        ${preset("unseen", "Not seen yet", poolFor("unseen").length)}
        <button class="panel preset exam" data-act="preset-exam"><b>Exam</b><span>25 random, timed</span></button>
      </div>
      <form id="quiz-form" class="panel">
        <fieldset>
          <legend>Chapters</legend>
          <div class="chips">${chips}</div>
          <p class="row"><button type="button" class="link" data-act="ch-all">All</button><button type="button" class="link" data-act="ch-none">None</button></p>
        </fieldset>
        <div class="grid2">
          <label>Question set
            <select name="source">
              <option value="all">All questions</option>
              <option value="unseen">Not seen yet</option>
              <option value="weak"${pre.has("weak") ? " selected" : ""}>Weak (missed or partial)</option>
              <option value="due"${pre.has("due") ? " selected" : ""}>Due today</option>
              <option value="flagged">Flagged</option>
              <option value="practice">Practice questions only</option>
              <option value="extra">Extra practice only</option>
            </select></label>
          <label>How many
            <select name="count">
              <option value="5">5</option><option value="10" selected>10</option><option value="20">20</option><option value="40">40</option><option value="0">All in set</option>
            </select></label>
          <label>Order
            <select name="order"><option value="shuffle">Shuffled</option><option value="book">Book order</option></select></label>
          <label>Mode
            <select name="mode"><option value="practice">Practice: grade as you go</option><option value="exam">Exam: timed, grade at end</option></select></label>
          <label>Minutes (exam only)
            <input type="number" name="minutes" min="1" max="180" value="15"></label>
        </div>
        <div class="row"><button class="btn primary" type="submit">Start quiz</button></div>
      </form>`;
  }

  /* ---------- session: practice + exam + results ---------- */
  function viewSession() {
    if (!sess) return go("#/quiz");
    if (sess.kind === "cards") return paintCard();
    if (sess.phase === "done") return paintResults();
    if (sess.phase === "grade") return paintGrade();
    if (sess.exam) {
      if (!timerHandle) timerHandle = setInterval(tick, 1000);
      return paintExam();
    }
    paintPractice();
  }

  function tick() {
    sess.left -= 1;
    const el = $("#timer");
    if (el) el.textContent = fmtTime(Math.max(0, sess.left));
    if (sess.left <= 0) {
      stopTimer();
      sess.phase = "grade";
      toast("Time is up. Grade your answers.");
      paint();
    }
  }

  const qProgress = () => `<div class="sess-top">
      <span class="muted">${esc(sess.title)} · ${sess.i + 1} / ${sess.ids.length}</span>
      ${sess.exam ? `<span class="timer" id="timer">${fmtTime(Math.max(0, sess.left))}</span>` : ""}
      <button class="link" data-act="exit">Exit</button>
    </div>${bar((sess.i + (sess.res[sess.ids[sess.i]] ? 1 : 0)) / sess.ids.length)}`;

  function paintPractice() {
    const id = sess.ids[sess.i];
    const q = QMAP[id];
    const cur = sess.cur;
    const graded = sess.res[id];
    let body = "";
    if (q.options) {
      body += `<div class="opts">${q.options.map((o) => {
        let cls = "opt";
        if (cur.picked) {
          if (q.letter && o.letter === q.letter) cls += " right";
          else if (o.letter === cur.picked) cls += " wrong";
        }
        return `<button class="${cls}" data-act="pick" data-letter="${o.letter}"${cur.picked ? " disabled" : ""}>
          <span class="ol">${o.letter}</span><span>${o.html}</span></button>`;
      }).join("")}</div>`;
    } else {
      body += `<label class="typed"><span>Your working (optional)</span>
        <textarea id="typed" rows="3" placeholder="Work it out here first">${esc(sess.typed[id] || "")}</textarea></label>
        <div class="row">
          ${q.key ? `<button class="btn ghost" data-act="check">Check number</button>` : ""}
          <button class="btn ghost" data-act="hint">${cur.hint ? "Hint shown" : "Hint"}</button>
          ${cur.revealed ? "" : `<button class="btn primary" data-act="reveal">Show answer</button>`}
        </div>
        ${cur.check ? `<p class="check ${cur.check.ok ? "ok" : "no"}">${cur.check.msg}</p>` : ""}
        ${cur.hint ? `<p class="hint">${hintOf(q.answer)}</p>` : ""}`;
    }
    if (cur.revealed || cur.picked) {
      body += `<div class="answer"><div class="ans-label">Answer</div>${q.answer}</div>`;
    }
    let actions = "";
    if (graded) {
      actions = `<span class="muted">Recorded: ${graded === "got" ? "Got it" : graded === "partial" ? "Partial" : "Missed"}</span>
        <button class="btn primary" data-act="next">Next →</button>`;
    } else if (cur.revealed) {
      actions = `<button class="btn bad" data-act="grade" data-res="missed">Missed <kbd>1</kbd></button>
        <button class="btn mid" data-act="grade" data-res="partial">Partial <kbd>2</kbd></button>
        <button class="btn good" data-act="grade" data-res="got">Got it <kbd>3</kbd></button>
        <button class="link" data-act="next">Skip</button>`;
    } else if (!q.options) {
      actions = `<button class="link" data-act="next">Skip</button>`;
    } else {
      actions = `<button class="link" data-act="next">Skip</button>`;
    }
    app.innerHTML = `<section class="session">
      ${qProgress()}
      <article class="panel qcard">
        <div class="qmeta">
          <span class="badge">Ch ${q.ch} · ${q.part}</span>
          ${q.kind === "extra" ? '<span class="badge">Extra</span>' : ""}
          ${badge(S.q[id] && S.q[id].last)}
          <button class="flag${S.q[id] && S.q[id].flag ? " on" : ""}" data-act="flag" title="Flag (F)">★ ${S.q[id] && S.q[id].flag ? "Flagged" : "Flag"}</button>
        </div>
        <h2 class="qtext">${q.q}</h2>
        ${body}
      </article>
      <div class="actions">${actions}</div>
      <p class="keys">Keys: Space show · 1 Missed · 2 Partial · 3 Got it · Enter next · F flag</p>
    </section>`;
  }

  function paintExam() {
    const id = sess.ids[sess.i];
    const q = QMAP[id];
    const answered = sess.ids.filter((x) => sess.typed[x] && sess.typed[x].trim()).length;
    app.innerHTML = `<section class="session">
      ${qProgress()}
      <div class="navdots">${sess.ids.map((x, n) => `<button class="dot${n === sess.i ? " on" : ""}${sess.typed[x] ? " done" : ""}" data-act="goto" data-n="${n}">${n + 1}</button>`).join("")}</div>
      <article class="panel qcard">
        <div class="qmeta"><span class="badge">Ch ${q.ch} · ${q.part}</span></div>
        <h2 class="qtext">${q.q}</h2>
        ${q.options ? `<ol class="mc-list">${q.options.map((o) => `<li><b>${o.letter})</b> ${o.html}</li>`).join("")}</ol>` : ""}
        <label class="typed"><span>Your answer</span>
          <textarea id="typed" rows="4" placeholder="Write your answer">${esc(sess.typed[id] || "")}</textarea></label>
      </article>
      <div class="actions">
        <button class="btn ghost" data-act="prev"${sess.i === 0 ? " disabled" : ""}>← Prev</button>
        <button class="btn ghost" data-act="next">Next →</button>
        <span class="grow"></span>
        <span class="muted">${answered}/${sess.ids.length} written</span>
        <button class="btn primary" data-act="finish-exam">Finish exam</button>
      </div>
    </section>`;
  }

  function paintGrade() {
    app.innerHTML = `<section class="session">
      <header class="page-head"><h1>Grade your exam</h1>
        <p class="sub">Open each answer, compare it with your writing, then grade it honestly. Ungraded items are not recorded.</p></header>
      ${sess.ids.map((id, n) => {
        const q = QMAP[id];
        const g = sess.res[id];
        return `<article class="panel qcard">
          <div class="qmeta"><span class="badge">${n + 1}. Ch ${q.ch} · ${q.part}</span>${badge(g)}</div>
          <h2 class="qtext">${q.q}</h2>
          ${sess.typed[id] ? `<p class="yours"><b>You wrote:</b> ${esc(sess.typed[id])}</p>` : '<p class="muted">No answer written.</p>'}
          <details><summary>Show answer</summary><div class="answer">${q.answer}</div></details>
          <div class="row">
            <button class="btn bad${g === "missed" ? " on" : ""}" data-act="exam-grade" data-id="${id}" data-res="missed">Missed</button>
            <button class="btn mid${g === "partial" ? " on" : ""}" data-act="exam-grade" data-id="${id}" data-res="partial">Partial</button>
            <button class="btn good${g === "got" ? " on" : ""}" data-act="exam-grade" data-id="${id}" data-res="got">Got it</button>
          </div>
        </article>`;
      }).join("")}
      <div class="actions"><button class="btn primary" data-act="submit-exam">See results</button></div>
    </section>`;
  }

  function paintResults() {
    const n = sess.ids.length;
    let got = 0;
    let partial = 0;
    let missed = 0;
    const byPart = {};
    sess.ids.forEach((id) => {
      const q = QMAP[id];
      const row = (byPart[q.part] ||= { title: q.partTitle, got: 0, partial: 0, missed: 0, n: 0 });
      row.n += 1;
      const g = sess.res[id];
      if (g === "got") { got++; row.got++; }
      else if (g === "partial") { partial++; row.partial++; }
      else if (g === "missed") { missed++; row.missed++; }
    });
    const score = n ? (got + partial * 0.5) / n : 0;
    const secs = Math.round((Date.now() - sess.t0) / 1000);
    const retry = sess.ids.filter((id) => sess.res[id] === "missed" || sess.res[id] === "partial");
    const msg = score === 1 ? "Perfect run." : score >= 0.8 ? "Strong." : score >= 0.5 ? "Getting there." : "Needs another pass.";
    app.innerHTML = `<section class="results panel">
      <div class="ring big" style="--p:${Math.round(score * 100)}"><div><b>${pct(score)}</b><span>score</span></div></div>
      <h1>${msg}</h1>
      <p class="sub">${esc(sess.title)} · ${n} questions · ${fmtTime(secs)}</p>
      <div class="tiles small">
        <div class="tile good"><b>${got}</b><span>got it</span></div>
        <div class="tile mid"><b>${partial}</b><span>partial</span></div>
        <div class="tile bad"><b>${missed}</b><span>missed</span></div>
        <div class="tile"><b>${n - got - partial - missed}</b><span>ungraded</span></div>
      </div>
      <table class="tbl"><thead><tr><th>Part</th><th>Got</th><th>Partial</th><th>Missed</th><th>Score</th></tr></thead><tbody>
        ${Object.entries(byPart).map(([id, r]) => `<tr><td>${id} ${esc(r.title)}</td><td>${r.got}</td><td>${r.partial}</td><td>${r.missed}</td><td>${pct(r.n ? (r.got + r.partial * 0.5) / r.n : 0)}</td></tr>`).join("")}
      </tbody></table>
      <div class="row wrap-row">
        ${retry.length ? `<button class="btn primary" data-act="retry" data-ids="${retry.join(",")}">Retry ${retry.length} missed</button>` : ""}
        <a class="btn ghost" href="#/quiz">New quiz</a>
        <a class="btn ghost" href="#/stats">Stats</a>
      </div>
    </section>`;
  }

  /* ---------- flashcards ---------- */
  function viewCardsHome() {
    const due = CARDS.filter((c) => isCardDue(c.id)).length;
    const fresh = CARDS.filter((c) => !S.cards[c.id]).length;
    const learned = CARDS.length - fresh;
    app.innerHTML = `
      <header class="page-head"><h1>Flashcards</h1><p class="sub">Spaced repetition: cards you miss come back sooner.</p></header>
      <section class="tiles">
        <div class="tile"><b>${due}</b><span>due</span></div>
        <div class="tile"><b>${Math.min(fresh, 15)}</b><span>new today (max 15)</span></div>
        <div class="tile"><b>${learned}</b><span>started</span></div>
        <div class="tile"><b>${CARDS.length}</b><span>total</span></div>
      </section>
      <div class="row"><button class="btn primary" data-act="cards-start">Start review</button></div>
      <section class="panel">
        <h2>By chapter</h2>
        ${D.chapters.map((c) => {
          const ks = CARDS.filter((k) => k.ch === c.num);
          const started = ks.filter((k) => S.cards[k.id]).length;
          return `<p class="cardline">Ch ${c.num} ${esc(c.title)}: <span class="muted">${started}/${ks.length} started</span></p>`;
        }).join("")}
      </section>`;
  }

  function paintCard() {
    if (sess.i >= sess.queue.length) {
      app.innerHTML = `<section class="results panel">
        <h1>Review done</h1>
        <p class="sub">${sess.done} cards reviewed.</p>
        <div class="row"><a class="btn primary" href="#/cards">Back to flashcards</a></div></section>`;
      sess = null;
      return;
    }
    const c = CMAP[sess.queue[sess.i]];
    app.innerHTML = `<section class="session">
      <div class="sess-top"><span class="muted">${sess.i + 1} / ${sess.queue.length} · Ch ${c.ch} · ${esc(c.partTitle)}</span>
        <button class="link" data-act="exit-cards">Exit</button></div>
      ${bar(sess.i / sess.queue.length)}
      <article class="panel flashcard${sess.flipped ? " flipped" : ""}" data-act="flip">
        <span class="label">${sess.flipped ? "Answer" : "Question (click or Space)"}</span>
        <h2>${sess.flipped ? c.a : c.q}</h2>
      </article>
      ${sess.flipped
        ? `<div class="actions">
            <button class="btn bad" data-act="rate" data-r="again">Again <kbd>1</kbd></button>
            <button class="btn mid" data-act="rate" data-r="hard">Hard <kbd>2</kbd></button>
            <button class="btn good" data-act="rate" data-r="good">Good <kbd>3</kbd></button>
            <button class="btn" data-act="rate" data-r="easy">Easy <kbd>4</kbd></button>
          </div>`
        : ""}
    </section>`;
  }

  /* ---------- uploads ---------- */
  const LIB = window.Library || null;
  const KIND_LABEL = { pdf: "PDF", docx: "Word", pptx: "Slides", md: "Markdown", text: "Text" };
  const genCache = new Map();
  let openMat = null; // material currently open, so re-renders stay instant
  let deck = null; // { id, cards, i, flipped }
  let uq = null; // mini quiz { id, items, i, picked, score, done }
  let upBusy = "";

  const fmtSize = (n) => (!n ? "" : n > 1048576 ? (n / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(n / 1024)) + " KB");
  const noLib = () => `<section class="panel"><p class="muted">The upload module did not load. Reload the page and try again.</p></section>`;

  function generated(m) {
    let g = genCache.get(m.id);
    if (!g) {
      g = { cards: LIB.makeCards(m.text), quiz: LIB.makeQuiz(m.text), terms: LIB.definitions(m.text) };
      genCache.set(m.id, g);
    }
    return g;
  }

  function setStatus(msg) {
    upBusy = msg;
    const el = $("#up-status");
    if (!el) return;
    el.textContent = msg || "Nothing selected yet.";
    el.classList.toggle("muted", !/…$/.test(msg || ""));
  }

  function matRow(m) {
    const g = generated(m);
    const href = `#/upload/${encodeURIComponent(m.id)}`;
    return `<div class="panel upitem">
      <div class="upmain">
        <span class="badge">${KIND_LABEL[m.kind] || esc(m.kind)}</span>
        <h3>${esc(m.title)}</h3>
        <small class="muted">${fmtSize(m.size)}${m.size ? " · " : ""}${g.cards.length} flashcards · ${g.quiz.length} quiz questions · added ${new Date(m.addedAt).toLocaleDateString()}</small>
      </div>
      <div class="row wrap-row">
        <a class="btn ghost" href="${href}?tab=study">Study</a>
        <a class="btn ghost" href="${href}?tab=cards">Flashcards</a>
        <a class="btn ghost" href="${href}?tab=quiz">Mini quiz</a>
        <button class="btn ghost" data-act="up-delete" data-id="${esc(m.id)}">Delete</button>
      </div>
    </div>`;
  }

  async function fillLibrary() {
    const box = $("#up-list");
    if (!box || !LIB) return;
    try {
      const rows = await LIB.list();
      if (!box.isConnected) return;
      box.innerHTML = rows.length
        ? rows.map(matRow).join("")
        : `<p class="muted">No uploads yet. Add a file above and it will show up here.</p>`;
    } catch (e) {
      box.innerHTML = `<p class="muted">${esc(e.message || "Uploads could not be read in this browser.")}</p>`;
    }
  }

  function fillHomeUploads() {
    const box = $("#home-uploads");
    if (!box || !LIB) return;
    LIB.list()
      .then((rows) => {
        if (!box.isConnected) return;
        if (!rows.length) {
          box.innerHTML = `<p class="muted">Nothing yet. <a href="#/upload">Add your notes</a> and the hub turns them into flashcards and a quiz.</p>`;
          return;
        }
        box.innerHTML = `<div class="uplist">${rows
          .slice(0, 3)
          .map((m) => {
            const g = generated(m);
            return `<a class="panel upitem" href="#/upload/${encodeURIComponent(m.id)}?tab=cards">
              <div class="upmain">
                <span class="badge">${KIND_LABEL[m.kind] || esc(m.kind)}</span>
                <h3>${esc(m.title)}</h3>
                <small class="muted">${g.cards.length} flashcards · ${g.quiz.length} quiz questions</small>
              </div>
              <span class="btn ghost">Study</span>
            </a>`;
          })
          .join("")}</div>`;
      })
      .catch(() => {
        box.innerHTML = `<p class="muted">Uploads could not be read in this browser.</p>`;
      });
  }

  async function addFiles(files) {
    if (!LIB) return;
    let added = 0;
    for (const f of files) {
      setStatus(`Reading ${f.name}…`);
      try {
        const m = await LIB.extract(f);
        if (!m.text || m.text.trim().length < 40) {
          throw new Error("No readable text in that file" + (m.kind === "pdf" ? " (a scanned PDF has no text layer — paste the text instead)" : "") + ".");
        }
        await LIB.save({ title: m.title, kind: m.kind, size: f.size, text: m.text });
        added += 1;
        const s = LIB.summary(m.text);
        setStatus(`Added ${f.name} — ${s.cards} flashcards, ${s.questions} quiz questions ready.`);
      } catch (e) {
        setStatus(`${f.name}: ${e.message || "could not be read"}`);
      }
    }
    if (added) {
      toast(added === 1 ? "Upload added." : `${added} uploads added.`);
      fillLibrary();
    }
  }

  function viewUpload() {
    if (current.arg) return viewMaterial();
    if (!LIB) return void (app.innerHTML = noLib());
    app.innerHTML = `
      <header class="page-head">
        <h1>Upload &amp; study</h1>
        <p class="sub">Add a PDF, Word document, PowerPoint, Markdown or text file — or paste anything in. It is read in this browser and saved on this device, so your notes never leave your computer.</p>
      </header>
      <section class="panel dropzone" id="dropzone">
        <input id="up-file" type="file" accept="${LIB.ACCEPT}" multiple hidden>
        <div class="dz-icon">↑</div>
        <h3>Drop files here</h3>
        <p class="muted">PDF · Word (.docx) · PowerPoint (.pptx) · Markdown · .txt</p>
        <div class="row"><button class="btn primary" data-act="up-pick">Choose files</button></div>
        <p class="dz-status" id="up-status">${esc(upBusy || "Nothing selected yet.")}</p>
      </section>
      <details class="panel paste">
        <summary>How to format notes so the cards are good</summary>
        <div class="prose">
          <p><strong>Bold the term, put its definition right after it.</strong> That is the whole convention:</p>
          <p class="muted">Pasting from Google Docs or Slides keeps the bold, so you can copy a document straight into the box below — no download needed.</p>
          <pre><code>**Enthalpy** — the heat content of a system at constant pressure.
**Entropy**: a measure of how many ways a system's energy can be arranged.
**Ideal gas law** :: PV = nRT, where R is the gas constant.</code></pre>
          <p>Every bold term becomes a flashcard. The quiz asks about those same terms both ways round — name the term from its definition, then pick the definition that belongs to a term — and adds fill-in-the-blank questions when a term also shows up in a sentence or the notes contain numbers.</p>
          <p class="muted">Bold inside Word and PowerPoint files is read as bold, so pressing Ctrl/Cmd+B in your document is enough. Notes without bold still work through the “Term — definition” line heuristics, just less reliably.</p>
        </div>
      </details>
      <details class="panel paste">
        <summary>Or paste text (Google Docs, Slides, anything)</summary>
        <form id="paste-form">
          <label>Title<input name="title" placeholder="Week 3 lecture notes" maxlength="80"></label>
          <label>Content<textarea name="text" rows="8" placeholder="**Enthalpy** — the heat content of a system at constant pressure." required></textarea></label>
          <div class="row"><button class="btn primary" type="submit">Add to library</button></div>
        </form>
      </details>
      <section>
        <h2>Your library</h2>
        <div id="up-list"><p class="muted">Loading…</p></div>
      </section>`;
    fillLibrary();
  }

  function viewMaterial() {
    const id = current.arg;
    const tab = current.params.get("tab") || "study";
    if (!LIB) return void (app.innerHTML = noLib());
    if (openMat && openMat.id === id) return paintMaterial(openMat, tab);
    app.innerHTML = `<p class="muted">Loading…</p>`;
    LIB.get(id)
      .then((m) => {
        if (!m) {
          toast("That upload is no longer in this browser.");
          return go("#/upload");
        }
        if (current.arg === id) paintMaterial(m, tab);
      })
      .catch((e) => {
        app.innerHTML = `<p class="muted">${esc(e.message || "Could not open that upload.")}</p>`;
      });
  }

  function paintMaterial(m, tab) {
    openMat = m;
    const g = generated(m);
    const href = `#/upload/${encodeURIComponent(m.id)}`;
    const tabs = [
      ["study", "Study"],
      ["cards", `Flashcards (${g.cards.length})`],
      ["quiz", `Mini quiz (${Math.min(10, g.quiz.length)})`],
      ["terms", `Key terms (${g.terms.length})`],
    ];
    app.innerHTML = `
      <p class="crumbs"><a href="#/upload">Upload &amp; study</a> / ${KIND_LABEL[m.kind] || "Text"}</p>
      <header class="page-head">
        <h1>${esc(m.title)}</h1>
        <p class="sub">${fmtSize(m.size)}${m.size ? " · " : ""}added ${new Date(m.addedAt).toLocaleDateString()} · ${g.cards.length} flashcards · ${g.quiz.length} quiz questions</p>
      </header>
      <nav class="tabs">${tabs
        .map(([k, label]) => `<a class="${k === tab ? "on" : ""}" href="${href}?tab=${k}">${label}</a>`)
        .join("")}</nav>
      <div class="row wrap-row">
        <button class="btn ghost" data-act="up-export" data-id="${esc(m.id)}">Download text</button>
        <button class="btn ghost" data-act="up-delete" data-id="${esc(m.id)}">Delete</button>
      </div>
      ${tab === "cards" ? cardsBody(m, g) : tab === "quiz" ? quizBody(m, g) : tab === "terms" ? termsBody(g) : `<article class="panel prose">${LIB.toHtml(m.text, m.kind)}</article>`}
    `;
  }

  function cardsBody(m, g) {
    if (!g.cards.length) {
      return `<section class="panel"><h2>No flashcards yet</h2><p class="muted">Cards are built from definition-style lines such as “Equilibrium — the point where the forward and reverse rates match” or “Equilibrium :: the point where…”, plus fill-in-the-blank sentences. Add a few lines like that to the source and they appear here.</p></section>`;
    }
    if (!deck || deck.id !== m.id) deck = { id: m.id, cards: g.cards.slice(), i: 0, flipped: false };
    const c = deck.cards[deck.i];
    return `<section class="session">
      <div class="sess-top"><span class="muted">Card ${deck.i + 1} of ${deck.cards.length}</span>
        <button class="link" data-act="deck-shuffle">Shuffle</button></div>
      ${bar((deck.i + (deck.flipped ? 1 : 0)) / deck.cards.length)}
      <article class="panel flashcard${deck.flipped ? " flipped" : ""}" data-act="deck-flip">
        <span class="label">${deck.flipped ? "Answer" : "Question (click or press space)"}</span>
        <h2>${esc(deck.flipped ? c.a : c.q)}</h2>
      </article>
      <div class="actions">
        <button class="btn ghost" data-act="deck-prev"${deck.i === 0 ? " disabled" : ""}>← Previous</button>
        <button class="btn primary" data-act="deck-next"${deck.i === deck.cards.length - 1 ? " disabled" : ""}>Next →</button>
      </div>
    </section>`;
  }

  function quizBody(m, g) {
    if (!g.quiz.length) {
      return `<section class="panel"><h2>No quiz questions yet</h2><p class="muted">Mini quizzes need at least four terms in the source, so the wrong answers can come from your own material. Add more definition-style lines and try again.</p></section>`;
    }
    if (!uq || uq.id !== m.id) uq = { id: m.id, items: g.quiz.slice(0, 10), i: 0, picked: null, score: 0, done: false, log: [] };
    if (uq.done) {
      const missed = (uq.log || []).filter((r) => !r.ok);
      return `<section class="results panel">
        <h1>${uq.score} / ${uq.items.length}</h1>
        <p class="sub">${pct(uq.score / uq.items.length)} correct on this mini quiz.</p>
        ${missed.length
          ? `<h3>Worth another look</h3><ul class="plain">${missed
              .map((r) => `<li>${esc(r.stem)}<br><span class="muted">${esc(r.right)}</span></li>`)
              .join("")}</ul>`
          : `<p class="muted">Every question correct — try the flashcards to lock it in.</p>`}
        <div class="row">
          <button class="btn primary" data-act="up-retry">Try again</button>
          <a class="btn ghost" href="#/upload/${encodeURIComponent(m.id)}?tab=cards">Flashcards</a>
        </div>
      </section>`;
    }
    const q = uq.items[uq.i];
    const picked = uq.picked;
    const right = q.options[q.answer];
    return `<section class="session">
      <div class="sess-top"><span class="muted">Question ${uq.i + 1} of ${uq.items.length}</span><span class="muted">Score ${uq.score}</span></div>
      ${bar(uq.i / uq.items.length)}
      <article class="panel qcard">
        ${q.type ? `<span class="badge">${esc(q.type)}</span>` : ""}
        <p class="qtext">${esc(q.q).replace(/\n\n/g, "<br><br>")}</p>
        <div class="opts">${q.options
          .map(
            (o, i) =>
              `<button class="opt${picked == null ? "" : i === q.answer ? " right" : i === picked ? " wrong" : ""}" data-act="up-answer" data-n="${i}"${picked == null ? "" : " disabled"}><span class="ol">${"ABCD"[i]}</span><span>${esc(o)}</span></button>`
          )
          .join("")}</div>
      </article>
      ${picked == null
        ? `<p class="keys">Pick an answer.</p>`
        : `<p class="keys">${q.explain ? esc(q.explain) : `Correct answer: ${esc(right)}`}</p>
           <div class="actions"><button class="btn primary" data-act="up-next">${uq.i + 1 === uq.items.length ? "See result" : "Next question"}</button></div>`}
    </section>`;
  }

  function termsBody(g) {
    if (!g.terms.length) {
      return `<section class="panel"><h2>No key terms found</h2><p class="muted">Terms come from lines shaped like “Term — definition” or “Term: definition”.</p></section>`;
    }
    return `<section class="panel"><h2>Key terms (${g.terms.length})</h2>
      <div class="table-wrap"><table class="tbl"><thead><tr><th>Term</th><th>Definition</th></tr></thead><tbody>
        ${g.terms.map((d) => `<tr><td><b>${esc(d.term)}</b></td><td>${esc(d.def)}</td></tr>`).join("")}
      </tbody></table></div></section>`;
  }

  /* ---------- look & layout ---------- */
  const applyLook = () => HUB && HUB.applyTheme(S.ui);

  function renderNav() {
    const nav = document.getElementById("nav");
    if (!nav || !HUB) return;
    nav.innerHTML = S.ui.tabs
      .map((id) => HUB.tabById(id))
      .filter(Boolean)
      .map((t) => `<a href="${t.href}" data-nav="${t.id === "home" ? "" : t.id}" draggable="true">${esc(t.label)}</a>`)
      .join("");
    // rebuilding the bar loses the active highlight, so put it back
    const here = ["chapter", "part"].includes(current.name) ? "chapters" : current.name === "review" ? "cards" : current.name === "session" ? "quiz" : current.name;
    nav.querySelectorAll("a").forEach((a) => a.classList.toggle("active", a.dataset.nav === here));
  }

  function saveUI() {
    if (HUB) S.ui = HUB.normalize(S.ui);
    save();
    renderNav();
    applyLook();
    paint();
  }

  const tabRow = (t, i, n) => `<div class="tabrow">
      <span class="grow"><b>${esc(t.label)}</b>${t.locked ? ' <small class="muted">always shown</small>' : ""}</span>
      <button class="mini" data-act="ui-tab-up" data-id="${t.id}" title="Move earlier"${i === 0 ? " disabled" : ""}>↑</button>
      <button class="mini" data-act="ui-tab-down" data-id="${t.id}" title="Move later"${i === n - 1 ? " disabled" : ""}>↓</button>
      ${t.locked ? "" : `<button class="mini" data-act="ui-tab-hide" data-id="${t.id}" title="Hide this tab">✕</button>`}
    </div>`;

  const widgetRow = (w, i, n) => `<div class="tabrow">
      <span class="grow"><b>${esc(w.label)}</b>${w.locked ? ' <small class="muted">always shown</small>' : ""}</span>
      <button class="mini" data-act="ui-widget-up" data-id="${w.id}" title="Move up"${i === 0 ? " disabled" : ""}>↑</button>
      <button class="mini" data-act="ui-widget-down" data-id="${w.id}" title="Move down"${i === n - 1 ? " disabled" : ""}>↓</button>
      ${w.locked ? "" : `<button class="mini" data-act="ui-widget-hide" data-id="${w.id}" title="Hide this widget">✕</button>`}
    </div>`;

  function viewSettings() {
    if (!HUB) return void (app.innerHTML = `<section class="panel"><p class="muted">The layout module did not load. Reload the page and try again.</p></section>`);
    const ui = S.ui;
    const hiddenTabs = ui.hidden.map((id) => HUB.tabById(id)).filter(Boolean);
    const hiddenWidgets = ui.hiddenWidgets.map((id) => HUB.widgetById(id)).filter(Boolean);
    app.innerHTML = `
      <header class="page-head">
        <h1>Look &amp; layout</h1>
        <p class="sub">Move or hide tabs, choose what your home screen shows, and pick your colours and font. Everything here is saved on this device.</p>
      </header>

      <section class="panel">
        <h2>Colour palette</h2>
        <div class="swatches">${HUB.PALETTES.map((p) => `<button class="swatch-check${p.id === ui.palette ? " on" : ""}" data-act="ui-palette" data-id="${p.id}" aria-pressed="${p.id === ui.palette}"><span class="sw" style="background:linear-gradient(135deg, ${p.swatch[0]}, ${p.swatch[1]})"></span><span>${esc(p.label)}</span></button>`).join("")}</div>
        <p class="muted">Dark mode works with every palette — the ◐ button in the top bar switches it.</p>
      </section>

      <section class="panel">
        <h2>Font</h2>
        <div class="fonts">${HUB.FONTS.map((f) => `<button class="font-check${f.id === ui.font ? " on" : ""}" data-act="ui-font" data-id="${f.id}"><b style="font-family:${f.stack.replace(/"/g, "&quot;")}">Aa</b><span>${esc(f.label)}</span></button>`).join("")}</div>
        <p class="muted">System and Georgia need no download; the other families load from Google Fonts the first time you pick them.</p>
      </section>

      <section class="panel">
        <h2>Tabs</h2>
        <p class="muted">Drag tabs in the top bar to reorder, or use the arrows here. Hidden tabs can come back at any time.</p>
        <div class="tablist">${ui.tabs.map((id, i) => tabRow(HUB.tabById(id), i, ui.tabs.length)).join("")}</div>
        ${hiddenTabs.length ? `<h3>Hidden tabs</h3><div class="tablist">${hiddenTabs.map((t) => `<div class="tabrow hidden-row"><span class="grow">${esc(t.label)}</span><button class="mini" data-act="ui-tab-show" data-id="${t.id}" title="Show again">+</button></div>`).join("")}</div>` : ""}
      </section>

      <section class="panel">
        <h2>Home dashboard</h2>
        <p class="muted">Pick what the home screen shows and in which order.</p>
        <div class="tablist">${ui.widgets.map((id, i) => widgetRow(HUB.widgetById(id), i, ui.widgets.length)).join("")}</div>
        ${hiddenWidgets.length ? `<h3>Hidden widgets</h3><div class="tablist">${hiddenWidgets.map((w) => `<div class="tabrow hidden-row"><span class="grow">${esc(w.label)}</span><button class="mini" data-act="ui-widget-show" data-id="${w.id}" title="Show again">+</button></div>`).join("")}</div>` : ""}
      </section>

      <section class="panel">
        <h2>Picture &amp; quote</h2>
        <p class="muted">A screenshot of a formula sheet, a photo of your notes, or something to keep you going. It is shrunk and kept on this device.</p>
        <input id="ui-photo" type="file" accept="image/*" hidden>
        <div class="row">
          <button class="btn" data-act="ui-photo-pick">Choose picture</button>
          ${ui.photo ? `<button class="btn ghost" data-act="ui-photo-clear">Remove picture</button>` : ""}
        </div>
        ${ui.photo ? `<img class="photo-preview" src="${esc(ui.photo)}" alt="Your dashboard picture">` : ""}
        <form id="photo-form" class="settings-form">
          <label>Caption or quote
            <input name="caption" maxlength="160" value="${esc(ui.photoCaption)}" placeholder="Everything is figureoutable">
          </label>
          <div class="row"><button class="btn primary" type="submit">Save caption</button></div>
        </form>
      </section>

      <section class="panel">
        <h2>Start over</h2>
        <p class="muted">Puts the default tabs, dashboard, palette and font back. Your study progress and uploads are not touched.</p>
        <div class="row"><button class="btn ghost" data-act="ui-reset">Reset look &amp; layout</button></div>
      </section>`;
  }

  /* ---------- schedule, reference, stats, search ---------- */
  function viewSchedule() {
    const today = todayIso();
    const done = D.schedule.filter((s) => S.sched[s.date]).length;
    app.innerHTML = `
      <header class="page-head"><h1>Schedule</h1><p class="sub">${done} of ${D.schedule.length} days ticked off. Tick a day when you finish it.</p></header>
      <div class="panel table-wrap"><table class="tbl sched">
        <thead><tr><th></th><th>Date</th><th>Day</th><th>Task</th></tr></thead>
        <tbody>${D.schedule.map((s) => `<tr class="${s.date === today ? "today" : ""}">
          <td><input type="checkbox" data-act="sched" data-date="${s.date}" ${S.sched[s.date] ? "checked" : ""} aria-label="Done ${s.date}"></td>
          <td>${fmtDate(s.date)}</td><td>${s.day}</td><td>${s.task}</td></tr>`).join("")}
        </tbody></table></div>`;
  }

  function viewReference() {
    app.innerHTML = `
      <header class="page-head"><h1>Formula sheet</h1><div class="row"><button class="btn ghost" data-act="print">Print</button></div></header>
      <article class="panel prose">${D.formula}</article>`;
  }

  function viewStats() {
    const log = S.log;
    const got = log.filter((l) => l.res === "got").length;
    const partial = log.filter((l) => l.res === "partial").length;
    const acc = log.length ? (got + partial * 0.5) / log.length : null;
    const dayKey = (t) => isoOf(new Date(t));
    const counts = {};
    log.forEach((l) => (counts[dayKey(l.t)] = (counts[dayKey(l.t)] || 0) + 1));
    let streak = 0;
    const d = new Date();
    if (!counts[isoOf(d)]) d.setDate(d.getDate() - 1);
    while (counts[isoOf(d)]) {
      streak++;
      d.setDate(d.getDate() - 1);
    }
    const cells = [];
    for (let k = 83; k >= 0; k--) {
      const dt = new Date();
      dt.setDate(dt.getDate() - k);
      const key = isoOf(dt);
      const n = counts[key] || 0;
      const lvl = n === 0 ? 0 : n < 5 ? 1 : n < 10 ? 2 : n < 20 ? 3 : 4;
      cells.push(`<i class="hm l${lvl}" title="${key}: ${n} answers"></i>`);
    }
    const cards = Object.keys(S.cards).length;
    app.innerHTML = `
      <header class="page-head"><h1>Stats</h1><p class="sub">All progress is stored in this browser only. Export it to back it up.</p></header>
      <section class="tiles">
        <div class="tile"><b>${log.length}</b><span>answers graded</span></div>
        <div class="tile"><b>${acc == null ? "–" : pct(acc)}</b><span>accuracy</span></div>
        <div class="tile"><b>${streak}</b><span>day streak</span></div>
        <div class="tile"><b>${cards}</b><span>cards started</span></div>
      </section>
      <section class="panel">
        <h2>Mastery by chapter</h2>
        ${D.chapters.map((c) => {
          const m = masteryOf(chapterIds(c.num));
          return `<div class="barrow"><span>Ch ${c.num} ${esc(c.title)}</span>${bar(m.mastery)}<b>${m.mastery == null ? "–" : pct(m.mastery)}</b></div>`;
        }).join("")}
      </section>
      <section class="panel">
        <h2>Last 12 weeks</h2>
        <div class="heat">${cells.join("")}</div>
      </section>
      <section class="panel row wrap-row">
        <button class="btn ghost" data-act="export">Export progress</button>
        <label class="btn ghost file">Import progress<input type="file" id="import" accept="application/json"></label>
        <button class="btn bad" data-act="reset">Reset progress</button>
      </section>`;
  }

  function viewSearch() {
    const term = (current.params.get("q") || "").trim().toLowerCase();
    const hits = [];
    if (term) {
      QS.forEach((q) => {
        const t = plainOf(q.q + " " + q.answer);
        if (t.toLowerCase().includes(term)) hits.push({ href: `#/part/${q.part}`, title: `${q.part} ${q.partTitle}`, text: plainOf(q.q) });
      });
      CARDS.forEach((k) => {
        const t = plainOf(k.q + " " + k.a);
        if (t.toLowerCase().includes(term)) hits.push({ href: `#/part/${k.part}`, title: `Flashcard · ${k.partTitle}`, text: plainOf(k.q) });
      });
      Object.values(PARTS).forEach((p) => {
        if (plainOf(p.learn).toLowerCase().includes(term)) hits.push({ href: `#/part/${p.id}`, title: `${p.id} ${p.title}`, text: "Notes" });
      });
    }
    const seen = new Set();
    const list = hits.filter((h) => (seen.has(h.href + h.text) ? false : seen.add(h.href + h.text)));
    app.innerHTML = `
      <header class="page-head"><h1>Search</h1><p class="sub">${term ? `${list.length} results for “${esc(term)}”` : "Type in the search box above."}</p></header>
      <section class="part-list">
        ${list.slice(0, 80).map((h) => `<a class="panel part-row" href="${h.href}"><div><h3>${esc(h.title)}</h3><small>${esc(h.text.slice(0, 160))}</small></div></a>`).join("")}
      </section>`;
  }

  /* ---------- actions (event delegation) ---------- */
  function pick(letter) {
    const id = sess.ids[sess.i];
    const q = QMAP[id];
    if (sess.cur.picked) return;
    sess.cur.picked = letter;
    sess.cur.revealed = true;
    if (q.letter) grade(q.letter === letter ? "got" : "missed");
    else paint();
  }

  function grade(res) {
    const id = sess.ids[sess.i];
    if (sess.res[id]) return;
    sess.res[id] = res;
    gradeQuestion(id, res);
    sess.cur.revealed = true;
    paint();
  }

  function next() {
    sess.i += 1;
    sess.cur = { picked: null, revealed: false, hint: false, check: null };
    if (sess.i >= sess.ids.length) {
      sess.phase = "done";
      if (sess.exam) stopTimer();
    }
    paint();
  }

  // count 0 means every question in the set
  function startExam(ids, minutes, title, count = 25) {
    startSession({ ids, title, shuffleIt: true, count, exam: true, minutes });
  }

  const ACTIONS = {
    theme() {
      const cur = document.documentElement.dataset.theme;
      const next = cur === "dark" || (!cur && matchMedia("(prefers-color-scheme: dark)").matches) ? "light" : "dark";
      document.documentElement.dataset.theme = next;
      S.settings.theme = next;
      save();
    },
    "ch-all": () => document.querySelectorAll('input[name="ch"]').forEach((i) => (i.checked = true)),
    "ch-none": () => document.querySelectorAll('input[name="ch"]').forEach((i) => (i.checked = false)),
    preset(el) {
      const src = el.dataset.src;
      const all = D.chapters.map((c) => c.num);
      const ordered = src === "due" || src === "weak";
      startSession({
        ids: poolFor(src, all),
        title: { due: "Due today", weak: "Weak spots", flagged: "Flagged", unseen: "Not seen yet" }[src],
        shuffleIt: !ordered,
        count: 20,
      });
    },
    "preset-exam"() {
      startExam(poolFor("all", D.chapters.map((c) => c.num)), 30, "Exam");
    },
    "quiz-ch"(el) {
      const n = Number(el.dataset.ch);
      startSession({ ids: chapterIds(n), title: `Ch ${n}`, shuffleIt: true });
    },
    "quiz-part"(el) {
      startSession({ ids: partIds(el.dataset.part), title: el.dataset.part, shuffleIt: true });
    },
    "quiz-part-exam"(el) {
      startExam(partIds(el.dataset.part), 15, `Exam ${el.dataset.part}`, 0);
    },
    pick(el) {
      pick(el.dataset.letter);
    },
    reveal() {
      sess.cur.revealed = true;
      paint();
    },
    grade(el) {
      grade(el.dataset.res);
    },
    next() {
      next();
    },
    hint() {
      sess.cur.hint = true;
      paint();
    },
    check() {
      const id = sess.ids[sess.i];
      const q = QMAP[id];
      const v = parseTyped($("#typed").value || "");
      if (Number.isNaN(v)) sess.cur.check = { ok: false, msg: "Type your number first." };
      else {
        const ok = Math.abs(v - Number(q.key)) <= Math.abs(Number(q.key)) * 0.01;
        sess.cur.check = ok
          ? { ok: true, msg: "✓ Your number matches the key number. Grade yourself below." }
          : { ok: false, msg: "✗ Not the key number yet. Check your working." };
      }
      paint();
    },
    flag() {
      flagQuestion(sess.ids[sess.i]);
      paint();
    },
    exit() {
      stopTimer();
      sess = null;
      go("#/quiz");
    },
    "exit-cards"() {
      sess = null;
      go("#/cards");
    },
    prev() {
      saveTyped();
      sess.i = Math.max(0, sess.i - 1);
      paint();
    },
    goto(el) {
      saveTyped();
      sess.i = Number(el.dataset.n);
      paint();
    },
    "finish-exam"() {
      saveTyped();
      if (!confirm("Finish the exam now? You will grade each answer next.")) return;
      stopTimer();
      sess.phase = "grade";
      paint();
    },
    "exam-grade"(el) {
      const id = el.dataset.id;
      if (sess.res[id] === el.dataset.res) delete sess.res[id];
      else sess.res[id] = el.dataset.res;
      paint();
    },
    "submit-exam"() {
      const ungraded = sess.ids.filter((id) => !sess.res[id]).length;
      if (ungraded && !confirm(`${ungraded} questions are not graded and will not be recorded. Continue?`)) return;
      sess.ids.forEach((id) => sess.res[id] && gradeQuestion(id, sess.res[id]));
      sess.phase = "done";
      paint();
    },
    retry(el) {
      startSession({ ids: el.dataset.ids.split(","), title: "Retry missed" });
    },
    "cards-start"() {
      startCards();
    },
    "up-pick"() {
      const el = $("#up-file");
      if (el) el.click();
    },
    "up-delete"(el) {
      const id = el.dataset.id;
      if (!confirm("Delete this upload from this browser?")) return;
      LIB.remove(id)
        .then(() => {
          genCache.delete(id);
          if (openMat && openMat.id === id) openMat = null;
          if (deck && deck.id === id) deck = null;
          if (uq && uq.id === id) uq = null;
          toast("Upload deleted.");
          if (current.arg === id) go("#/upload");
          else {
            fillLibrary();
            paint();
          }
        })
        .catch(() => toast("That upload could not be deleted."));
    },
    "up-export"(el) {
      if (!openMat || openMat.id !== el.dataset.id) return;
      const blob = new Blob([`# ${openMat.title}\n\n${openMat.text}\n`], { type: "text/markdown" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = (openMat.title || "upload").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") + ".md";
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    },
    "deck-flip"() {
      if (!deck) return;
      deck.flipped = !deck.flipped;
      paint();
    },
    "deck-next"() {
      if (!deck) return;
      deck.i = Math.min(deck.cards.length - 1, deck.i + 1);
      deck.flipped = false;
      paint();
    },
    "deck-prev"() {
      if (!deck) return;
      deck.i = Math.max(0, deck.i - 1);
      deck.flipped = false;
      paint();
    },
    "deck-shuffle"() {
      if (!deck) return;
      for (let i = deck.cards.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck.cards[i], deck.cards[j]] = [deck.cards[j], deck.cards[i]];
      }
      deck.i = 0;
      deck.flipped = false;
      paint();
    },
    "up-answer"(el) {
      if (!uq || uq.picked != null) return;
      const q = uq.items[uq.i];
      uq.picked = Number(el.dataset.n);
      const ok = uq.picked === q.answer;
      if (ok) uq.score += 1;
      (uq.log || (uq.log = [])).push({ ok, stem: q.q.split("\n\n").pop(), right: q.options[q.answer] });
      paint();
    },
    "up-next"() {
      if (!uq) return;
      uq.picked = null;
      if (uq.i + 1 >= uq.items.length) uq.done = true;
      else uq.i += 1;
      paint();
    },
    "up-retry"() {
      uq = null;
      paint();
    },
    flip() {
      sess.flipped = !sess.flipped;
      paint();
    },
    rate(el) {
      const id = sess.queue[sess.i];
      const r = el.dataset.r;
      gradeCard(id, r);
      sess.done += 1;
      if (r === "again") sess.queue.push(id);
      sess.i += 1;
      sess.flipped = false;
      paint();
    },
    sched() {},
    print() {
      window.print();
    },
    export() {
      const blob = new Blob([JSON.stringify(S, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "chem-study-progress.json";
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    },
    reset() {
      if (!confirm("Erase all progress in this browser? This cannot be undone.")) return;
      S = { q: {}, cards: {}, log: [], sched: {}, settings: S.settings, ui: S.ui };
      save();
      toast("Progress reset.");
      paint();
    },
    "ui-palette"(el) {
      S.ui.palette = el.dataset.id;
      saveUI();
    },
    "ui-font"(el) {
      S.ui.font = el.dataset.id;
      saveUI();
    },
    "ui-tab-up"(el) {
      S.ui.tabs = HUB.moveItem(S.ui.tabs, el.dataset.id, -1);
      saveUI();
    },
    "ui-tab-down"(el) {
      S.ui.tabs = HUB.moveItem(S.ui.tabs, el.dataset.id, 1);
      saveUI();
    },
    "ui-tab-hide"(el) {
      const id = el.dataset.id;
      if ((HUB.tabById(id) || {}).locked) return;
      S.ui.tabs = S.ui.tabs.filter((x) => x !== id);
      if (!S.ui.hidden.includes(id)) S.ui.hidden.push(id);
      saveUI();
      toast("Tab hidden. Bring it back under Look & layout.");
    },
    "ui-tab-show"(el) {
      const id = el.dataset.id;
      S.ui.hidden = S.ui.hidden.filter((x) => x !== id);
      if (!S.ui.tabs.includes(id)) S.ui.tabs.push(id);
      saveUI();
    },
    "ui-widget-up"(el) {
      S.ui.widgets = HUB.moveItem(S.ui.widgets, el.dataset.id, -1);
      saveUI();
    },
    "ui-widget-down"(el) {
      S.ui.widgets = HUB.moveItem(S.ui.widgets, el.dataset.id, 1);
      saveUI();
    },
    "ui-widget-hide"(el) {
      const id = el.dataset.id;
      if ((HUB.widgetById(id) || {}).locked) return;
      S.ui.widgets = S.ui.widgets.filter((x) => x !== id);
      if (!S.ui.hiddenWidgets.includes(id)) S.ui.hiddenWidgets.push(id);
      saveUI();
    },
    "ui-widget-show"(el) {
      const id = el.dataset.id;
      S.ui.hiddenWidgets = S.ui.hiddenWidgets.filter((x) => x !== id);
      if (!S.ui.widgets.includes(id)) S.ui.widgets.push(id);
      saveUI();
    },
    "ui-photo-pick"() {
      const el = $("#ui-photo");
      if (el) el.click();
    },
    "ui-photo-clear"() {
      S.ui.photo = "";
      saveUI();
      toast("Picture removed.");
    },
    "ui-reset"() {
      S.ui = HUB.normalize(null);
      saveUI();
      toast("Look & layout reset.");
    },
  };

  function saveTyped() {
    if (!sess || sess.kind !== "q") return;
    const el = $("#typed");
    if (el) sess.typed[sess.ids[sess.i]] = el.value;
  }

  document.addEventListener("click", (e) => {
    const el = e.target.closest("[data-act]");
    if (!el || el.tagName === "INPUT" || el.tagName === "LABEL") return;
    if (el.hasAttribute("disabled")) return;
    const fn = ACTIONS[el.dataset.act];
    if (fn) {
      e.preventDefault();
      fn(el, e);
    }
  });

  document.addEventListener("dragover", (e) => {
    const dz = e.target.closest && e.target.closest("#dropzone");
    if (!dz) return;
    e.preventDefault();
    dz.classList.add("over");
  });

  document.addEventListener("dragleave", (e) => {
    const dz = e.target.closest && e.target.closest("#dropzone");
    if (dz) dz.classList.remove("over");
  });

  document.addEventListener("drop", (e) => {
    const dz = e.target.closest && e.target.closest("#dropzone");
    if (!dz) return;
    e.preventDefault();
    dz.classList.remove("over");
    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) addFiles([...e.dataTransfer.files]);
  });

  /* Pasting from Google Docs keeps the bold, so **term** markup survives the trip. */
  document.addEventListener("paste", (e) => {
    const ta = e.target;
    if (!ta || ta.tagName !== "TEXTAREA" || !ta.closest("#paste-form") || !LIB) return;
    const html = e.clipboardData && e.clipboardData.getData("text/html");
    if (!html) return;
    const text = LIB.fromHtmlPaste(html);
    if (!text || text.length < 2) return;
    e.preventDefault();
    const start = typeof ta.selectionStart === "number" ? ta.selectionStart : ta.value.length;
    const end = typeof ta.selectionEnd === "number" ? ta.selectionEnd : start;
    ta.value = ta.value.slice(0, start) + text + ta.value.slice(end);
    ta.selectionStart = ta.selectionEnd = start + text.length;
  });

  /* dragging tabs in the top bar reorders them */
  let dragTab = "";
  document.addEventListener("dragstart", (e) => {
    const a = e.target.closest && e.target.closest(".nav a[data-nav]");
    if (!a) return;
    dragTab = a.dataset.nav || "home";
    a.classList.add("dragging");
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = "move";
      try {
        e.dataTransfer.setData("text/plain", dragTab);
      } catch (err) {
        /* some browsers keep data private; the in-memory id is enough */
      }
    }
  });

  document.addEventListener("dragend", () => {
    dragTab = "";
    document.querySelectorAll(".nav a.dragging").forEach((a) => a.classList.remove("dragging"));
  });

  document.addEventListener("drop", (e) => {
    const a = e.target.closest && e.target.closest(".nav a[data-nav]");
    if (!dragTab || !a) return;
    e.preventDefault();
    const toId = a.dataset.nav || "home";
    const from = S.ui.tabs.indexOf(dragTab);
    const to = S.ui.tabs.indexOf(toId);
    if (from < 0 || to < 0 || from === to) return;
    const next = S.ui.tabs.slice();
    next.splice(to, 0, next.splice(from, 1)[0]);
    S.ui.tabs = next;
    saveUI();
  });

  document.addEventListener("change", (e) => {
    const t = e.target;
    if (t.matches('[data-act="sched"]')) {
      const d = t.dataset.date;
      S.sched[d] = t.checked;
      save();
      paint();
    }
    if (t.id === "import" && t.files[0]) {
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const data = JSON.parse(reader.result);
          S = { q: {}, cards: {}, log: [], sched: {}, settings: {}, ...data };
          if (HUB) S.ui = HUB.normalize(S.ui);
          renderNav();
          applyLook();
          save();
          toast("Progress imported.");
          paint();
        } catch (err) {
          toast("That file is not a valid progress export.");
        }
      };
      reader.readAsText(t.files[0]);
    }
    if (t.id === "up-file" && t.files && t.files.length) {
      const files = [...t.files];
      t.value = "";
      addFiles(files);
    }
    if (t.id === "ui-photo" && t.files && t.files[0]) {
      const file = t.files[0];
      t.value = "";
      HUB.photoFromFile(file)
        .then((data) => {
          S.ui.photo = data;
          S.ui.hiddenWidgets = S.ui.hiddenWidgets.filter((x) => x !== "photo");
          if (!S.ui.widgets.includes("photo")) S.ui.widgets.push("photo");
          saveUI();
          toast("Picture saved to your dashboard.");
        })
        .catch((err) => toast(err.message || "That picture could not be saved."));
    }
  });

  document.addEventListener("submit", (e) => {
    if (e.target.id === "quiz-form") {
      e.preventDefault();
      const fd = new FormData(e.target);
      const chapters = fd.getAll("ch").map(Number);
      if (!chapters.length) return toast("Pick at least one chapter.");
      const source = fd.get("source");
      const ids = poolFor(source, chapters);
      const count = Number(fd.get("count"));
      const exam = fd.get("mode") === "exam";
      const minutes = Math.max(1, Number(fd.get("minutes")) || 15);
      const label = e.target.querySelector('[name="source"] option:checked').textContent;
      if (exam) return startExam(ids, minutes, "Exam", count);
      startSession({ ids, title: label, shuffleIt: fd.get("order") === "shuffle", count });
    }
    if (e.target.id === "photo-form") {
      e.preventDefault();
      S.ui.photoCaption = String(new FormData(e.target).get("caption") || "").trim().slice(0, 160);
      saveUI();
      toast("Caption saved.");
      return;
    }
    if (e.target.id === "paste-form") {
      e.preventDefault();
      const fd = new FormData(e.target);
      const text = String(fd.get("text") || "").trim();
      if (text.length < 40) return toast("Paste a bit more text first.");
      const title = String(fd.get("title") || "").trim() || text.split(/\r?\n/)[0].slice(0, 60);
      LIB.save({ title, kind: "text", text })
        .then(() => {
          e.target.reset();
          toast("Added to your library.");
          fillLibrary();
        })
        .catch((err) => toast(err.message || "Could not save that text."));
      return;
    }
    if (e.target.id === "search-form") {
      e.preventDefault();
      const v = $("#search-input").value.trim();
      go("#/search?q=" + encodeURIComponent(v));
    }
  });

  document.addEventListener("input", (e) => {
    if (e.target.id === "typed" && sess && sess.kind === "q") {
      sess.typed[sess.ids[sess.i]] = e.target.value;
    }
  });

  /* keyboard shortcuts for practice, exam and flashcards */
  document.addEventListener("keydown", (e) => {
    if (!sess || e.target.matches?.("input, textarea, select") || e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key;
    if (sess.kind === "cards") {
      if (k === " " || k === "Enter") { e.preventDefault(); ACTIONS.flip(); }
      else if (sess.flipped && "1234".includes(k)) ACTIONS.rate({ dataset: { r: ["again", "hard", "good", "easy"][Number(k) - 1] } });
      return;
    }
    if (sess.phase !== "take" || sess.phase === "done") return;
    if (sess.exam) {
      if (k === "ArrowRight") ACTIONS.next();
      else if (k === "ArrowLeft") ACTIONS.prev();
      return;
    }
    const id = sess.ids[sess.i];
    const q = QMAP[id];
    if (k === " " && !q.options && !sess.cur.revealed) { e.preventDefault(); ACTIONS.reveal(); }
    else if (k === "Enter" || k === "ArrowRight") { e.preventDefault(); ACTIONS.next(); }
    else if (k === "f" || k === "F") ACTIONS.flag();
    else if (sess.cur.revealed && !sess.res[id] && "123".includes(k)) {
      ACTIONS.grade({ dataset: { res: ["missed", "partial", "got"][Number(k) - 1] } });
    }
  });

  /* ---------- boot ---------- */
  if (S.settings.theme) document.documentElement.dataset.theme = S.settings.theme;
  renderNav();
  applyLook();
  const sForm = document.getElementById("search-form");
  if (sForm) sForm.setAttribute("autocomplete", "off");
  window.addEventListener("hashchange", route);
  route();
})();
