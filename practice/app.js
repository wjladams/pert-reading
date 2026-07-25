/* PERT Reading Practice — Option C hybrid (GitHub Pages + localStorage) */
(function () {
  "use strict";

  const STORAGE_KEY = "pert-reading-practice-v1";
  const MIXED_SIZE = 10;
  const MOCK_SIZE = 25;
  const DRILL_SIZE = 8;

  /** @type {{ version: number, skills: Array<{id:string,name:string}>, questions: Array<any> } | null} */
  let bank = null;

  /** @type {{
   *  bySkill: Record<string, { correct: number, attempted: number }>,
   *  missedIds: string[],
   *  attempts: Array<{ at: string, mode: string, correct: number, total: number }>,
   *  totalCorrect: number,
   *  totalAttempted: number
   * }} */
  let store = loadStore();

  /** @type {{
   *  mode: string,
   *  skillId: string|null,
   *  queue: any[],
   *  index: number,
   *  selected: number|null,
   *  locked: boolean,
   *  showFeedback: boolean,
   *  answers: Array<{ id: string, skill: string, choice: number, correct: boolean }>
   * } | null} */
  let session = null;

  const $ = (id) => document.getElementById(id);

  function defaultStore() {
    return {
      bySkill: {},
      missedIds: [],
      attempts: [],
      totalCorrect: 0,
      totalAttempted: 0,
    };
  }

  function loadStore() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultStore();
      const parsed = JSON.parse(raw);
      return {
        ...defaultStore(),
        ...parsed,
        bySkill: parsed.bySkill || {},
        missedIds: Array.isArray(parsed.missedIds) ? parsed.missedIds : [],
        attempts: Array.isArray(parsed.attempts) ? parsed.attempts : [],
      };
    } catch {
      return defaultStore();
    }
  }

  function saveStore() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    updateHomeCounts();
  }

  function skillName(id) {
    const s = bank.skills.find((x) => x.id === id);
    return s ? s.name : id;
  }

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  /** Shuffle A–D order so the keyed answer is not stuck in early slots. */
  function withShuffledChoices(q) {
    const order = shuffle([0, 1, 2, 3]);
    return {
      ...q,
      choices: order.map((i) => q.choices[i]),
      correct: order.indexOf(q.correct),
    };
  }

  function questionsForSkill(skillId) {
    return bank.questions.filter((q) => q.skill === skillId);
  }

  function showView(name) {
    document.querySelectorAll(".view").forEach((el) => el.classList.remove("active"));
    const view = $("view-" + name);
    if (view) view.classList.add("active");
    document.querySelectorAll("#main-nav .nav-link").forEach((link) => {
      link.classList.toggle("active", link.dataset.route === name);
    });
  }

  function routeFromHash() {
    const raw = (location.hash || "#home").replace(/^#/, "");
    const route = raw.split("?")[0] || "home";
    if (route === "quiz" || route === "results") {
      if (route === "results" && session && session.index >= session.queue.length) {
        showView("results");
        return;
      }
      if (route === "quiz" && session) {
        showView("quiz");
        return;
      }
      location.hash = "#home";
      return;
    }
    if (route === "drill") renderDrill();
    if (route === "missed") renderMissed();
    if (route === "progress") renderProgress();
    if (route === "home") updateHomeCounts();
    showView(route);
  }

  function updateHomeCounts() {
    if ($("bank-count") && bank) $("bank-count").textContent = String(bank.questions.length);
    if ($("home-missed-count")) $("home-missed-count").textContent = String(store.missedIds.length);
  }

  function renderDrill() {
    const list = $("skill-list");
    list.innerHTML = "";
    bank.skills.forEach((skill) => {
      const qs = questionsForSkill(skill.id);
      const stats = store.bySkill[skill.id] || { correct: 0, attempted: 0 };
      const pct = stats.attempted ? Math.round((100 * stats.correct) / stats.attempted) : null;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "list-group-item list-group-item-action d-flex justify-content-between align-items-center";
      btn.innerHTML =
        `<span><strong>${escapeHtml(skill.name)}</strong>` +
        `<span class="text-secondary small d-block">${qs.length} in bank` +
        (pct !== null ? ` · your accuracy ${pct}%` : "") +
        `</span></span>` +
        `<span class="badge text-bg-primary rounded-pill">Practice</span>`;
      btn.addEventListener("click", () => startSession("drill", skill.id));
      list.appendChild(btn);
    });
  }

  function renderMissed() {
    const panel = $("missed-panel");
    const ids = store.missedIds.filter((id) => bank.questions.some((q) => q.id === id));
    store.missedIds = ids;
    saveStore();
    if (!ids.length) {
      panel.innerHTML =
        `<div class="alert alert-success mb-0">No missed questions queued. Misses from drills, mixed sets, and mocks appear here.</div>`;
      return;
    }
    panel.innerHTML =
      `<p class="text-secondary">${ids.length} question(s) in your missed queue.</p>` +
      `<button type="button" class="btn btn-primary" id="btn-start-missed">Review missed</button>`;
    $("btn-start-missed").addEventListener("click", () => startSession("missed"));
  }

  function startSession(mode, skillId) {
    let queue = [];
    if (mode === "drill") {
      queue = shuffle(questionsForSkill(skillId)).slice(0, DRILL_SIZE);
    } else if (mode === "mixed") {
      queue = shuffle(bank.questions).slice(0, Math.min(MIXED_SIZE, bank.questions.length));
    } else if (mode === "mock") {
      queue = shuffle(bank.questions).slice(0, Math.min(MOCK_SIZE, bank.questions.length));
    } else if (mode === "missed") {
      queue = shuffle(
        store.missedIds
          .map((id) => bank.questions.find((q) => q.id === id))
          .filter(Boolean)
      );
    }
    if (!queue.length) {
      alert("No questions available for this mode yet.");
      return;
    }
    // Fresh A–D order every time a set starts (and per item)
    queue = queue.map(withShuffledChoices);
    session = {
      mode,
      skillId: skillId || null,
      queue,
      index: 0,
      selected: null,
      locked: false,
      showFeedback: mode !== "mock",
      answers: [],
    };
    location.hash = "#quiz";
    renderQuestion();
    showView("quiz");
  }

  function currentQuestion() {
    return session && session.queue[session.index];
  }

  function renderQuestion() {
    const q = currentQuestion();
    if (!q) {
      finishSession();
      return;
    }
    const total = session.queue.length;
    const n = session.index + 1;
    $("quiz-mode-label").textContent = modeLabel(session.mode);
    $("quiz-skill-label").textContent = skillName(q.skill);
    $("quiz-progress-label").textContent = `Question ${n} of ${total}`;
    $("quiz-progress-bar").style.width = `${Math.round(((n - 1) / total) * 100)}%`;
    $("quiz-passage").textContent = q.passage;
    $("quiz-stem").textContent = q.stem;

    const box = $("quiz-choices");
    box.innerHTML = "";
    q.choices.forEach((text, i) => {
      const label = document.createElement("label");
      label.className = "choice-label d-flex gap-2 align-items-start";
      label.dataset.index = String(i);
      label.innerHTML =
        `<input class="form-check-input mt-1 flex-shrink-0" type="radio" name="choice" value="${i}">` +
        `<span><span class="fw-semibold me-1">${String.fromCharCode(65 + i)}.</span>${escapeHtml(text)}</span>`;
      label.addEventListener("click", () => {
        if (session.locked) return;
        session.selected = i;
        box.querySelectorAll(".choice-label").forEach((el) => el.classList.remove("selected"));
        label.classList.add("selected");
        label.querySelector("input").checked = true;
      });
      box.appendChild(label);
    });

    session.selected = null;
    session.locked = false;
    $("feedback-box").style.display = "none";
    $("btn-submit").classList.remove("d-none");
    $("btn-submit").disabled = false;
    $("btn-next").classList.add("d-none");
  }

  function modeLabel(mode) {
    return (
      {
        drill: "Skill drill",
        mixed: "Mixed practice",
        mock: "Mock exam",
        missed: "Missed review",
      }[mode] || mode
    );
  }

  function submitAnswer() {
    if (!session || session.locked) return;
    if (session.selected === null) {
      alert("Select an answer first.");
      return;
    }
    const q = currentQuestion();
    const correct = session.selected === q.correct;
    session.locked = true;
    $("btn-submit").classList.add("d-none");

    recordAnswer(q, session.selected, correct);

    const labels = $("quiz-choices").querySelectorAll(".choice-label");
    labels.forEach((el, i) => {
      el.querySelector("input").disabled = true;
      if (i === q.correct) el.classList.add("correct");
      if (i === session.selected && !correct) el.classList.add("incorrect");
    });

    if (session.showFeedback) {
      const fb = $("feedback-box");
      fb.style.display = "block";
      fb.className = "alert mb-3 " + (correct ? "alert-success" : "alert-danger");
      $("feedback-title").textContent = correct ? "Correct" : "Not quite";
      $("feedback-body").textContent = q.explanation || "";
      $("btn-next").classList.remove("d-none");
      $("btn-next").textContent = session.index + 1 >= session.queue.length ? "See results" : "Next";
    } else {
      // Mock: brief pause then advance
      setTimeout(() => {
        session.index += 1;
        if (session.index >= session.queue.length) finishSession();
        else renderQuestion();
      }, 350);
    }
  }

  function recordAnswer(q, choice, correct) {
    session.answers.push({ id: q.id, skill: q.skill, choice, correct });

    if (!store.bySkill[q.skill]) store.bySkill[q.skill] = { correct: 0, attempted: 0 };
    store.bySkill[q.skill].attempted += 1;
    if (correct) store.bySkill[q.skill].correct += 1;
    store.totalAttempted += 1;
    if (correct) store.totalCorrect += 1;

    const missed = new Set(store.missedIds);
    if (correct) missed.delete(q.id);
    else missed.add(q.id);
    store.missedIds = Array.from(missed);
    saveStore();
  }

  function nextQuestion() {
    if (!session) return;
    session.index += 1;
    if (session.index >= session.queue.length) finishSession();
    else renderQuestion();
  }

  function finishSession() {
    if (!session) return;
    const correct = session.answers.filter((a) => a.correct).length;
    const total = session.answers.length;
    store.attempts.unshift({
      at: new Date().toISOString(),
      mode: session.mode,
      correct,
      total,
    });
    store.attempts = store.attempts.slice(0, 20);
    saveStore();

    $("results-score").textContent = total ? `${Math.round((100 * correct) / total)}%` : "—";
    $("results-correct").textContent = `${correct} / ${total}`;
    $("results-mode").textContent = modeLabel(session.mode);

    const bySkill = {};
    session.answers.forEach((a) => {
      if (!bySkill[a.skill]) bySkill[a.skill] = { correct: 0, total: 0 };
      bySkill[a.skill].total += 1;
      if (a.correct) bySkill[a.skill].correct += 1;
    });
    const skillBox = $("results-by-skill");
    skillBox.innerHTML = Object.keys(bySkill)
      .map((id) => {
        const s = bySkill[id];
        const pct = Math.round((100 * s.correct) / s.total);
        return (
          `<div class="progress-skill-row">` +
          `<div class="d-flex justify-content-between small"><span>${escapeHtml(skillName(id))}</span>` +
          `<span>${s.correct}/${s.total} (${pct}%)</span></div>` +
          `<div class="progress" style="height:8px"><div class="progress-bar ${pctBar(pct)}" style="width:${pct}%"></div></div>` +
          `</div>`
        );
      })
      .join("");

    const items = $("results-items");
    items.innerHTML = session.answers
      .map((a, i) => {
        const q = session.queue.find((x) => x.id === a.id) || bank.questions.find((x) => x.id === a.id);
        return (
          `<div class="border rounded p-3 mb-2">` +
          `<div class="small text-secondary">#${i + 1} · ${escapeHtml(skillName(a.skill))} · ` +
          `<span class="${a.correct ? "text-success" : "text-danger"}">${a.correct ? "Correct" : "Incorrect"}</span></div>` +
          `<div class="fw-semibold">${escapeHtml(q.stem)}</div>` +
          (!a.correct
            ? `<div class="small mt-1"><span class="text-danger">Your answer:</span> ${escapeHtml(q.choices[a.choice])}</div>` +
              `<div class="small"><span class="text-success">Best answer:</span> ${escapeHtml(q.choices[q.correct])}</div>`
            : "") +
          `<div class="small text-secondary mt-1">${escapeHtml(q.explanation || "")}</div>` +
          `</div>`
        );
      })
      .join("");

    location.hash = "#results";
    showView("results");
  }

  function pctBar(pct) {
    if (pct >= 80) return "bg-success";
    if (pct >= 60) return "bg-warning";
    return "bg-danger";
  }

  function renderProgress() {
    $("prog-answered").textContent = String(store.totalAttempted);
    $("prog-accuracy").textContent = store.totalAttempted
      ? `${Math.round((100 * store.totalCorrect) / store.totalAttempted)}%`
      : "—";
    $("prog-missed").textContent = String(store.missedIds.length);

    const box = $("prog-skills");
    box.innerHTML = bank.skills
      .map((skill) => {
        const s = store.bySkill[skill.id] || { correct: 0, attempted: 0 };
        const pct = s.attempted ? Math.round((100 * s.correct) / s.attempted) : 0;
        const label = s.attempted ? `${s.correct}/${s.attempted} (${pct}%)` : "Not practiced";
        return (
          `<div class="progress-skill-row">` +
          `<div class="d-flex justify-content-between small"><span>${escapeHtml(skill.name)}</span>` +
          `<span>${label}</span></div>` +
          `<div class="progress" style="height:8px"><div class="progress-bar ${s.attempted ? pctBar(pct) : "bg-secondary"}" style="width:${s.attempted ? pct : 0}%"></div></div>` +
          `</div>`
        );
      })
      .join("");

    const att = $("prog-attempts");
    if (!store.attempts.length) {
      att.innerHTML = `<p class="text-secondary mb-0">No completed sets yet.</p>`;
    } else {
      att.innerHTML =
        `<ul class="list-unstyled mb-0">` +
        store.attempts
          .map((a) => {
            const when = new Date(a.at).toLocaleString();
            const pct = a.total ? Math.round((100 * a.correct) / a.total) : 0;
            return `<li class="mb-1">${escapeHtml(when)} — ${escapeHtml(modeLabel(a.mode))}: ${a.correct}/${a.total} (${pct}%)</li>`;
          })
          .join("") +
        `</ul>`;
    }
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function exportProgress() {
    const blob = new Blob([JSON.stringify(store, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pert-reading-progress-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function importProgress(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (!data || typeof data !== "object") throw new Error("Invalid file");
        store = {
          ...defaultStore(),
          ...data,
          bySkill: data.bySkill || {},
          missedIds: Array.isArray(data.missedIds) ? data.missedIds : [],
          attempts: Array.isArray(data.attempts) ? data.attempts : [],
        };
        saveStore();
        renderProgress();
        alert("Progress imported.");
      } catch (e) {
        alert("Could not import that file.");
      }
    };
    reader.readAsText(file);
  }

  function clearProgress() {
    if (!confirm("Clear all progress on this device?")) return;
    store = defaultStore();
    saveStore();
    renderProgress();
  }

  function wireUi() {
    $("btn-start-mixed").addEventListener("click", () => startSession("mixed"));
    $("btn-start-mock").addEventListener("click", () => startSession("mock"));
    $("btn-submit").addEventListener("click", submitAnswer);
    $("btn-next").addEventListener("click", nextQuestion);
    $("btn-quit-quiz").addEventListener("click", () => {
      if (session && session.answers.length && !confirm("Quit this set? Progress on answered items is already saved.")) {
        return;
      }
      session = null;
      location.hash = "#home";
    });
    $("btn-export").addEventListener("click", exportProgress);
    $("input-import").addEventListener("change", (e) => {
      const file = e.target.files && e.target.files[0];
      if (file) importProgress(file);
      e.target.value = "";
    });
    $("btn-clear").addEventListener("click", clearProgress);
    window.addEventListener("hashchange", routeFromHash);
  }

  async function init() {
    wireUi();
    try {
      const res = await fetch("./questions.json");
      if (!res.ok) throw new Error("HTTP " + res.status);
      bank = await res.json();
      updateHomeCounts();
      routeFromHash();
    } catch (err) {
      const el = $("load-error");
      el.classList.remove("d-none");
      el.textContent =
        "Could not load questions.json. If you opened this as a local file, use a static server or GitHub Pages (fetch needs http/https).";
      console.error(err);
    }
  }

  init();
})();
