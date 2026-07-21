(function () {
  "use strict";

  const banks = Array.isArray(window.QUESTION_BANKS) ? window.QUESTION_BANKS : [];
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const punctuationPattern = /[\u3001\u3002\uff0c\uff1a\uff1b\uff08\uff09\u3010\u3011\u300a\u300b\uff1f\uff01\u201c\u201d\u2018\u2019,.:"'()[\]<>?!]/g;
  const state = {
    activeBank: "all",
    query: "",
    selectedId: null,
    results: [],
    renderToken: 0
  };

  const text = {
    bankFallback: "\u9898\u5e93",
    inputHint: "\u8bf7\u8f93\u5165\u5173\u952e\u8bcd\u5f00\u59cb\u67e5\u8be2",
    found: "\u627e\u5230",
    results: "\u6761\u7ed3\u679c",
    noMatch: "\u6ca1\u6709\u5339\u914d\u7ed3\u679c",
    waitInput: "\u7b49\u5f85\u8f93\u5165\u5173\u952e\u8bcd",
    answer: "\u7b54\u6848",
    copied: "\u5df2\u590d\u5236",
    copiedBank: "\u9898\u5e93\uff1a",
    copiedSource: "\u6765\u6e90\uff1a",
    copiedNo: "\u9898\u53f7\uff1a",
    copiedTitle: "\u9898\u76ee\uff1a",
    copiedAnswer: "\u7b54\u6848\uff1a",
    copiedExplain: "\u89e3\u6790\uff1a"
  };

  const $ = (id) => document.getElementById(id);
  const els = {
    query: $("query"),
    clearBtn: $("clearBtn"),
    filters: $("bankFilters"),
    resultCount: $("resultCount"),
    resultList: $("resultList"),
    modal: $("detailModal"),
    closeModalBtn: $("closeModalBtn"),
    detailTitle: $("detailTitle"),
    detailOptions: $("detailOptions"),
    detailAnswer: $("detailAnswer"),
    explainBlock: $("explainBlock"),
    detailExplain: $("detailExplain"),
    copyBtn: $("copyBtn"),
    toast: $("toast")
  };

  function focusQuery() {
    if (els.modal && !els.modal.classList.contains("hidden")) return;
    try {
      els.query.focus({ preventScroll: true });
    } catch (_error) {
      els.query.focus();
    }
  }

  const items = [];
  banks.forEach((bank, bankIndex) => {
    (bank.q || []).forEach((q, questionIndex) => {
      const id = `${bankIndex}-${questionIndex}`;
      const options = Array.isArray(q.o) ? q.o : [];
      const sources = Array.isArray(q._sources) ? q._sources.map(String) : [];
      const textForSearch = [q.s, ...options, q.a, q.x, ...sources].filter(Boolean).join(" ");
      items.push({
        id,
        bankIndex,
        bankName: bank.name || bank.t || `${text.bankFallback} ${bankIndex + 1}`,
        questionNo: q.i || questionIndex + 1,
        title: String(q.s || ""),
        options: options.map(String),
        answer: String(q.a || ""),
        explain: String(q.x || ""),
        sources,
        haystack: normalize(textForSearch),
        titleNorm: normalize(q.s || ""),
        optionNorm: normalize(options.join(" ")),
        optionNorms: options.map(normalize)
      });
    });
  });

  function normalize(value) {
    return String(value)
      .toLowerCase()
      .replace(/\s+/g, "")
      .replace(punctuationPattern, "");
  }

  function splitTerms(query) {
    const clean = String(query || "").trim().toLowerCase();
    if (!clean) return [];
    const rough = clean.split(/[\s,，;；]+/).filter(Boolean);
    if (rough.length > 1) return rough.map(normalize).filter(Boolean);
    const compact = normalize(clean);
    return compact ? [compact] : [];
  }

  function bigrams(value) {
    if (value.length <= 2) return [value];
    const parts = [];
    for (let i = 0; i < value.length - 1; i += 1) {
      parts.push(value.slice(i, i + 2));
    }
    return Array.from(new Set(parts));
  }

  function fuzzyCoverage(needle, haystack) {
    const parts = bigrams(needle);
    if (!parts.length) return 0;
    let hits = 0;
    for (const part of parts) {
      if (haystack.includes(part)) hits += 1;
    }
    return hits / parts.length;
  }

  function scoreItem(item, terms, mainTerm) {
    let score = 0;
    if (mainTerm) {
      if (item.titleNorm === mainTerm) score += 340;
      if (item.titleNorm.includes(mainTerm)) score += 210 + mainTerm.length * 10;
      if (item.optionNorms.some((option) => option === mainTerm)) score += 360;
      if (item.optionNorms.some((option) => option.includes(mainTerm))) score += 260 + mainTerm.length * 12;
      if (item.haystack.includes(mainTerm)) score += 90;
      if (score === 0 && mainTerm.length >= 3) {
        const titleCoverage = fuzzyCoverage(mainTerm, item.titleNorm);
        const optionCoverage = Math.max(...item.optionNorms.map((option) => fuzzyCoverage(mainTerm, option)), 0);
        const allCoverage = fuzzyCoverage(mainTerm, item.haystack);
        if (titleCoverage >= 0.62) score += Math.round(110 * titleCoverage);
        if (optionCoverage >= 0.62) score += Math.round(130 * optionCoverage);
        if (allCoverage >= 0.72) score += Math.round(50 * allCoverage);
      }
    }
    for (const term of terms) {
      if (!term) continue;
      const titlePos = item.titleNorm.indexOf(term);
      const optionPos = item.optionNorm.indexOf(term);
      const allPos = item.haystack.indexOf(term);
      if (titlePos >= 0) score += 90 + Math.max(0, 24 - titlePos);
      if (optionPos >= 0) score += 56 + Math.max(0, 14 - optionPos);
      if (allPos >= 0) score += 26;
    }
    return score;
  }

  function runSearch() {
    const query = els.query.value.trim();
    state.query = query;
    const terms = splitTerms(query);
    const mainTerm = terms[0] || "";
    const pool = state.activeBank === "all"
      ? items
      : items.filter((item) => item.bankIndex === state.activeBank);

    if (!terms.length) {
      state.results = [];
      els.resultCount.textContent = text.inputHint;
      renderResults([]);
      return;
    }

    const scored = [];
    for (const item of pool) {
      const score = scoreItem(item, terms, mainTerm);
      if (score > 0) scored.push({ item, score });
    }
    scored.sort((a, b) => b.score - a.score || a.item.questionNo - b.item.questionNo);
    state.results = scored.slice(0, 500).map((entry) => entry.item);
    els.resultCount.textContent = `${text.found} ${scored.length} ${text.results}`;
    renderResults(state.results);
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[char]));
  }

  function highlight(value) {
    const source = escapeHtml(value);
    const term = state.query.trim();
    if (!term || term.length > 40) return source;
    const safeTerm = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return source.replace(new RegExp(`(${safeTerm})`, "ig"), "<mark>$1</mark>");
  }

  function renderResults(results) {
    state.renderToken += 1;
    const token = state.renderToken;
    els.resultList.textContent = "";

    if (!results.length) {
      const empty = document.createElement("div");
      empty.className = "result-item empty-result";
      empty.innerHTML = `<div class="result-title">${state.query ? text.noMatch : text.waitInput}</div>`;
      els.resultList.appendChild(empty);
      return;
    }

    const firstBatch = results.slice(0, 80);
    appendBatch(firstBatch, 0);
    let index = firstBatch.length;

    function appendBatch(batch, offset) {
      const frag = document.createDocumentFragment();
      batch.forEach((item, localIndex) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = `result-item${item.id === state.selectedId ? " active" : ""}`;
        btn.dataset.id = item.id;
        btn.style.setProperty("--i", String(Math.min((offset + localIndex) % 12, 11)));
        btn.innerHTML = `
          <div class="result-title">${highlight(item.title)}</div>
          <div class="option-preview">
            ${item.options.map((opt, i) => {
              const letter = letters[i];
              const correct = item.answer.toUpperCase().includes(letter);
              return `
                <span class="preview-option${correct ? " correct" : ""}">
                  <span class="preview-letter">${letter}</span>
                  <span class="preview-text">${highlight(opt)}</span>
                </span>
              `;
            }).join("")}
          </div>
        `;
        frag.appendChild(btn);
      });
      els.resultList.appendChild(frag);
    }

    function renderMore() {
      if (token !== state.renderToken || index >= results.length) return;
      appendBatch(results.slice(index, index + 80), index);
      index += 80;
      requestAnimationFrame(renderMore);
    }
    requestAnimationFrame(renderMore);
  }

  function selectItem(id) {
    const item = items.find((entry) => entry.id === id);
    if (!item) return;
    state.selectedId = id;
    els.detailTitle.textContent = item.title;
    els.detailAnswer.textContent = item.answer || "-";
    els.detailOptions.textContent = "";
    item.options.forEach((option, index) => {
      const li = document.createElement("li");
      li.textContent = option;
      li.style.setProperty("--i", String(index));
      if (letters[index] === item.answer) li.className = "correct";
      els.detailOptions.appendChild(li);
    });
    const explain = item.explain.trim();
    els.explainBlock.classList.toggle("hidden", !explain);
    els.detailExplain.textContent = explain;
    document.querySelectorAll(".result-item.active").forEach((node) => node.classList.remove("active"));
    const active = els.resultList.querySelector(`[data-id="${CSS.escape(id)}"]`);
    if (active) active.classList.add("active");
    openModal();
  }

  function openModal() {
    els.modal.classList.remove("hidden");
    document.body.classList.add("modal-open");
    els.closeModalBtn.focus();
  }

  function closeModal() {
    els.modal.classList.add("hidden");
    document.body.classList.remove("modal-open");
    focusQuery();
  }

  function copyCurrent() {
    const item = items.find((entry) => entry.id === state.selectedId);
    if (!item) return;
    const lines = [
      `${text.copiedBank}${item.bankName}`,
      item.sources.length ? `${text.copiedSource}${item.sources.join(" / ")}` : "",
      `${text.copiedNo}${item.questionNo}`,
      `${text.copiedTitle}${item.title}`,
      ...item.options.map((option, index) => `${letters[index]}. ${option}`),
      `${text.copiedAnswer}${item.answer || "-"}`,
      item.explain ? `${text.copiedExplain}${item.explain}` : ""
    ].filter(Boolean);
    navigator.clipboard.writeText(lines.join("\n")).then(showToast).catch(() => {
      const area = document.createElement("textarea");
      area.value = lines.join("\n");
      document.body.appendChild(area);
      area.select();
      document.execCommand("copy");
      area.remove();
      showToast();
    });
  }

  function showToast() {
    els.toast.textContent = text.copied;
    els.toast.classList.add("show");
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => els.toast.classList.remove("show"), 1400);
  }

  function buildFilters() {
    els.filters.textContent = "";
    if (banks.length <= 1) {
      els.filters.classList.add("hidden");
      return;
    }
    els.filters.classList.remove("hidden");
    const all = document.createElement("button");
    all.className = "filter active";
    all.type = "button";
    all.dataset.bank = "all";
    all.textContent = "\u5168\u90e8";
    els.filters.appendChild(all);
    banks.forEach((bank, index) => {
      const btn = document.createElement("button");
      btn.className = "filter";
      btn.type = "button";
      btn.dataset.bank = String(index);
      btn.textContent = `${bank.name || `${text.bankFallback}${index + 1}`} (${(bank.q || []).length})`;
      els.filters.appendChild(btn);
    });
  }

  function debounce(fn, wait) {
    let timer = 0;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), wait);
    };
  }

  buildFilters();
  renderResults([]);
  focusQuery();

  const debouncedSearch = debounce(runSearch, 60);
  els.query.addEventListener("input", debouncedSearch);
  els.clearBtn.addEventListener("click", () => {
    els.query.value = "";
    focusQuery();
    runSearch();
  });
  els.filters.addEventListener("click", (event) => {
    const btn = event.target.closest(".filter");
    if (!btn) return;
    document.querySelectorAll(".filter.active").forEach((node) => node.classList.remove("active"));
    btn.classList.add("active");
    state.activeBank = btn.dataset.bank === "all" ? "all" : Number(btn.dataset.bank);
    runSearch();
  });
  els.resultList.addEventListener("click", (event) => {
    const btn = event.target.closest(".result-item[data-id]");
    if (btn) selectItem(btn.dataset.id);
  });
  els.copyBtn.addEventListener("click", copyCurrent);
  els.closeModalBtn.addEventListener("click", closeModal);
  els.modal.addEventListener("click", (event) => {
    if (event.target === els.modal) closeModal();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (!els.modal.classList.contains("hidden")) {
      closeModal();
      return;
    }
    if (els.query.value) {
      els.query.value = "";
      runSearch();
    }
  });
  document.addEventListener("click", () => {
    focusQuery();
  }, true);
})();
