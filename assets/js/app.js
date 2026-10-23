(function () {
  "use strict";

  /* ---------- Utilitários seguros ---------- */
  // Texto do usuário entra no DOM sempre por textContent (nunca innerHTML), o que evita XSS.
  function el(tag, attrs, kids) {
    var n = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v == null) return;
      if (k === "text") n.textContent = v;
      else if (k === "class") n.className = v;
      else if (k.slice(0, 2) === "on") n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v);
    });
    (kids || []).forEach(function (c) { if (c != null) n.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
    return n;
  }
  function $(id) { return document.getElementById(id); }
  function clear(n) { while (n.firstChild) n.removeChild(n.firstChild); }
  function uid() {
    var a = new Uint32Array(2);
    window.crypto.getRandomValues(a);
    return a[0].toString(36) + a[1].toString(36);
  }
  var DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  function str(v, max) { return typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, max) : ""; }
  function parseD(s) { var p = s.split("-"); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function iso(d) { return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
  function okDate(v) {
    if (typeof v !== "string" || !DATE_RE.test(v)) return false;
    var d = parseD(v);
    return !isNaN(d) && d.getFullYear() > 1990 && d.getFullYear() < 2100 && iso(d) === v;
  }
  var today = new Date(); today.setHours(0, 0, 0, 0);
  function addDays(n) { var d = new Date(today); d.setDate(d.getDate() + n); return iso(d); }
  function daysUntil(s) { return Math.round((parseD(s) - today) / 86400000); }
  var fmtDay = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" });
  var fmtLong = new Intl.DateTimeFormat("pt-BR", { weekday: "short", day: "2-digit", month: "short" });
  var fmtMonth = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" });
  var BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
  function rel(n) {
    if (n === 0) return "hoje";
    if (n === 1) return "amanhã";
    if (n === -1) return "ontem";
    return n > 0 ? "em " + n + " dias" : "há " + (-n) + " dias";
  }
  var toastT;
  function toast(msg) {
    var t = $("toast"); t.textContent = msg; t.hidden = false;
    clearTimeout(toastT); toastT = setTimeout(function () { t.hidden = true; }, 2600);
  }
  // Preferências deste aparelho (Configurações): sons, vibração, tamanho do texto e menos animações
  var PREF_KEY = "portalFuturo.prefs";
  var prefs = (function () {
    var p = { sound: true, vib: true, text: "md", calm: false };
    try {
      var j = JSON.parse(localStorage.getItem(PREF_KEY) || "null");
      if (j && typeof j === "object") {
        if (typeof j.sound === "boolean") p.sound = j.sound;
        if (typeof j.vib === "boolean") p.vib = j.vib;
        if (["md", "lg", "xl"].indexOf(j.text) >= 0) p.text = j.text;
        if (typeof j.calm === "boolean") p.calm = j.calm;
      }
    } catch (e) {}
    return p;
  })();
  function savePrefs() { try { localStorage.setItem(PREF_KEY, JSON.stringify(prefs)); } catch (e) {} }
  var motionMQ = window.matchMedia("(prefers-reduced-motion: reduce)");
  var reduceMotion = motionMQ.matches || prefs.calm;
  document.documentElement.setAttribute("data-text", prefs.text);
  document.documentElement.classList.toggle("calm", prefs.calm);

  /* ---------- Dados (salvos só neste navegador) ---------- */
  var KEY = "portalFuturo.v1";
  var CATS_OUT = ["Moradia", "Alimentação", "Transporte", "Material e livros", "Mensalidade", "Lazer", "Saúde", "Outros"];
  var CATS_IN = ["Bolsa ou auxílio", "Estágio ou trabalho", "Família", "Outros"];
  var TIPOS_PROVA = ["Prova", "Trabalho", "Seminário", "Recuperação"];
  var TIPOS_ATIV = ["Entrega", "Prazo acadêmico", "Evento", "Grupo de estudo"];
  var DOCS = [
    "RG ou CNH", "CPF", "Certidão de nascimento ou casamento", "Histórico escolar do ensino médio",
    "Certificado de conclusão do ensino médio", "Comprovante de residência", "Título de eleitor e quitação eleitoral (18+)",
    "Certificado de reservista (homens 18+)", "Foto 3x4 recente", "Boletim de notas do ENEM"
  ];
  var LIMITS = { fin: 2000, provas: 300, ativ: 500 };

  function seed() {
    var m = addDays;
    return {
      fin: [
        { id: uid(), desc: "Auxílio estudantil", val: 700, tipo: "entrada", cat: "Bolsa ou auxílio", data: m(-14), ex: true },
        { id: uid(), desc: "Estágio (meio período)", val: 1200, tipo: "entrada", cat: "Estágio ou trabalho", data: m(-10), ex: true },
        { id: uid(), desc: "Aluguel em Barão Geraldo", val: 850, tipo: "saida", cat: "Moradia", data: m(-12), ex: true },
        { id: uid(), desc: "Créditos do bandejão", val: 120, tipo: "saida", cat: "Alimentação", data: m(-9), ex: true },
        { id: uid(), desc: "Recarga Bus+ (Sumaré ⇄ Campinas)", val: 96, tipo: "saida", cat: "Transporte", data: m(-8), ex: true },
        { id: uid(), desc: "Livro de Cálculo (usado)", val: 65, tipo: "saida", cat: "Material e livros", data: m(-5), ex: true },
        { id: uid(), desc: "Mercado", val: 210.4, tipo: "saida", cat: "Alimentação", data: m(-3), ex: true },
        { id: uid(), desc: "Cinema no shopping (meia-entrada)", val: 18, tipo: "saida", cat: "Lazer", data: m(-1), ex: true }
      ],
      provas: [
        { id: uid(), disc: "Cálculo I", tipo: "Prova", data: m(4), cont: "Limites e derivadas", ex: true },
        { id: uid(), disc: "Física Geral", tipo: "Trabalho", data: m(9), cont: "Relatório do pêndulo simples", ex: true },
        { id: uid(), disc: "Algoritmos", tipo: "Prova", data: m(18), cont: "Laços e vetores", ex: true }
      ],
      ativ: [
        { id: uid(), tit: "Rematrícula para 2027.1", tipo: "Prazo acadêmico", data: m(25), done: false, ex: true },
        { id: uid(), tit: "Grupo de estudo de Cálculo na Biblioteca Central", tipo: "Grupo de estudo", data: m(2), done: false, ex: true },
        { id: uid(), tit: "Passeio na Lagoa do Taquaral com a turma", tipo: "Evento", data: m(11), done: false, ex: true },
        { id: uid(), tit: "Entregar lista 2 de Algoritmos", tipo: "Entrega", data: m(6), done: false, ex: true },
        { id: uid(), tit: "Renovar livros da biblioteca", tipo: "Prazo acadêmico", data: m(-2), done: true, ex: true }
      ],
      docs: {}, calc: null, theme: null
    };
  }

  // Valida tudo o que vem do armazenamento: tipos, tamanhos e datas. Registros inválidos são descartados.
  function sanitize(raw) {
    if (!raw || typeof raw !== "object") return null;
    var s = { fin: [], provas: [], ativ: [], docs: {}, calc: null, theme: null };
    (Array.isArray(raw.fin) ? raw.fin : []).slice(0, LIMITS.fin).forEach(function (x) {
      if (!x || typeof x !== "object") return;
      var val = Number(x.val), tipo = x.tipo === "entrada" ? "entrada" : "saida";
      var cats = tipo === "entrada" ? CATS_IN : CATS_OUT;
      if (!isFinite(val) || val <= 0 || val > 1e6 || !okDate(x.data) || !str(x.desc, 60)) return;
      s.fin.push({ id: str(x.id, 20) || uid(), desc: str(x.desc, 60), val: Math.round(val * 100) / 100, tipo: tipo, cat: cats.indexOf(x.cat) >= 0 ? x.cat : "Outros", data: x.data, ex: x.ex === true });
    });
    (Array.isArray(raw.provas) ? raw.provas : []).slice(0, LIMITS.provas).forEach(function (x) {
      if (!x || typeof x !== "object" || !okDate(x.data) || !str(x.disc, 50)) return;
      s.provas.push({ id: str(x.id, 20) || uid(), disc: str(x.disc, 50), tipo: TIPOS_PROVA.indexOf(x.tipo) >= 0 ? x.tipo : "Prova", data: x.data, cont: str(x.cont, 80), ex: x.ex === true });
    });
    (Array.isArray(raw.ativ) ? raw.ativ : []).slice(0, LIMITS.ativ).forEach(function (x) {
      if (!x || typeof x !== "object" || !okDate(x.data) || !str(x.tit, 70)) return;
      s.ativ.push({ id: str(x.id, 20) || uid(), tit: str(x.tit, 70), tipo: TIPOS_ATIV.indexOf(x.tipo) >= 0 ? x.tipo : "Entrega", data: x.data, done: x.done === true, ex: x.ex === true });
    });
    if (raw.docs && typeof raw.docs === "object") DOCS.forEach(function (d, i) { if (raw.docs[i] === true) s.docs[i] = true; });
    if (Array.isArray(raw.calc)) s.calc = raw.calc.slice(0, 3).map(function (r) {
      return { n: r && typeof r.n === "string" ? r.n.slice(0, 5) : "", p: r && typeof r.p === "string" ? r.p.slice(0, 5) : "1" };
    });
    if (raw.theme === "dark" || raw.theme === "light") s.theme = raw.theme;
    var ids = ["biblioteca", "praca", "salas", "institutos", "labs", "ru", "admin", "apoio", "saude", "esporte", "moradia", "terminal", "portaria", "estacionamento", "convivencia", "verde"];
    s.campusFav = Array.isArray(raw.campusFav) ? raw.campusFav.filter(function (x, i, a) { return ids.indexOf(x) >= 0 && a.indexOf(x) === i; }) : [];
    s.busFav = Array.isArray(raw.busFav) ? raw.busFav.filter(function (x, i, a) { return typeof x === "string" && /^[0-9/]{1,9}$/.test(x) && a.indexOf(x) === i; }).slice(0, 60) : [];
    s.campusWeek = {};
    if (raw.campusWeek && typeof raw.campusWeek === "object") for (var w = 0; w < 10; w++) if (raw.campusWeek[w] === true) s.campusWeek[w] = true;
    return s;
  }

  // Cada conta tem seus próprios dados (chave "portalFuturo.v1.<id da conta>").
  // Sem ninguém conectado, o portal fica vazio e nada é gravado.
  var THEME_KEY = "portalFuturo.theme", dataKey = null;
  function readState(k) {
    try { var txt = localStorage.getItem(k); return txt ? sanitize(JSON.parse(txt)) : null; } catch (e) { return null; }
  }
  var state = sanitize({});
  var legacy = readState(KEY);
  var loadingData = false;
  function save() {
    if (!dataKey || loadingData) return;
    try { localStorage.setItem(dataKey, JSON.stringify(state)); } catch (e) { /* armazenamento indisponível: o portal segue funcionando nesta sessão */ }
    if (currentUser && currentUser.cloud) cloudSave();
  }
  var savedTheme = null;
  try { savedTheme = localStorage.getItem(THEME_KEY); } catch (e) {}
  if (savedTheme !== "dark" && savedTheme !== "light") savedTheme = legacy && legacy.theme ? legacy.theme : null;

  var root = document.documentElement;

  /* ---------- Tema claro e escuro ---------- */
  // Sem escolha salva, segue o aparelho (claro de dia para quem usa o modo automático).
  if (savedTheme) root.setAttribute("data-theme", savedTheme);
  var themeMQ = window.matchMedia("(prefers-color-scheme: dark)");
  function isDark() { var cur = root.getAttribute("data-theme"); return cur ? cur === "dark" : themeMQ.matches; }
  function themeLabel() {
    var btn = $("themeBtn"); if (!btn) return;
    btn.querySelector("use").setAttribute("href", isDark() ? "#i-sun" : "#i-moon");
    btn.setAttribute("aria-label", isDark() ? "Mudar para o modo claro" : "Mudar para o modo escuro");
    btn.title = isDark() ? "Modo claro" : "Modo escuro";
    var meta = document.querySelector('meta[name="theme-color"]'); if (meta) meta.content = isDark() ? "#00283f" : "#F6F3EC";
  }
  $("themeBtn").addEventListener("click", function () {
    var next = isDark() ? "light" : "dark";
    var apply = function () { root.setAttribute("data-theme", next); try { localStorage.setItem(THEME_KEY, next); } catch (e) {} themeLabel(); if (C3.repaint) C3.repaint(); };
    if (document.startViewTransition && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) document.startViewTransition(apply); else apply();
  });
  if (themeMQ.addEventListener) themeMQ.addEventListener("change", function () { themeLabel(); if (window.C3ref && window.C3ref.repaint) window.C3ref.repaint(); });
  themeLabel();

  /* ---------- Menu no celular e menu do guia ---------- */
  var mobileNav = $("mobileNav"), menuBtn = $("menuBtn");
  function setMenu(open) {
    mobileNav.classList.toggle("open", open);
    menuBtn.setAttribute("aria-expanded", String(open));
    menuBtn.setAttribute("aria-label", open ? "Fechar menu" : "Abrir menu");
    menuBtn.querySelector("use").setAttribute("href", open ? "#i-close" : "#i-menu");
    document.body.style.overflow = open ? "hidden" : "";
  }
  menuBtn.addEventListener("click", function () { setMenu(!mobileNav.classList.contains("open")); });
  function closeMenu() { setMenu(false); closeGuide(); closeSheet(); }

  /* ---------- Barra de abas e painéis de baixo (só no celular) ---------- */
  var openSheetEl = null, sheetOpener = null;
  function openSheet(id, opener) {
    var sh = $(id); if (!sh) return;
    if (openSheetEl && openSheetEl !== sh) closeSheet(true);
    openSheetEl = sh; sheetOpener = opener || null;
    sh.hidden = false; document.body.classList.add("sheet-open");
    if (opener) opener.setAttribute("aria-expanded", "true");
    requestAnimationFrame(function () { sh.classList.add("open"); var f = sh.querySelector(".sheet-item"); if (f) f.focus({ preventScroll: true }); });
  }
  function closeSheet(keepFocus) {
    var sh = openSheetEl; if (!sh) return;
    openSheetEl = null; sh.classList.remove("open"); document.body.classList.remove("sheet-open");
    if (sheetOpener) { sheetOpener.setAttribute("aria-expanded", "false"); if (!keepFocus && sh.contains(document.activeElement)) sheetOpener.focus({ preventScroll: true }); }
    setTimeout(function () { if (!sh.classList.contains("open")) sh.hidden = true; }, reduceMotion ? 0 : 280);
  }
  document.querySelectorAll("#tabbar [data-sheet]").forEach(function (b) {
    b.setAttribute("aria-expanded", "false");
    b.addEventListener("click", function () { if (openSheetEl && openSheetEl.id === b.dataset.sheet) closeSheet(); else openSheet(b.dataset.sheet, b); });
  });
  document.querySelectorAll(".sheet").forEach(function (sh) {
    sh.querySelectorAll("[data-close]").forEach(function (c) { c.addEventListener("click", function () { closeSheet(); }); });
    sh.querySelectorAll(".sheet-item").forEach(function (a) { a.addEventListener("click", function () { closeSheet(true); }); });
    sh.addEventListener("keydown", function (e) {
      if (e.key !== "Tab") return;
      var f = sh.querySelectorAll("a[href],button:not([disabled])"); if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
    // arrastar o painel para baixo fecha
    var panel = sh.querySelector(".sheet-panel"), y0 = null, dy = 0;
    panel.addEventListener("touchstart", function (e) { if (panel.scrollTop > 0) return; y0 = e.touches[0].clientY; dy = 0; }, { passive: true });
    panel.addEventListener("touchmove", function (e) { if (y0 === null) return; dy = Math.max(0, e.touches[0].clientY - y0); panel.style.transform = dy ? "translateY(" + dy + "px)" : ""; }, { passive: true });
    panel.addEventListener("touchend", function () { if (y0 === null) return; panel.style.transform = ""; if (dy > 90) closeSheet(); y0 = null; });
  });
  var TAB_OF = { inicio: "inicio", agenda: "ferramentas", perfil: "perfil", financas: "ferramentas", provas: "ferramentas", calendario: "ferramentas", onibus: "ferramentas", campus: "ferramentas" };
  function syncTabs(v) {
    var t = TAB_OF[v] || "guia";
    document.querySelectorAll("#tabbar [data-tab]").forEach(function (a) {
      var on = a.dataset.tab === t;
      a.classList.toggle("on", on);
      if (a.tagName === "A") { if (on) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); }
    });
    document.querySelectorAll(".sheet-item").forEach(function (a) { if (a.getAttribute("href") === "#" + v) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); });
  }
  var guideBtn = $("guideBtn"), guidePanel = $("guidePanel");
  function closeGuide() { guidePanel.hidden = true; guideBtn.setAttribute("aria-expanded", "false"); }
  guideBtn.addEventListener("click", function (e) {
    e.stopPropagation();
    var open = guidePanel.hidden;
    guidePanel.hidden = !open;
    guideBtn.setAttribute("aria-expanded", String(open));
  });
  document.addEventListener("click", function (e) { if (!guidePanel.hidden && !guidePanel.contains(e.target)) closeGuide(); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") { closeGuide(); setMenu(false); closeSheet(); } });

  /* ---------- Relógio ao vivo ---------- */
  var fmtClockDate = new Intl.DateTimeFormat("pt-BR", { weekday: "short", day: "2-digit", month: "short" });
  var clockListeners = [];
  function onTick(fn) { clockListeners.push(fn); }
  function tick() {
    var now = new Date();
    $("clockTime").textContent = String(now.getHours()).padStart(2, "0") + ":" + String(now.getMinutes()).padStart(2, "0");
    var cd = fmtClockDate.format(now).replace(/\./g, ""); $("clockDate").textContent = cd.charAt(0).toUpperCase() + cd.slice(1);
    var d = new Date(now); d.setHours(0, 0, 0, 0);
    if (d.getTime() !== today.getTime()) { today = d; renderAll(); }
    clockListeners.forEach(function (fn) { fn(now); });
  }

  /* ---------- Navegação entre páginas e seções ---------- */
  var VIEWS = [];
  var SECTION_VIEW = {};
  document.querySelectorAll("section.view").forEach(function (v) {
    VIEWS.push(v.dataset.view);
    v.querySelectorAll(".sec[id]").forEach(function (s) { SECTION_VIEW[s.id] = v.dataset.view; });
  });
  var TOOLS = ["financas", "provas", "agenda", "calendario"];
  var currentView = null, spy = null;

  var desktop = window.matchMedia("(min-width: 901px)");
  function syncToc() {
    document.querySelectorAll("details[data-toc]").forEach(function (d) { d.open = desktop.matches; });
  }
  desktop.addEventListener("change", syncToc);
  syncToc();
  document.querySelectorAll("details[data-toc] summary").forEach(function (s) {
    s.addEventListener("click", function (e) { if (desktop.matches) e.preventDefault(); });
  });

  function startSpy(view) {
    if (spy) spy.disconnect();
    var links = {};
    view.querySelectorAll(".toc a").forEach(function (a) { links[a.getAttribute("href").slice(1)] = a; });
    if (!("IntersectionObserver" in window)) return;
    spy = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        Object.keys(links).forEach(function (k) { links[k].removeAttribute("aria-current"); });
        if (links[en.target.id]) links[en.target.id].setAttribute("aria-current", "true");
      });
    }, { rootMargin: "-25% 0px -65% 0px" });
    view.querySelectorAll(".sec[id]").forEach(function (s) { spy.observe(s); });
  }

  function show(v, animate) {
    if (v === currentView) return false;
    currentView = v;
    document.body.setAttribute("data-page", v);
    var target = null;
    document.querySelectorAll("section.view").forEach(function (s) {
      var on = s.dataset.view === v;
      s.hidden = !on;
      s.classList.remove("entering");
      if (on) target = s;
    });
    if (target && animate && !reduceMotion) {
      void target.offsetWidth;
      target.classList.add("entering");
      clearTimeout(target._t);
      target._t = setTimeout(function () { target.classList.remove("entering"); }, 700);
    }
    document.querySelectorAll("a[data-nav]").forEach(function (a) {
      if (a.dataset.nav === v) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    });
    guideBtn.classList.toggle("has-current", !!guidePanel.querySelector('a[aria-current="page"]'));
    syncTabs(v);
    updateSampleBar();
    if (v === "inicio") { renderHome(); if (window._pfReady) renderMini(); }
    if (v === "calendario" && window._pfReady) { renderCalendar(); renderDay(); renderFixed(); }
    var ubtn = $("userBtn"); if (v === "perfil") ubtn.setAttribute("aria-current", "page"); else ubtn.removeAttribute("aria-current");
    if (v === "perfil" && window._pfReady) renderProfile();
    if (target) startSpy(target);
    if (window._pfReady) motionOnShow(v, target, animate);
    return true;
  }

  function route(token, animate) {
    closeMenu();
    if (token === "privacidade") { openPrivacy(); if (!currentView) show("inicio", false); return; } // endereço direto da política (portal-futuro.netlify.app/#privacidade)
    if (VIEWS.indexOf(token) >= 0) {
      if (typeof setDetail === "function") setDetail(null);
      show(token, animate);
      window.scrollTo({ top: 0, behavior: "auto" });
      return;
    }
    if (SECTION_VIEW[token] && typeof setDetail === "function" && phoneMQ.matches && $(token) && $(token).classList.contains("m-sub")) {
      show(SECTION_VIEW[token], animate);
      setDetail(token);
      window.scrollTo({ top: 0, behavior: "auto" });
      return;
    }
    if (typeof setDetail === "function") setDetail(null);
    if (SECTION_VIEW[token]) {
      var switched = show(SECTION_VIEW[token], animate);
      var sec = $(token);
      if (switched) requestAnimationFrame(function () { sec.scrollIntoView({ block: "start", behavior: "auto" }); });
      return;
    }
    show("inicio", animate);
    window.scrollTo({ top: 0, behavior: "auto" });
  }
  window.addEventListener("hashchange", function () {
    var token = location.hash.slice(1);
    if (/(^|&)(access_token|error)=/.test(token)) { location.reload(); return; } // link de login/recuperação aberto na mesma aba
    if (token === "privacidade") { route(token, false); return; }
    var next = VIEWS.indexOf(token) >= 0 ? token : (SECTION_VIEW[token] || "inicio");
    if (document.startViewTransition && !reduceMotion && next !== currentView) {
      document.startViewTransition(function () { route(token, true); });
    } else route(token, true);
  });

  /* Tabelas: no celular cada linha vira um cartão; o rótulo da coluna vai em cada célula */
  document.querySelectorAll(".table-wrap").forEach(function (w) {
    var t = w.querySelector("table"); if (!t) return;
    w.classList.add("stack");
    var heads = Array.prototype.map.call(t.querySelectorAll("thead th"), function (h) { return h.textContent.trim(); });
    t.querySelectorAll("tbody tr").forEach(function (tr) {
      Array.prototype.forEach.call(tr.children, function (c, i) { if (c.tagName === "TD" && heads[i]) c.setAttribute("data-label", heads[i]); });
    });
  });

  /* ---------- Exemplos ---------- */
  function hasSamples() { return state.fin.concat(state.provas, state.ativ).some(function (x) { return x.ex; }); }
  function exTag(x) { return x.ex ? el("span", { class: "tag ex", text: "exemplo" }) : null; }
  function updateSampleBar() {
    var on = !sampleHidden && hasSamples() && TOOLS.indexOf(currentView) >= 0;
    $("sampleBar").hidden = !on;
    $("confirmClear").hidden = true;
    $("clearSamples").hidden = false;
  }
  var sampleHidden = false;
  $("hideSample").addEventListener("click", function () { sampleHidden = true; $("sampleBar").hidden = true; });
  $("clearSamples").addEventListener("click", function () { $("confirmClear").hidden = false; this.hidden = true; });
  $("confirmNo").addEventListener("click", function () { $("confirmClear").hidden = true; $("clearSamples").hidden = false; });
  $("confirmYes").addEventListener("click", function () {
    ["fin", "provas", "ativ"].forEach(function (k) { state[k] = state[k].filter(function (x) { return !x.ex; }); });
    save(); renderAll(); updateSampleBar();
    toast("Exemplos removidos. Agora é só cadastrar os seus dados.");
  });

  /* ---------- Início ---------- */
  function monthTotals(ym) {
    var inn = 0, out = 0;
    state.fin.forEach(function (x) { if (x.data.slice(0, 7) === ym) { if (x.tipo === "entrada") inn += x.val; else out += x.val; } });
    return { inn: inn, out: out, bal: inn - out };
  }
  function renderHome() {
    var t = monthTotals(iso(today).slice(0, 7));
    $("hSaldo").textContent = BRL.format(t.bal);
    $("hSaldo").className = "v " + (t.bal >= 0 ? "pos" : "neg");
    $("hSaldoSub").textContent = t.inn ? "de " + BRL.format(t.inn) + " recebidos" : "Lance suas entradas";
    var next = state.provas.filter(function (p) { return daysUntil(p.data) >= 0; }).sort(function (a, b) { return a.data < b.data ? -1 : 1; })[0];
    $("hProva").textContent = next ? rel(daysUntil(next.data)) : "nenhuma";
    $("hProvaSub").textContent = next ? next.tipo + " de " + next.disc : "Cadastre em Provas";
    var pend = state.ativ.filter(function (a) { return !a.done; });
    var late = pend.filter(function (a) { return daysUntil(a.data) < 0; }).length;
    $("hAtiv").textContent = String(pend.length);
    $("hAtivSub").textContent = late ? late + " atrasada(s)" : "nenhuma atrasada";
    $("hDocs").textContent = Object.keys(state.docs).length + " de " + DOCS.length;

    var items = [];
    state.provas.forEach(function (p) { items.push({ data: p.data, title: p.tipo + ": " + p.disc, tag: "tone", tipo: p.tipo }); });
    state.ativ.forEach(function (a) { if (!a.done) items.push({ data: a.data, title: a.tit, tag: "", tipo: a.tipo }); });
    items = items.filter(function (i) { var d = daysUntil(i.data); return d >= 0 && d <= 14; })
      .sort(function (a, b) { return a.data < b.data ? -1 : 1; });
    var ul = $("upcoming"); clear(ul);
    if (!items.length) ul.appendChild(el("li", { class: "empty", text: "Nada marcado para as próximas duas semanas." }));
    items.forEach(function (i) {
      ul.appendChild(el("li", null, [
        el("span", { class: "when", text: fmtDay.format(parseD(i.data)) + " · " + rel(daysUntil(i.data)) }),
        el("span", { class: "what", text: i.title }),
        el("span", { class: "tag " + i.tag, text: i.tipo })
      ]));
    });
  }

  /* ---------- Ingresso: documentos ---------- */
  function renderDocs() {
    var ul = $("docList"); clear(ul);
    DOCS.forEach(function (d, i) {
      var cb = el("input", { type: "checkbox", id: "doc" + i });
      cb.checked = !!state.docs[i];
      cb.addEventListener("change", function () {
        if (cb.checked) state.docs[i] = true; else delete state.docs[i];
        save(); updDocs();
        if (cb.checked && Object.keys(state.docs).length === DOCS.length) { confetti(); toast("Todos os documentos separados. Você está pronto para a matrícula!"); }
      });
      ul.appendChild(el("li", null, [el("label", { for: "doc" + i }, [cb, el("span", { text: d })])]));
    });
    updDocs();
  }
  function updDocs() {
    var n = Object.keys(state.docs).length;
    $("docCount").textContent = n + " de " + DOCS.length + " separados";
    var C = 2 * Math.PI * 36, ring = $("docRing");
    ring.style.strokeDasharray = C.toFixed(2);
    ring.style.strokeDashoffset = (C * (1 - n / DOCS.length)).toFixed(2);
    $("docPct").textContent = Math.round(n / DOCS.length * 100) + "%";
  }

  /* ---------- Finanças ---------- */
  function fillCats() {
    var sel = $("finCat"), list = $("finTipo").value === "entrada" ? CATS_IN : CATS_OUT;
    clear(sel); list.forEach(function (c) { sel.appendChild(el("option", { value: c, text: c })); });
  }
  $("finTipo").addEventListener("change", fillCats);
  fillCats();
  $("finData").value = iso(today);

  var finYM = iso(today).slice(0, 7);
  function ymLabel(ym) { var p = ym.split("-"); return fmtMonth.format(new Date(+p[0], +p[1] - 1, 1)); }
  function renderMonths() {
    var set = {}; set[iso(today).slice(0, 7)] = 1;
    state.fin.forEach(function (x) { set[x.data.slice(0, 7)] = 1; });
    var sel = $("finMonth"); clear(sel);
    Object.keys(set).sort().reverse().forEach(function (ym) {
      var o = el("option", { value: ym, text: ymLabel(ym) }); if (ym === finYM) o.selected = true; sel.appendChild(o);
    });
  }
  $("finMonth").addEventListener("change", function () { finYM = this.value; renderFin(); });
  function monthRows() {
    return state.fin.filter(function (x) { return x.data.slice(0, 7) === finYM; }).sort(function (a, b) { return a.data < b.data ? 1 : -1; });
  }
  function renderFin() {
    renderMonths();
    $("finMonthLbl").textContent = ymLabel(finYM);
    var t = monthTotals(finYM);
    $("fIn").textContent = BRL.format(t.inn);
    $("fOut").textContent = BRL.format(t.out);
    $("fBal").textContent = BRL.format(t.bal);
    $("fBal").className = "v " + (t.bal >= 0 ? "pos" : "neg");
    $("fBalSub").textContent = t.inn > 0 ? Math.round(t.out / t.inn * 100) + "% da renda já foi gasta" : "";

    var rows = monthRows(), byCat = {};
    rows.forEach(function (x) { if (x.tipo === "saida") byCat[x.cat] = (byCat[x.cat] || 0) + x.val; });
    var cats = Object.keys(byCat).sort(function (a, b) { return byCat[b] - byCat[a]; });
    var max = cats.length ? byCat[cats[0]] : 0, bars = $("catBars"); clear(bars);
    if (!cats.length) bars.appendChild(el("p", { class: "empty", text: "Nenhum gasto neste mês ainda." }));
    cats.forEach(function (c) {
      var i = el("i"); i.style.width = Math.max(2, byCat[c] / max * 100) + "%";
      bars.appendChild(el("div", { class: "bar-row" }, [el("span", { text: c }), el("div", { class: "bar-track", role: "img", "aria-label": c + ": " + BRL.format(byCat[c]) }, [i]), el("span", { class: "num", text: BRL.format(byCat[c]) })]));
    });

    var tb = $("finBody"); clear(tb);
    if (!rows.length) tb.appendChild(el("tr", null, [el("td", { colspan: "5", class: "muted", text: "Nenhum lançamento neste mês." })]));
    rows.forEach(function (x) {
      var del = el("button", { class: "btn del", type: "button", "aria-label": "Excluir " + x.desc, text: "Excluir" });
      del.addEventListener("click", function () { state.fin = state.fin.filter(function (y) { return y.id !== x.id; }); save(); renderFin(); updateSampleBar(); toast("Lançamento excluído."); });
      tb.appendChild(el("tr", null, [
        el("td", { class: "num", text: fmtDay.format(parseD(x.data)) }),
        el("td", { class: "desc" }, [x.desc + " ", exTag(x)]),
        el("td", { class: "cat", text: x.cat }),
        el("td", { class: "money " + (x.tipo === "entrada" ? "pos" : "neg"), text: (x.tipo === "entrada" ? "+ " : "− ") + BRL.format(x.val) }),
        el("td", { class: "act" }, [del])
      ]));
    });
    $("csvBox").hidden = true;
  }
  $("finForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var desc = str($("finDesc").value, 60), val = Number(String($("finVal").value).replace(",", ".")), data = $("finData").value, err = "";
    $("finDesc").removeAttribute("aria-invalid"); $("finVal").removeAttribute("aria-invalid");
    if (!desc) { err = "Escreva uma descrição para o lançamento."; $("finDesc").setAttribute("aria-invalid", "true"); }
    else if (!isFinite(val) || val <= 0 || val > 1e6) { err = "Informe um valor entre R$ 0,01 e R$ 1.000.000."; $("finVal").setAttribute("aria-invalid", "true"); }
    else if (!okDate(data)) err = "Escolha uma data válida.";
    else if (state.fin.length >= LIMITS.fin) err = "Limite de lançamentos atingido. Exclua registros antigos.";
    $("finErr").textContent = err;
    if (err) return;
    var tipo = $("finTipo").value === "entrada" ? "entrada" : "saida";
    var cat = (tipo === "entrada" ? CATS_IN : CATS_OUT).indexOf($("finCat").value) >= 0 ? $("finCat").value : "Outros";
    state.fin.push({ id: uid(), desc: desc, val: Math.round(val * 100) / 100, tipo: tipo, cat: cat, data: data, ex: false });
    save(); finYM = data.slice(0, 7); renderFin();
    $("finDesc").value = ""; $("finVal").value = ""; $("finDesc").focus();
    toast("Lançamento adicionado.");
  });

  // CSV com proteção contra injeção de fórmulas (=, +, -, @ no início da célula)
  function csvCell(v) {
    var s = String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return '"' + s.replace(/"/g, '""') + '"';
  }
  $("csvBtn").addEventListener("click", function () {
    var lines = [["Data", "Descrição", "Tipo", "Categoria", "Valor"].map(csvCell).join(";")];
    monthRows().forEach(function (x) {
      lines.push([x.data.split("-").reverse().join("/"), x.desc, x.tipo === "entrada" ? "Entrada" : "Saída", x.cat, x.val.toFixed(2).replace(".", ",")].map(csvCell).join(";"));
    });
    var csv = lines.join("\n"), ta = $("csvOut");
    ta.value = csv; $("csvBox").hidden = false;
    var fallback = function () { ta.focus(); ta.select(); toast("Selecionei a planilha. Use Ctrl+C para copiar."); };
    try { navigator.clipboard.writeText(csv).then(function () { toast("Planilha copiada. Cole no Excel ou Google Planilhas."); }, fallback); }
    catch (e) { fallback(); }
  });

  /* ---------- Provas ---------- */
  function renderProvas() {
    var ol = $("provaList"); clear(ol);
    var list = state.provas.slice().sort(function (a, b) { return a.data < b.data ? -1 : 1; });
    if (!list.length) ol.appendChild(el("li", { class: "empty", text: "Nenhuma avaliação cadastrada. Use o formulário acima." }));
    list.forEach(function (p) {
      var d = daysUntil(p.data), cls = d < 0 ? "" : d <= 3 ? "bad" : d <= 7 ? "warn" : "ok";
      var del = el("button", { class: "btn del", type: "button", "aria-label": "Excluir avaliação de " + p.disc, text: "Excluir" });
      del.addEventListener("click", function () { state.provas = state.provas.filter(function (y) { return y.id !== p.id; }); save(); renderProvas(); updateSampleBar(); toast("Avaliação excluída."); });
      ol.appendChild(el("li", null, [
        el("span", { class: "when", text: fmtLong.format(parseD(p.data)) }),
        el("div", null, [el("div", { class: "t" }, [p.disc + " ", exTag(p)]), el("div", { class: "m", text: p.tipo + (p.cont ? " · " + p.cont : "") })]),
        el("span", { class: "tag " + cls, text: d < 0 ? "já passou" : rel(d) }),
        del
      ]));
    });
  }
  $("provaForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var disc = str($("pDisc").value, 50), data = $("pData").value, err = "";
    $("pDisc").removeAttribute("aria-invalid");
    if (!disc) { err = "Informe a disciplina."; $("pDisc").setAttribute("aria-invalid", "true"); }
    else if (!okDate(data)) err = "Escolha a data da avaliação.";
    else if (state.provas.length >= LIMITS.provas) err = "Limite de avaliações atingido. Exclua as antigas.";
    $("pErr").textContent = err;
    if (err) return;
    var tipo = TIPOS_PROVA.indexOf($("pTipo").value) >= 0 ? $("pTipo").value : "Prova";
    state.provas.push({ id: uid(), disc: disc, tipo: tipo, data: data, cont: str($("pCont").value, 80), ex: false });
    save(); renderProvas();
    $("pDisc").value = ""; $("pCont").value = ""; $("pData").value = "";
    toast("Avaliação adicionada.");
  });

  /* Calculadora de média ponderada */
  var calc = state.calc || [{ n: "6.5", p: "1" }, { n: "", p: "1" }, { n: "", p: "2" }];
  function renderCalc() {
    var box = $("calcRows"); clear(box);
    box.appendChild(el("div", { class: "calc-row label" }, [el("span", { class: "lbl", text: "Avaliação" }), el("span", { text: "Nota" }), el("span", { text: "Peso" })]));
    calc.forEach(function (r, i) {
      var n = el("input", { type: "number", id: "cN" + i, min: "0", max: "10", step: "0.1", inputmode: "decimal", placeholder: "a fazer", "aria-label": "Nota da avaliação " + (i + 1) });
      var p = el("input", { type: "number", id: "cP" + i, min: "0.1", max: "10", step: "0.1", inputmode: "decimal", "aria-label": "Peso da avaliação " + (i + 1) });
      n.value = r.n; p.value = r.p;
      n.addEventListener("input", function () { r.n = n.value.slice(0, 5); compute(); });
      p.addEventListener("input", function () { r.p = p.value.slice(0, 5); compute(); });
      box.appendChild(el("div", { class: "calc-row" }, [el("span", { class: "lbl", text: "Avaliação " + (i + 1) }), n, p]));
    });
    compute();
  }
  function compute() {
    var min = Number($("cMin").value), out = $("calcOut");
    var sum = 0, W = 0, R = 0, bad = false;
    calc.forEach(function (r) {
      var p = Number(r.p);
      if (!isFinite(p) || p <= 0) { bad = true; return; }
      W += p;
      if (r.n === "") R += p;
      else { var n = Number(r.n); if (!isFinite(n) || n < 0 || n > 10) bad = true; else sum += n * p; }
    });
    state.calc = calc; save();
    if (bad || !isFinite(min) || min < 0 || min > 10) { out.className = "calc-out warn"; out.textContent = "Use notas de 0 a 10 e pesos maiores que zero."; return; }
    if (R === W) { out.className = "calc-out"; out.textContent = "Digite as notas que você já tem para ver quanto falta."; return; }
    if (R === 0) {
      var m = sum / W;
      out.className = "calc-out " + (m >= min ? "ok" : "bad");
      out.textContent = "Média final: " + m.toFixed(2).replace(".", ",") + (m >= min ? ". Aprovado." : ". Abaixo da média; verifique a recuperação no regimento.");
      return;
    }
    var need = (min * W - sum) / R;
    if (need <= 0) { out.className = "calc-out ok"; out.textContent = "Você já atingiu a média " + String(min).replace(".", ",") + " com as notas atuais."; }
    else if (need > 10) { out.className = "calc-out bad"; out.textContent = "Seria preciso mais de 10 nas avaliações restantes. Converse com o professor sobre recuperação ou trabalhos extras."; }
    else { out.className = "calc-out " + (need > 8 ? "warn" : "ok"); out.textContent = "Você precisa tirar " + need.toFixed(1).replace(".", ",") + " em média nas avaliações que faltam."; }
  }
  $("cMin").addEventListener("input", compute);

  /* ---------- Linhas de ônibus da região ---------- */
  var SRC = {
    ime: { n: "IME-Unicamp: transporte", u: "https://www.ime.unicamp.br/administracao/informacoes-para-visitantes/campinas/transporte" },
    ifi: { n: "IFGW-Unicamp: como chegar", u: "https://portal.ifi.unicamp.br/a-instituicao/como-chegar" },
    caf: { n: "PRP-Unicamp: como chegar (2026)", u: "https://prp.unicamp.br/wp-content/uploads/sites/4/2025/12/CAF_2026_Como_Chegar_a_Unicamp.pdf" },
    emtu: { n: "EMTU: busca de linhas", u: "https://www.emtu.sp.gov.br/Sistemas/linha/resultado.htm?cidadede=Campinas&cidadeate=Hortolandia&pag=origemdestino.htm" },
    emtu653: { n: "EMTU: linha 653", u: "https://emtu.sp.gov.br/Sistemas/linha/resultado.htm?numlinha=653&pag=buscanumero.htm" },
    bi663: { n: "BusInfo: linha 663", u: "https://businfo.app.br/linhadetalhes/663?cidade=EMTU+-+CAMPINAS" },
    pc636: { n: "Portal da Cidade Sumaré: linha 636", u: "https://sumare.portaldacidade.com/noticias/cidade/horarios-e-itinerarios-da-linha-636-4729" },
    pc740: { n: "Portal da Cidade Sumaré: linha 740", u: "https://sumare.portaldacidade.com/noticias/regiao/horarios-da-linha-740-emtu-jd-joao-paulo-ii-sumarecampinas-shopping-4608" },
    cm366: { n: "Correio da Manhã: linha 366 (ago/2026)", u: "https://www.correiodamanha.com.br/nacional/sao-paulo/campinas/2026/08/amp/314971-linha-366-passa-a-atender-o-campus-swift-da-unip-em-campinas.html" },
    em266: { n: "Emdec: linha 266 e PUC-Campinas", u: "https://www.emdec.com.br/itinerario-da-linha-266-muda-para-atender-ao-campus-i-da-puc-campinas/" },
    cit: { n: "Cittamobi: linhas de Campinas", u: "https://linhas.cittamobi.com.br/" },
    vt357: { n: "Via Trolebus: linhas para PUC e Unicamp (2021)", u: "https://viatrolebus.com.br/2021/11/campinas-retoma-a-operacao-de-linhas-que-atendem-a-puc-e-unicamp/" }
  };
  var TM = "Terminal Metropolitano (Campinas)", TBG = "Terminal Barão Geraldo", UNI = "Unicamp", TC = "Terminal Central (Campinas)", ROD = "Rodoviária de Campinas", HC = "Hospital das Clínicas (Unicamp)";
  var LINES = [
    { n: "330", type: "mun", from: TC, to: UNI, pts: [TC, UNI], sched: "Dias úteis, das 6h às 9h30 e das 15h30 às 17h, a cada 15 minutos.", note: "Linha direta do centro para a Unicamp.", tags: ["unicamp"], src: ["ime", "ifi"] },
    { n: "332", type: "mun", from: ROD, to: HC, pts: [ROD, HC, UNI], note: "Vai da rodoviária até o Hospital das Clínicas, dentro do campus da Unicamp.", tags: ["unicamp", "rodoviaria"], src: ["ifi", "caf"] },
    { n: "331", type: "mun", from: ROD, to: TBG, pts: [ROD, TBG], sched: "Todos os dias, das 5h30 às 23h30, a cada 20 minutos.", integ: "No Terminal Barão Geraldo, troque para a 337 até a Unicamp sem pagar outra passagem.", tags: ["barao", "rodoviaria"], src: ["ime", "caf"] },
    { n: "333", type: "mun", from: TC, to: TBG, pts: [TC, TBG], sched: "Todos os dias, das 5h30 às 23h30, a cada 10 minutos.", integ: "No Terminal Barão Geraldo, troque para a 337 até a Unicamp sem pagar outra passagem.", tags: ["barao"], src: ["ime", "caf"] },
    { n: "337", type: "mun", from: TBG, to: UNI, pts: [TBG, UNI], note: "Liga o terminal de Barão Geraldo ao campus. É a linha de integração das 331 e 333.", tags: ["unicamp", "barao"], src: ["ifi", "caf"] },
    { n: "329", type: "mun", from: TBG, to: "Estação Cidade Judiciária", pts: [TBG, UNI, "Parque das Universidades", "Fazenda Santa Cândida", "Estação Cidade Judiciária"], sched: "Dias úteis, das 5h30 às 23h30, a cada 15 minutos.", note: "Circula pela Unicamp. Tem a variante 329.1.", tags: ["unicamp", "barao"], src: ["ime", "caf"] },
    { n: "336", type: "mun", from: TBG, to: HC, pts: [TBG, HC], tags: ["unicamp", "barao"], src: ["caf"] },
    { n: "338", type: "mun", from: TBG, to: "Terminal Shopping Iguatemi", pts: [TBG, "Terminal Shopping Iguatemi"], tags: ["barao", "shopping"], src: ["caf"] },
    { n: "134", type: "mun", from: "Terminal Ouro Verde", to: TBG, pts: ["Terminal Ouro Verde", "Av. Ruy Rodriguez", "Terminal Vila União", "Av. John Boyd Dunlop", "Balão do Castelo", "Rodovia SP-332", TBG], tags: ["barao"], src: ["caf"] },
    { n: "210", type: "mun", from: "Terminal Campo Grande", to: TBG, pts: ["Terminal Campo Grande", "Av. John Boyd Dunlop", "Balão do Castelo", "Av. Santa Genebra", "Terminal Shopping Dom Pedro", TBG], tags: ["barao", "shopping"], src: ["caf"] },
    { n: "269 / 314", type: "mun", from: "Terminal Padre Anchieta", to: TBG, pts: ["Terminal Padre Anchieta", "Rodovia Anhanguera", "Rodovia Dom Pedro I", "Amarais", TBG], tags: ["barao"], src: ["caf"] },
    { n: "300", type: "mun", from: "Sousas", to: TBG, pts: ["Sousas", "Av. San Conrado", "Estação Sousas", "Rodovia Dom Pedro I", "Terminal Shopping Dom Pedro", TBG], tags: ["barao", "shopping"], src: ["caf"] },
    { n: "266", type: "mun", from: "Parque São Jorge", to: HC, pts: ["Parque São Jorge", HC], note: "A Emdec mudou o itinerário para atender também o Campus I da PUC-Campinas.", tags: ["unicamp", "puc"], src: ["caf", "em266"] },
    { n: "351", type: "mun", from: "Centro (Av. Moraes Sales)", to: "PUC-Campinas (Campus I)", pts: ["Centro (Av. Moraes Sales)", "Parque Taquaral", "Chácara Primavera", "Parque das Universidades", "PUC-Campinas (Campus I)"], note: "Passa pela Chácara Primavera e termina perto do Campus I da PUC-Campinas.", tags: ["puc"], src: ["cit"] },
    { n: "357", type: "mun", title: "Linha que atende o Campus I da PUC-Campinas", from: "Campinas", to: "PUC-Campinas (Campus I)", pts: ["PUC-Campinas (Campus I)"], note: "Atende o Campus I da PUC-Campinas. A informação é de 2021: confira o itinerário atual na Emdec.", tags: ["puc"], src: ["vt357"] },
    { n: "366", type: "mun", from: "Jardim Andorinhas", to: TM, pts: ["Jardim Andorinhas", "Av. Comendador Enzo Ferrari", "Unip (campus Swift)", TM], note: "Desde 31/08/2026, atende o campus Swift da Unip nos dois sentidos.", tags: ["terminal-metro", "unip"], src: ["cm366"] },
    { n: "193", type: "mun", from: "Aeroporto de Viracopos", to: TC, pts: ["Aeroporto de Viracopos", TC], integ: "No Terminal Central, pegue a 330 para a Unicamp.", tags: ["aeroporto"], src: ["ifi"] },
    { n: "724", type: "met", from: "Vinhedo / Valinhos", to: UNI, pts: ["Vinhedo", "Valinhos", UNI], tags: ["unicamp"], src: ["caf"] },
    { n: "653", type: "met", from: "Sumaré (Terminal Rodoviário)", to: UNI, pts: ["Sumaré (Terminal Rodoviário)", UNI], oper: "BUS +", fare: "R$ 7,35", integ: "Sem integração.", tags: ["unicamp", "sumare"], src: ["emtu653"] },
    { n: "654", type: "met", from: "Sumaré (Terminal Rodoviário)", to: "Shopping Iguatemi (Campinas)", pts: ["Sumaré (Terminal Rodoviário)", "Shopping Iguatemi (Campinas)"], tags: ["sumare", "shopping"], src: ["emtu"] },
    { n: "651", type: "met", from: "Sumaré (Residencial Real Parque)", to: TM, pts: ["Sumaré (Residencial Real Parque)", TM], tags: ["sumare", "terminal-metro"], src: ["emtu"] },
    { n: "636", type: "met", from: "Sumaré (Terminal Rodoviário)", to: TM, pts: ["Sumaré (Terminal Rodoviário)", "Nova Veneza (Sumaré)", TM], oper: "BUS +", note: "Passa por Nova Veneza.", tags: ["sumare", "terminal-metro"], src: ["pc636"] },
    { n: "663", type: "met", from: "Sumaré (Parque Residencial Salerno)", to: TM, pts: ["Sumaré (Parque Residencial Salerno)", "Nova Veneza: Pq. Itália, Pq. Florely e Jd. Cidade Nova", "Estação de Transferência Km 110", "Conj. Hab. Angelo Tomazin", "Jardim Manchester", "Rodovia Anhanguera (km 112 a 98,5)", "Av. Lix da Cunha (Bonfim e Jd. Bandeirantes)", TM], tags: ["sumare", "terminal-metro"], src: ["bi663"] },
    { n: "740", type: "met", from: "Sumaré (Jardim João Paulo II)", to: "Campinas Shopping", pts: ["Sumaré (Jardim João Paulo II)", "Campinas Shopping"], oper: "BUS +", fare: "R$ 7,35", note: "Viagem de cerca de 60 minutos.", tags: ["sumare", "shopping"], src: ["pc740"] },
    { n: "746", type: "met", from: "Hortolândia (Terminal Metropolitano)", to: UNI, pts: ["Hortolândia (Terminal Metropolitano)", UNI], tags: ["unicamp", "hortolandia"], src: ["emtu"] },
    { n: "739", type: "met", from: "Hortolândia (Terminal Metropolitano)", to: "Campinas Shopping", pts: ["Hortolândia (Terminal Metropolitano)", "Campinas Shopping"], tags: ["hortolandia", "shopping"], src: ["emtu"] },
    { n: "742", type: "met", from: "Hortolândia (Terminal Metropolitano)", to: "Terminal Campo Grande", pts: ["Hortolândia (Terminal Metropolitano)", "Terminal Campo Grande"], tags: ["hortolandia"], src: ["emtu"] },
    { n: "741", type: "met", from: "Hortolândia (Terminal Metropolitano)", to: TM, pts: ["Hortolândia (Terminal Metropolitano)", TM], tags: ["hortolandia", "terminal-metro"], src: ["emtu"] },
    { n: "700", type: "met", from: "Hortolândia (Jardim Amanda)", to: TM, pts: ["Hortolândia (Jardim Amanda)", TM], tags: ["hortolandia", "terminal-metro"], src: ["emtu"] },
    { n: "666", type: "met", from: "Hortolândia (Terminal Metropolitano)", to: "Paulínia (Centro)", pts: ["Hortolândia (Terminal Metropolitano)", "Paulínia (Centro)"], tags: ["hortolandia", "paulinia"], src: ["emtu"] }
  ];
  /* Bairros e condomínios por onde cada linha passa (paradas listadas no BusInfo e no Cittamobi, out/2026) */
  var CAMP = "Campinas", SUM = "Sumaré", HOR = "Hortolândia";
  var BAIRROS = {
    "330": [[CAMP, "Centro|Vila Itapura|Vila Angelino Rossi|Jardim Guanabara|Jardim Brasil|Jardim Nossa Senhora Auxiliadora|Vila Nova|Parque Taquaral|Vila Costa e Silva|Jardim Santa Genebra II|Barão Geraldo|Cidade Universitária"]],
    "331": [[CAMP, "Centro|Vila Itapura|Vila Angelino Rossi|Jardim Guanabara|Jardim Brasil|Jardim Nossa Senhora Auxiliadora|Vila Nova|Parque Taquaral|Vila Costa e Silva|Jardim Santa Genebra II|Barão Geraldo|Jardim Santa Genebra"]],
    "332": [[CAMP, "Centro|Vila Itapura|Vila Angelino Rossi|Botafogo|Vila Nova|Jardim Guanabara|Parque Taquaral|Jardim Nossa Senhora Auxiliadora|Chácara Primavera|Fazenda Santa Cândida|Parque das Universidades|Cidade Universitária"]],
    "333": [[CAMP, "Centro|Nova Campinas|Vila Itapura|Botafogo|Jardim Chapadão|Jardim Brasil|Vila Nova|Jardim Guanabara|Parque Taquaral|Vila Costa e Silva|Jardim Santa Genebra II|Barão Geraldo|Jardim Santa Genebra"]],
    "337": [[CAMP, "Jardim Santa Genebra|Cidade Universitária|Bosque das Palmeiras|Barão Geraldo|Jardim Afife"]],
    "329": [[CAMP, "Jardim Santana|Parque São Quirino|Fazenda Santa Cândida|Lot. Residencial Vila Bella|Jardim Santa Genebra|Parque Dom Pedro|Parque das Universidades|Parque dos Jacarandás|Cidade Universitária|Barão Geraldo|Jardim Afife"]],
    "336": [[CAMP, "Jardim Santa Genebra|Jardim Afife|Jardim Santa Genebra II|Barão Geraldo|Cidade Universitária"]],
    "338": [[CAMP, "Jardim Santa Genebra|Vila Costa e Silva|Parque Taquaral|Taquaral|Jardim Nossa Senhora Auxiliadora|Vila Esmeralda|Jardim Boa Esperança|Jardim Flamboyant|Jardim das Paineiras|Vila Brandina"]],
    "269/314": [[CAMP, "Conj. Hab. Padre Anchieta|Jardim Chapadão|Chácaras Campos dos Amarais|Jardim Santa Genebra|Barão Geraldo"]],
    "351": [[CAMP, "Centro|Vila Angelino Rossi|Jardim Guanabara|Jardim Brasil|Jardim Nossa Senhora Auxiliadora|Vila Nova|Parque Taquaral|Chácara Primavera|Parque São Quirino|Parque das Universidades|Parque dos Jacarandás|Bosque das Palmeiras"]],
    "653": [[SUM, "Centro|Jardim São Carlos|Jardim Marchissolo|Jardim Residencial Veccon|Condomínio Parque do Horto|Jardim Paulistano"], [HOR, "Parque do Horto|Chácara Recreio Alvorada|IFSP Hortolândia|Jardim das Colinas|Vila São Pedro|Vila Real|Vila Real Continuação|Vila Real Santista|Jardim Nossa Senhora Auxiliadora"], [SUM, "Nova Veneza|Jardim Dulce|Parque Santo Antônio|Jardim Santiago|Jardim Denadai|Jardim Nova Esperança|Jardim Bom Retiro|Parque Bandeirantes I|Jardim Aclimação|Jardim São Judas Tadeu|Nova Aparecida"], [CAMP, "Jardim Aparecida|Jardim Chapadão|Jardim Santa Mônica|Chácaras Campos dos Amarais|CEASA|Conj. Hab. Padre Anchieta|Jardim Santa Genebra II|Jardim Novo Barão Geraldo|Barão Geraldo|Cidade Universitária"]],
    "654": [[SUM, "Centro|Jardim São Carlos|Jardim Marchissolo|Jardim Residencial Veccon|Condomínio Parque do Horto|Jardim Paulistano"], [HOR, "Parque do Horto|Chácara Recreio Alvorada|IFSP Hortolândia|Jardim das Colinas|Vila São Pedro|Vila Real"], [SUM, "Nova Veneza|Jardim Dulce|Parque Santo Antônio|Jardim Santiago|Jardim Bom Retiro|Parque Bandeirantes I|Jardim Aclimação|Jardim São Judas Tadeu|Nova Aparecida"], [CAMP, "Jardim Aparecida|Jardim Chapadão|Jardim Santa Mônica|Chácaras Campos dos Amarais|Parque Dom Pedro|Jardim Santa Genebra|Fazenda Santa Cândida"]],
    "651": [[SUM, "Nova Veneza|Residencial Real Parque|Loteamento Industrial Veccon (Zeta)|Jardim Dulce|Parque Santo Antônio|Jardim Bom Retiro|Jardim Santiago|Jardim Calegari|Parque Bandeirantes I|Jardim Aclimação|Jardim São Judas Tadeu|Nova Aparecida"], [HOR, "Parque do Horto"], [CAMP, "Jardim Aparecida|Bonfim|Jardim Pacaembu|Jardim Bandeirantes|Vila Industrial|Alberto Sarmento"]],
    "636": [[SUM, "Centro|Parque Euclides Miranda|CECAP|Vila Carlota|Vila Flora|Hospital Estadual|Virgílio Viel|Parque Jatobá|Parque da Amizade|Nova Veneza|Jardim Nova Veneza|Jardim Conceição|Jardim Conceição II|Seminário"], [CAMP, "Bonfim|Jardim Pacaembu|Jardim Bandeirantes|Vila Industrial"]],
    "663": [[SUM, "Parque Residencial Salerno|Parque Itália|Parque da Amizade|Parque Florely|Jardim Cidade Nova|Nova Veneza|Jardim Maria Antônia|Conj. Hab. Angelo Tomazin|Jardim Manchester|Parque das Indústrias"], [CAMP, "Bonfim|Jardim Pacaembu|Jardim Bandeirantes|Vila Industrial"]],
    "740": [[SUM, "Jardim João Paulo II|Jardim Primavera|Centro|Parque Euclides Miranda|CECAP|Vila Carlota|Vila Flora|Hospital Estadual|Virgílio Viel|Parque Jatobá|Parque da Amizade|Nova Veneza|Jardim Nova Veneza|Jardim Conceição|Jardim Conceição II|Seminário"], [CAMP, "Jardim Garcia|Cidade Jardim|Jardim do Lago"]],
    "746": [[HOR, "Parque Hortolândia|Estação Pinheiros|Parque Gabriel|Parque São Miguel|Remanso Campineiro|Vila São Francisco|Jardim Santana|Parque dos Pinheiros|Jardim Minda|Jardim São Jorge"], [SUM, "Jardim Bom Retiro|Parque Bandeirantes I|Jardim Nova Europa|Jardim São Judas Tadeu|Jardim Aclimação"], [CAMP, "Jardim Chapadão|Jardim Santa Mônica|Chácaras Campos dos Amarais|Parque Dom Pedro|Parque das Universidades|PUC-Campinas|Cidade Universitária"]],
    "739": [[HOR, "Parque Hortolândia|Vila São Francisco|Remanso Campineiro|Jardim Santana|Parque dos Pinheiros|Jardim Santa Rita de Cássia|Jardim do Bosque|Parque Residencial Maria de Lourdes|Jardim Santa Clara do Lago|Jardim Sumarezinho|Jardim Santa Izabel|Jardim São Benedito|Jardim Nossa Senhora de Fátima|Jardim Santiago"], [CAMP, "Parque Santa Bárbara|Jardim Ipaussurama|Jardim Garcia|Cidade Jardim|Jardim do Lago"]],
    "742": [[HOR, "UNASP (IASP)|Jardim Golden Park|Jardim São Sebastião|Parque Ortolândia|Jardim Boa Vista|Jardim Santa Esmeralda|Jardim Terras de Santo Antônio|Jardim São Bento"], [CAMP, "Parque Valença|Parque Valença I|Parque Valença II|Jardim Novo Maracanã|Jardim Santa Rosa|Chácaras Cruzeiro do Sul|Condomínio Bom Jesus de Pirapora|Vila Real"]],
    "741": [[HOR, "Parque Ortolândia|Parque São Miguel|Parque Gabriel|Estação Pinheiros|Parque dos Pinheiros|Jardim Santa Amélia|Jardim Santa Rita de Cássia|Jardim Santa Clara do Lago|Jardim Novo Ângulo|Jardim Nova América|Jardim Malta"], [CAMP, "Parque Santa Bárbara|Jardim Ipaussurama|Jardim Garcia|Bonfim|Jardim Pacaembu|Jardim Bandeirantes|Vila Industrial"]],
    "700": [[HOR, "Jardim Amanda I|Jardim Amanda II|Jardim Boa Vista|Jardim Sumarezinho|Jardim Nova Boa Vista"], [CAMP, "Parque Santa Bárbara|Jardim Ipaussurama|Jardim Garcia|Jardim Pacaembu|Bonfim|Jardim Bandeirantes|Alberto Sarmento|Vila Industrial"]],
    "666": [[HOR, "Vila Real|Vila São Pedro|Jardim das Colinas|IFSP Hortolândia|Chácara Recreio Alvorada"], [SUM, "Jardim Paulistano|Condomínio Parque do Horto|Jardim Residencial Veccon|Jardim Marchissolo|Jardim São Carlos|Centro|Parque Euclides Miranda|CECAP|Vila Carlota|Vila Flora|Parque Jatobá|Parque da Amizade|Jardim Nova Veneza|Jardim Conceição|Techno Park|Jardim dos Oliveiras|Jardim Morumbi|Parque Yolanda|Matão|Parque Residencial Regina|Parque Progresso|Jardim das Estâncias|Vila Diva|Jardim São Gerônimo"], ["Paulínia", "Parque Brasil 500|Centro|Jardim Nossa Senhora Aparecida|Jardim América|Parque Irmãos Pedroso|Jardim de Itapoan|Jardim São Bento"]],
    "724": [["Vinhedo", "Vila Thereza|Jardim Primavera|Santa Rosa|Vila Gallo|Barra Funda|Jardim Nova Canudos|Vila Junqueira|Jardim São Matheus|Jardim Maracanã"], ["Valinhos", "Jardim Eliza|Vila São Cristóvão|Jardim São Pedro|Vila Clayton|Jardim Celani|Lenheiro|Centro|Vila Embaré|Vila São Sebastião|Vila Faustina II"], [CAMP, "Vila Joaquim Inácio|Jardim Santa Eudóxia|Vila Lemos|Jardim Ouro Branco|Jardim Baroneza|Jardim Proença|Vila Jequitibás|Guanabara|Jardim Planalto|Nova Campinas|Cambuí|Jardim Bela Vista|Vila Nogueira|Jardim Santana|Jardim Nilópolis|Fazenda Santa Cândida|Parque das Universidades|Bosque das Palmeiras|Parque dos Jacarandás|Cidade Universitária"]]
  };
  var BSRC = { mun: function (n) { return { n: "Cittamobi: paradas da linha " + n, u: "https://linhas.cittamobi.com.br/" }; }, met: function (n) { return { n: "BusInfo: paradas da linha " + n, u: "https://businfo.app.br/linhadetalhes/" + encodeURIComponent(n) + "?cidade=EMTU+-+CAMPINAS" }; } };
  function isCond(b) { return /^(Cond|Conj|Lot|Residencial)/i.test(b); }
  LINES.forEach(function (l) {
    var g = BAIRROS[lineId(l)] || [];
    l.bairros = g.map(function (x) { return { c: x[0], b: x[1].split("|") }; });
    l.bflat = []; l.bairros.forEach(function (x) { x.b.forEach(function (b) { l.bflat.push({ c: x.c, b: b }); }); });
  });
  var DESTS = [["todas", "Todos os destinos"], ["unicamp", "Unicamp"], ["puc", "PUC-Campinas"], ["barao", "Barão Geraldo"], ["terminal-metro", "Terminal Metropolitano"], ["shopping", "Shoppings"], ["sumare", "Sumaré"], ["hortolandia", "Hortolândia"], ["aeroporto", "Viracopos"]];
  if (!Array.isArray(state.busFav)) state.busFav = [];
  var busType = "todos", busDest = "todas", openLine = null;
  function lineId(l) { return l.n.replace(/\s/g, ""); }
  function lineByN(id) { return LINES.filter(function (l) { return lineId(l) === id; })[0]; }
  function lineTitle(l) { return l.title || (l.from + " ⇄ " + l.to); }

  function lineCard(l, compact) {
    var id = lineId(l), fav = state.busFav.indexOf(id) >= 0;
    var li = el("li", { class: "bus-card bt-" + l.type, "data-id": id });
    var head = el("button", { type: "button", class: "bus-head", "aria-expanded": String(openLine === id), "aria-controls": "bus-body-" + id + (compact ? "-f" : "") }, [
      el("span", { class: "bus-n", text: l.n }),
      el("span", { class: "bus-t" }, [el("b", { text: lineTitle(l) }), el("span", { class: "small muted", text: (l.type === "mun" ? "Municipal de Campinas" : "Metropolitana") + (l.oper ? " · " + l.oper : "") + (l.fare ? " · " + l.fare : "") })]),
      el("span", { class: "bus-chev", "aria-hidden": "true", text: "+" })
    ]);
    var star = el("button", { type: "button", class: "round-btn sm fav-btn" + (fav ? " on" : ""), "aria-pressed": String(fav), "aria-label": (fav ? "Remover a linha " : "Salvar a linha ") + l.n + " em minhas linhas", title: fav ? "Salva em minhas linhas" : "Salvar em minhas linhas" });
    var NSs = "http://www.w3.org/2000/svg", sv = document.createElementNS(NSs, "svg"), pa = document.createElementNS(NSs, "path");
    sv.setAttribute("class", "ico"); sv.setAttribute("viewBox", "0 0 24 24"); sv.setAttribute("aria-hidden", "true");
    pa.setAttribute("d", "M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"); sv.appendChild(pa); star.appendChild(sv);
    star.addEventListener("click", function () { toggleBusFav(id); });
    var body = el("div", { class: "bus-body", id: "bus-body-" + id + (compact ? "-f" : ""), hidden: openLine === id ? null : "" });
    if (openLine !== id) body.hidden = true;
    var trip = el("ol", { class: "trip", "aria-label": "Trajeto da linha " + l.n });
    l.pts.forEach(function (p, i) { trip.appendChild(el("li", { class: i === 0 ? "start" : i === l.pts.length - 1 ? "end" : "" }, [el("span", { text: p })])); });
    body.appendChild(el("span", { class: "label", text: l.pts.length > 2 ? "Trajeto (principais pontos)" : "Trajeto (pontos finais)" }));
    body.appendChild(trip);
    if (l.bairros.length) {
      var hq = bairroQuery || norm(str($("busSearch").value, 40).trim()); if (hq.length < 3) hq = "";
      body.appendChild(el("span", { class: "label", text: "Bairros e condomínios atendidos (" + l.bflat.length + ")" }));
      var bw = el("div", { class: "bairro-groups" });
      l.bairros.forEach(function (g) {
        var ul = el("ul", { class: "bairro-chips", "aria-label": "Bairros em " + g.c });
        g.b.forEach(function (b) {
          var hit = hq && norm(b).indexOf(hq) >= 0;
          ul.appendChild(el("li", { class: (isCond(b) ? "cond" : "") + (hit ? " hit" : ""), text: b }));
        });
        bw.appendChild(el("div", { class: "bairro-g" }, [el("b", { class: "small", text: g.c }), ul]));
      });
      body.appendChild(bw);
    }
    var facts = el("dl", { class: "bus-facts" });
    if (l.note) facts.appendChild(el("div", null, [el("dt", { text: "Sobre a linha" }), el("dd", { text: l.note })]));
    if (l.integ) facts.appendChild(el("div", null, [el("dt", { text: "Integração" }), el("dd", { text: l.integ })]));
    if (l.sched) facts.appendChild(el("div", null, [el("dt", { text: "Horários" }), el("dd", { text: l.sched })]));
    if (l.fare) facts.appendChild(el("div", null, [el("dt", { text: "Tarifa" }), el("dd", { text: l.fare })]));
    body.appendChild(facts);
    var srcs = el("p", { class: "small muted bus-src" }, ["Fonte: "]);
    l.src.forEach(function (k, i) { if (i) srcs.appendChild(document.createTextNode(" · ")); srcs.appendChild(el("a", { href: SRC[k].u, target: "_blank", rel: "noopener noreferrer", class: "ext", text: SRC[k].n })); });
    if (l.bairros.length) { var bs = BSRC[l.type](l.n.split(" ")[0]); srcs.appendChild(document.createTextNode(" · ")); srcs.appendChild(el("a", { href: bs.u, target: "_blank", rel: "noopener noreferrer", class: "ext", text: bs.n })); }
    body.appendChild(srcs);
    var official = el("a", { class: "doc-link", href: l.type === "mun" ? "https://www.emdec.com.br" : "https://www.emtu.sp.gov.br", target: "_blank", rel: "noopener noreferrer" }, [l.type === "mun" ? "Horários atualizados na Emdec" : "Horários atualizados na EMTU", el("span", { class: "sr-only", text: " (abre em nova aba)" })]);
    body.appendChild(official);
    head.addEventListener("click", function () {
      var open = body.hidden;
      openLine = open ? id : null;
      document.querySelectorAll(".bus-card").forEach(function (c) {
        var on = open && c.dataset.id === id;
        c.querySelector(".bus-body").hidden = !on;
        c.querySelector(".bus-head").setAttribute("aria-expanded", String(on));
        c.classList.toggle("open", on);
      });
      if (open && !reduceMotion) body.animate([{ opacity: 0, transform: "translateY(-6px)" }, { opacity: 1, transform: "none" }], { duration: 350, easing: "cubic-bezier(.22,1,.36,1)" });
    });
    if (openLine === id) li.classList.add("open");
    li.appendChild(el("div", { class: "bus-row" }, [head, star]));
    li.appendChild(body);
    return li;
  }
  function toggleBusFav(id) {
    var i = state.busFav.indexOf(id);
    if (i >= 0) state.busFav.splice(i, 1); else state.busFav.push(id);
    save(); renderBus(); renderBusFav();
    toast(i >= 0 ? "Linha removida das suas linhas." : "Linha " + lineByN(id).n + " salva em minhas linhas.");
  }
  function renderBusFav() {
    var ul = $("busFav"); clear(ul);
    var favs = state.busFav.map(lineByN).filter(Boolean);
    $("busFavCount").textContent = favs.length ? favs.length + (favs.length > 1 ? " linhas salvas" : " linha salva") : "";
    if (!favs.length) { ul.appendChild(el("li", { class: "empty", text: "Você ainda não salvou nenhuma linha. Toque na estrela de uma linha para guardá-la aqui." })); return; }
    favs.forEach(function (l) { ul.appendChild(lineCard(l, true)); });
  }
  function busMatches() {
    var q = norm(str($("busSearch").value, 40));
    return LINES.filter(function (l) {
      if (busType !== "todos" && l.type !== busType) return false;
      if (busDest !== "todas" && l.tags.indexOf(busDest) < 0) return false;
      if (!q) return true;
      return norm(l.n + " " + l.from + " " + l.to + " " + l.pts.join(" ") + " " + (l.note || "") + " " + l.bflat.map(function (x) { return x.b + " " + x.c; }).join(" ")).indexOf(q) >= 0;
    });
  }
  function renderBus() {
    var ul = $("busList"), list = busMatches(); clear(ul);
    $("busCount").textContent = list.length + (list.length === 1 ? " linha" : " linhas");
    if (!list.length) ul.appendChild(el("li", { class: "empty", text: "Nenhuma linha encontrada. Tente outro número, bairro ou destino." }));
    list.forEach(function (l) { ul.appendChild(lineCard(l, false)); });
    renderBusFavMarks();
  }
  function renderBusFavMarks() {}
  /* Qual linha passa no meu bairro */
  var bairroQuery = "", bairroCity = "todas";
  function allBairros() {
    var m = {};
    LINES.forEach(function (l) { l.bflat.forEach(function (x) { var k = x.b + "|" + x.c; if (!m[k]) m[k] = { b: x.b, c: x.c, n: 0 }; m[k].n++; }); });
    return Object.keys(m).map(function (k) { return m[k]; }).sort(function (a, b) { return a.b.localeCompare(b.b, "pt-BR"); });
  }
  function renderBairro() {
    var q = norm(str($("bairroQ").value, 50).trim()), out = $("bairroOut"), sug = $("bairroSug");
    bairroQuery = q; clear(out); clear(sug);
    var all = allBairros().filter(function (x) { return bairroCity === "todas" || x.c === bairroCity; });
    if (q.length < 2) {
      $("bairroCount").textContent = all.length + " bairros e condomínios";
      sug.appendChild(el("span", { class: "label", text: "Mais atendidos" }));
      all.slice().sort(function (a, b) { return b.n - a.n; }).slice(0, 10).forEach(function (x) { sug.appendChild(sugBtn(x)); });
      return;
    }
    var hits = all.filter(function (x) { return norm(x.b).indexOf(q) >= 0; });
    $("bairroCount").textContent = hits.length ? hits.length + (hits.length > 1 ? " lugares encontrados" : " lugar encontrado") : "";
    if (!hits.length) {
      out.appendChild(el("p", { class: "muted", text: "Não encontrei esse bairro na lista. Tente só uma parte do nome (por exemplo, “Veneza” ou “Amanda”) ou procure pelo bairro vizinho maior." }));
      return;
    }
    if (hits.length > 1 && hits.length <= 12) hits.forEach(function (x) { sug.appendChild(sugBtn(x)); });
    hits.sort(function (a, b) { return (norm(b.b) === q) - (norm(a.b) === q) || (norm(b.b).indexOf(q) === 0) - (norm(a.b).indexOf(q) === 0); });
    var use = hits.slice(0, 8);
    use.forEach(function (x) {
      var lines = LINES.filter(function (l) { return l.bflat.some(function (y) { return y.b === x.b && y.c === x.c; }); });
      var box = el("div", { class: "bairro-res" }, [
        el("p", { class: "bairro-name" }, [el("b", { text: x.b }), el("span", { class: "small muted", text: " · " + x.c + (isCond(x.b) ? " · condomínio ou conjunto" : "") })]),
        el("p", { class: "small muted", text: lines.length > 1 ? lines.length + " linhas passam por aqui:" : "1 linha passa por aqui:" })
      ]);
      var ul = el("ul", { class: "plan-list" });
      lines.forEach(function (l) {
        var b = el("button", { type: "button", class: "plan-go" }, [el("span", { class: "bus-n sm bt-" + l.type, text: l.n }), el("span", { text: lineTitle(l) })]);
        b.addEventListener("click", function () { openLineInList(lineId(l)); });
        ul.appendChild(el("li", null, [b]));
      });
      box.appendChild(ul); out.appendChild(box);
    });
    if (hits.length > 8) out.appendChild(el("p", { class: "small muted", text: "Há mais resultados. Digite mais letras do nome para filtrar." }));
  }
  function sugBtn(x) {
    var b = el("button", { type: "button", class: "chip-btn", text: x.b + (bairroCity === "todas" ? " · " + x.c : "") });
    b.addEventListener("click", function () { $("bairroQ").value = x.b; renderBairro(); });
    return b;
  }
  function openLineInList(id) {
    $("busSearch").value = ""; busType = "todos"; busDest = "todas";
    $("busType").querySelectorAll("button").forEach(function (x) { x.setAttribute("aria-pressed", String(x.dataset.t === "todos")); });
    $("busDest").querySelectorAll("button").forEach(function (x, i) { x.setAttribute("aria-pressed", String(i === 0)); });
    openLine = id; renderBus(); renderBusFav();
    var c = $("busList").querySelector('[data-id="' + id.replace(/[^0-9a-z\/.]/gi, "") + '"]');
    if (c) { c.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "center" }); var h = c.querySelector(".bus-head"); if (h) h.focus({ preventScroll: true }); }
  }
  function buildBairro() {
    var dl = $("bairroList"), seen = {};
    allBairros().forEach(function (x) { if (!seen[x.b]) { seen[x.b] = 1; dl.appendChild(el("option", { value: x.b })); } });
    var seg = $("bairroCity");
    ["todas", "Campinas", "Sumaré", "Hortolândia", "Paulínia", "Valinhos", "Vinhedo"].forEach(function (c) {
      var b = el("button", { type: "button", "aria-pressed": String(c === "todas"), text: c === "todas" ? "Todas as cidades" : c });
      b.addEventListener("click", function () { bairroCity = c; seg.querySelectorAll("button").forEach(function (x) { x.setAttribute("aria-pressed", String(x === b)); }); renderBairro(); });
      seg.appendChild(b);
    });
    $("bairroQ").addEventListener("input", renderBairro);
    renderBairro();
  }
  function norm(t) { return t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, ""); }

  /* Planejar trajeto: linha direta ou com uma troca */
  function allPlaces() {
    var s = {}; LINES.forEach(function (l) { l.pts.forEach(function (p) { if (!/^(Av\.|Rodovia|Balão)/.test(p)) s[p] = 1; }); });
    return Object.keys(s).sort(function (a, b) { return a.localeCompare(b, "pt-BR"); });
  }
  function planTrip() {
    var a = $("tripFrom").value, b = $("tripTo").value, out = $("tripOut"); clear(out);
    if (!a || !b) { out.appendChild(el("p", { class: "muted small", text: "Escolha de onde você sai e para onde vai." })); return; }
    if (a === b) { out.appendChild(el("p", { class: "muted small", text: "A origem e o destino são o mesmo lugar." })); return; }
    var direct = LINES.filter(function (l) { return l.pts.indexOf(a) >= 0 && l.pts.indexOf(b) >= 0; });
    var combos = [];
    if (!direct.length) {
      LINES.forEach(function (l1) {
        if (l1.pts.indexOf(a) < 0) return;
        LINES.forEach(function (l2) {
          if (l2 === l1 || l2.pts.indexOf(b) < 0) return;
          l1.pts.forEach(function (x) { if (x !== a && x !== b && l2.pts.indexOf(x) >= 0 && !/^(Av\.|Rodovia|Balão)/.test(x)) combos.push([l1, x, l2]); });
        });
      });
    }
    if (direct.length) {
      out.appendChild(el("p", { class: "trip-ok", text: direct.length > 1 ? direct.length + " linhas fazem esse trajeto sem troca:" : "Uma linha faz esse trajeto sem troca:" }));
      var ul = el("ul", { class: "plan-list" });
      direct.forEach(function (l) { ul.appendChild(el("li", null, [el("span", { class: "bus-n sm bt-" + l.type, text: l.n }), el("span", { text: lineTitle(l) })])); });
      out.appendChild(ul);
    } else if (combos.length) {
      out.appendChild(el("p", { class: "trip-ok", text: "Não há linha direta nesta lista, mas dá para ir com uma troca:" }));
      var ul2 = el("ul", { class: "plan-list" });
      combos.slice(0, 6).forEach(function (c) {
        ul2.appendChild(el("li", null, [el("span", { class: "bus-n sm bt-" + c[0].type, text: c[0].n }), el("span", { text: "até " + c[1] + ", depois " }), el("span", { class: "bus-n sm bt-" + c[2].type, text: c[2].n })]));
      });
      out.appendChild(ul2);
      out.appendChild(el("p", { class: "small muted", text: "Algumas trocas nos terminais são integradas, sem pagar outra passagem. Confira em cada linha." }));
    } else {
      out.appendChild(el("p", { class: "muted", text: "Não encontrei esse trajeto nas linhas desta página. Consulte o itinerário completo na Emdec (ônibus de Campinas) ou na EMTU (linhas metropolitanas)." }));
    }
  }
  function buildBus() {
    var segT = $("busType");
    segT.querySelectorAll("button").forEach(function (b) {
      b.addEventListener("click", function () { busType = b.dataset.t; segT.querySelectorAll("button").forEach(function (x) { x.setAttribute("aria-pressed", String(x === b)); }); renderBus(); });
    });
    var chips = $("busDest");
    DESTS.forEach(function (d) {
      var b = el("button", { type: "button", "aria-pressed": String(d[0] === "todas"), text: d[1] });
      b.addEventListener("click", function () { busDest = d[0]; chips.querySelectorAll("button").forEach(function (x) { x.setAttribute("aria-pressed", String(x === b)); }); renderBus(); });
      chips.appendChild(b);
    });
    $("busSearch").addEventListener("input", renderBus);
    var places = allPlaces();
    PF_fill($("tripFrom"), places, "De onde você sai?");
    PF_fill($("tripTo"), places, "Para onde vai?");
    $("tripTo").value = UNI;
    $("tripFrom").addEventListener("change", planTrip); $("tripTo").addEventListener("change", planTrip);
    $("tripSwap").addEventListener("click", function () { var a = $("tripFrom").value; $("tripFrom").value = $("tripTo").value; $("tripTo").value = a; planTrip(); });
    renderBus(); renderBusFav(); planTrip(); buildBairro();
  }
  function PF_fill(sel, list, ph) {
    clear(sel); sel.appendChild(el("option", { value: "", text: ph }));
    list.forEach(function (v) { sel.appendChild(el("option", { value: v, text: v })); });
  }

  /* ---------- Campus-modelo em 3D ---------- */
  var ZCATS = { estudo: "Estudo", servicos: "Serviços e apoio", alimentacao: "Alimentação", saude: "Saúde", esporte: "Esporte", moradia: "Moradia", transporte: "Transporte", convivencia: "Convivência" };
  var ZCOLOR = { estudo: "--blue", servicos: "--mustard", alimentacao: "--terra", saude: "--plum", esporte: "--sage", moradia: "--brown", transporte: "--petrol", convivencia: "--sage" };
  function polar(r, deg) { var a = deg * Math.PI / 180; return [Math.cos(a) * r, Math.sin(a) * r]; }
  var ZONES = [
    { id: "biblioteca", cat: "estudo", name: "Biblioteca central", s: "Biblioteca",
      desc: "O coração do estudo no campus. Guarda o acervo de livros e revistas, oferece salas de leitura em silêncio e salas para estudar em grupo.",
      what: ["Pegar e renovar livros emprestados", "Estudar em silêncio ou reservar sala de grupo", "Acessar bases de pesquisa como o Portal CAPES", "Usar computadores e Wi-Fi"],
      region: "Na Unicamp, a Biblioteca Central Cesar Lattes fica perto do centro do campus, e cada instituto tem a sua biblioteca. PUC-Campinas, Fatecs e IFSP têm bibliotecas em cada campus.",
      leve: "Carteirinha ou número de matrícula.", tip: "Renove os empréstimos antes do vencimento para evitar multa.",
      shapes: [{ t: "box", x: 0, z: -15, w: 15, d: 9, h: 7 }, { t: "box", x: 0, z: -15, w: 9, d: 5, h: 10 }] },
    { id: "praca", cat: "convivencia", name: "Praça central", s: "Praça",
      desc: "Área aberta no meio do campus, onde as pessoas se encontram, descansam entre as aulas e participam de feiras e eventos.",
      what: ["Encontrar a turma entre as aulas", "Estudar ao ar livre", "Participar de feiras, apresentações e eventos"],
      region: "Gramados e praças entre os prédios são marca dos campi grandes, como o da Unicamp. Em campi compactos, o pátio central faz esse papel.",
      leve: "Garrafa de água e protetor solar.", tip: "Eventos de recepção dos calouros costumam acontecer aqui.",
      shapes: [{ t: "disc", x: 0, z: 0, r: 9, h: .5 }] },
    { id: "salas", cat: "estudo", name: "Salas de aula e ciclo básico", s: "Salas de aula",
      desc: "Prédios com as salas de aula, principalmente das disciplinas dos primeiros anos, que reúnem estudantes de vários cursos.",
      what: ["Assistir às aulas das disciplinas", "Consultar o mural com as salas de cada turma", "Estudar entre uma aula e outra"],
      region: "Na Unicamp, o Ciclo Básico concentra salas de muitas disciplinas iniciais. Nas Fatecs e no IFSP, as salas ficam no mesmo prédio dos laboratórios.",
      leve: "Grade de horários com o número das salas.", tip: "A sala de cada turma aparece no sistema acadêmico.",
      shapes: [{ t: "box", x: 15, z: -4, w: 8, d: 13, h: 5 }, { t: "box", x: -15, z: -4, w: 8, d: 13, h: 5 }] },
    { id: "institutos", cat: "estudo", name: "Institutos e faculdades", s: "Institutos",
      desc: "Cada área do conhecimento tem seus prédios, com salas, laboratórios, coordenação de curso e professores.",
      what: ["Falar com a coordenação do seu curso", "Encontrar os professores e monitores", "Assistir às aulas específicas do curso"],
      region: "A Unicamp organiza os cursos em institutos e faculdades, como Física, Computação, Engenharias e Humanas. Na PUC-Campinas, as áreas se dividem entre o Campus I e o Campus II.",
      leve: "Nome do seu curso e do coordenador.", tip: "Descubra cedo onde fica a coordenação: é lá que se resolvem dúvidas do curso.",
      shapes: [-70, -50, -30, -10, 10, 30].map(function (a, i) { var p = polar(32, a); return { t: "box", x: p[0], z: p[1], w: 8, d: 7, h: 6 + (i % 3) * 2, ry: -a }; }) },
    { id: "labs", cat: "estudo", name: "Laboratórios e pesquisa", s: "Laboratórios",
      desc: "Espaços para aulas práticas, projetos e pesquisa científica, com equipamentos específicos de cada área.",
      what: ["Aulas práticas e experimentos", "Laboratórios de informática", "Iniciação científica com professores"],
      region: "Perto da Unicamp fica o CNPEM, centro de pesquisa onde está o acelerador Sirius. Nas Fatecs e no IFSP, os laboratórios ficam no prédio das aulas.",
      leve: "Jaleco, óculos de proteção e sapato fechado, quando exigidos.", tip: "Iniciação científica é uma ótima porta para bolsas e estágio.",
      shapes: [135, 155, 175].map(function (a) { var p = polar(32, a); return { t: "box", x: p[0], z: p[1], w: 9, d: 7, h: 5, ry: -a }; }).concat([{ t: "cyl", x: polar(32, 195)[0], z: polar(32, 195)[1], r: 4, h: 4 }]) },
    { id: "ru", cat: "alimentacao", name: "Restaurante universitário", s: "Bandejão",
      desc: "Refeições completas a preço baixo, pensadas para quem passa o dia no campus.",
      what: ["Almoço e jantar a preço subsidiado", "Conferir o cardápio da semana", "Usar o auxílio-alimentação, se tiver"],
      region: "Na Unicamp, os restaurantes universitários são conhecidos como bandejão. Em campi menores, o comum são cantinas e restaurantes particulares.",
      leve: "Carteirinha e créditos para a refeição.", tip: "Chegue cedo: o horário do almoço tem fila.",
      shapes: [{ t: "box", x: polar(28, 60)[0], z: polar(28, 60)[1], w: 11, d: 7, h: 4, ry: -60 }] },
    { id: "admin", cat: "servicos", name: "Secretaria e administração", s: "Secretaria",
      desc: "Onde ficam a vida acadêmica e a burocracia: matrícula, documentos, histórico e a administração da universidade.",
      what: ["Matrícula, rematrícula e trancamento", "Declarações e histórico escolar", "Segunda via da carteirinha"],
      region: "Na Unicamp, a vida acadêmica fica com a DAC, a Diretoria Acadêmica. Em quase todo campus, a secretaria fica perto da entrada.",
      leve: "Documento com foto e número de matrícula.", tip: "Muitos pedidos já são feitos pelo sistema on-line.",
      shapes: [{ t: "box", x: polar(28, 115)[0], z: polar(28, 115)[1], w: 9, d: 7, h: 7, ry: -115 }] },
    { id: "apoio", cat: "servicos", name: "Assistência estudantil e apoio", s: "Apoio ao estudante",
      desc: "Serviços que ajudam o estudante a permanecer no curso: bolsas, auxílios e atendimento psicológico.",
      what: ["Pedir bolsas e auxílios de moradia, alimentação e transporte", "Atendimento psicológico gratuito e sigiloso", "Orientação de estudos e acessibilidade"],
      region: "Na Unicamp, o SAE cuida das bolsas e da moradia, e o SAPPE oferece apoio psicológico e psiquiátrico.",
      leve: "Comprovantes de renda de todos que moram com você.", tip: "Os editais de auxílio abrem em datas fixas.",
      shapes: [{ t: "box", x: polar(28, 215)[0], z: polar(28, 215)[1], w: 8, d: 6, h: 4, ry: -215 }, { t: "box", x: polar(28, 235)[0], z: polar(28, 235)[1], w: 6, d: 6, h: 3, ry: -235 }] },
    { id: "saude", cat: "saude", name: "Área da saúde e hospital", s: "Saúde e hospital",
      desc: "Prédios dos cursos da saúde e, em algumas universidades, um hospital-escola que atende a população e serve de campo de estágio.",
      what: ["Atendimento de saúde para a comunidade universitária", "Estágios dos cursos da saúde", "Vacinas e orientações"],
      region: "A Unicamp tem o Hospital de Clínicas e o CECOM, que atende estudantes e servidores. A PUC-Campinas tem o Hospital PUC-Campinas, no Campus II.",
      leve: "Documento com foto e Cartão SUS.", tip: "Em emergência, ligue para o SAMU no 192.",
      shapes: [{ t: "box", x: polar(52, 205)[0], z: polar(52, 205)[1], w: 14, d: 10, h: 13, ry: -205 }, { t: "box", x: polar(52, 225)[0], z: polar(52, 225)[1], w: 9, d: 8, h: 8, ry: -225 }] },
    { id: "esporte", cat: "esporte", name: "Ginásio e quadras", s: "Esporte",
      desc: "Ginásio, quadras e pista para aulas de educação física, treinos das atléticas e atividades abertas.",
      what: ["Treinar com as atléticas dos cursos", "Usar quadras e pista", "Participar de jogos universitários"],
      region: "Na Unicamp, a Faculdade de Educação Física tem estrutura esportiva no campus. As atléticas dos cursos organizam treinos e campeonatos.",
      leve: "Roupa de treino e garrafa de água.", tip: "Entrar para uma atlética é um ótimo jeito de fazer amigos.",
      shapes: [{ t: "dome", x: polar(52, 300)[0], z: polar(52, 300)[1], r: 7, h: 5 }, { t: "court", x: polar(52, 325)[0], z: polar(52, 325)[1], w: 12, d: 7, ry: -325 }, { t: "court", x: polar(52, 280)[0], z: polar(52, 280)[1], w: 10, d: 6, ry: -280 }] },
    { id: "moradia", cat: "moradia", name: "Moradia estudantil", s: "Moradia",
      desc: "Casas ou apartamentos para estudantes, em geral para quem tem baixa renda e vem de longe.",
      what: ["Morar perto do campus pagando pouco ou nada", "Conviver com estudantes de vários cursos"],
      region: "A Unicamp tem uma Moradia Estudantil, ligada ao campus por uma linha de ônibus própria. A vaga é dada por edital da assistência estudantil.",
      leve: "Documentos do edital de moradia.", tip: "Inscreva-se no edital logo após a matrícula: as vagas são disputadas.",
      shapes: [20, 32, 44].map(function (a, i) { var p = polar(53, a); return { t: "house", x: p[0], z: p[1], w: 6, d: 5, h: 3 + (i % 2), ry: -a }; }) },
    { id: "terminal", cat: "transporte", name: "Ponto e ônibus circular", s: "Ônibus",
      desc: "Onde param as linhas que chegam ao campus e o ônibus circular, que leva de um prédio a outro.",
      what: ["Pegar as linhas para o centro e para outras cidades", "Usar o circular interno gratuito", "Conferir os horários no painel"],
      region: "A Unicamp tem circulares internos gratuitos. Linhas como a 330, a 332 e a 337 chegam ao campus, e a 653 e a 746 vêm de Sumaré e de Hortolândia.",
      leve: "Cartão com o passe escolar.", tip: "Veja o trajeto de cada linha na página Ônibus.",
      shapes: [{ t: "shelter", x: 0, z: 46 }, { t: "bus", x: 7, z: 47 }] },
    { id: "portaria", cat: "transporte", name: "Portaria", s: "Portaria",
      desc: "A entrada principal, com a guarita da segurança do campus.",
      what: ["Entrada de pedestres, bicicletas e carros", "Pedir informação e ajuda da segurança", "Ponto de encontro no primeiro dia"],
      region: "Campi grandes, como o da Unicamp, têm várias portarias com nomes próprios. Combine encontros pelo nome da portaria.",
      leve: "Carteirinha, se pedirem na entrada.", tip: "Salve no celular o telefone da segurança do campus.",
      shapes: [{ t: "gate", x: 0, z: 58 }] },
    { id: "estacionamento", cat: "transporte", name: "Estacionamento e bicicletário", s: "Estacionamento",
      desc: "Vagas para carros, motos e bicicletas.",
      what: ["Estacionar o carro ou a moto", "Prender a bicicleta com segurança"],
      region: "Nos campi da região, as vagas enchem cedo nos horários de aula. Ônibus e bicicleta costumam ser mais rápidos.",
      leve: "Uma trava em U para a bicicleta.", tip: "Prenda o quadro e a roda juntos.",
      shapes: [{ t: "parking", x: -20, z: 50, w: 18, d: 10 }] },
    { id: "convivencia", cat: "convivencia", name: "DCE e centro de convivência", s: "DCE",
      desc: "Espaço dos estudantes: representação estudantil, centros acadêmicos, eventos e cultura.",
      what: ["Tirar a carteira de estudante", "Participar de assembleias e eventos", "Conhecer coletivos e grupos"],
      region: "Unicamp e PUC-Campinas têm DCE próprio, além dos centros acadêmicos de cada curso.",
      leve: "Comprovante de matrícula e foto.", tip: "As assembleias discutem calendário, RU e transporte.",
      shapes: [{ t: "box", x: polar(28, 15)[0], z: polar(28, 15)[1], w: 8, d: 6, h: 3.5, ry: -15 }] },
    { id: "verde", cat: "convivencia", name: "Lago e área verde", s: "Área verde",
      desc: "Áreas verdes e espelhos d'água que deixam o campus mais fresco e servem para caminhadas e descanso.",
      what: ["Caminhar e correr", "Estudar à sombra", "Ver a fauna do campus"],
      region: "Os campi da região têm muitas áreas verdes. Em Campinas, a Lagoa do Taquaral, fora do campus, também é um ótimo lugar para estudar ao ar livre.",
      leve: "Repelente e água.", tip: "Respeite os animais e não deixe lixo.",
      shapes: [{ t: "water", x: polar(48, 150)[0], z: polar(48, 150)[1], r: 8 }] }
  ];
  if (!Array.isArray(state.campusFav)) state.campusFav = [];
  if (!state.campusWeek || typeof state.campusWeek !== "object") state.campusWeek = {};
  var curZone = null, zoneCat = "todos";
  function zoneById(id) { return ZONES.filter(function (z) { return z.id === id; })[0]; }
  function cssColor(name) { return getComputedStyle(document.body).getPropertyValue(name).trim() || "#888"; }

  /* Painel de informações da área */
  function showZone(id, user) {
    var z = zoneById(id); if (!z) return;
    curZone = z;
    var box = $("zoneInfo"); clear(box);
    var main = el("div", { class: "pp-main" }), det = el("div", { class: "pp-details" });
    box.appendChild(main); box.appendChild(det);
    var fav = state.campusFav.indexOf(z.id) >= 0;
    var star = el("button", { class: "round-btn sm fav-btn" + (fav ? " on" : ""), type: "button", "aria-pressed": String(fav), "aria-label": fav ? "Remover dos meus lugares" : "Salvar em meus lugares", title: fav ? "Salvo em meus lugares" : "Salvar em meus lugares" });
    var NSs = "http://www.w3.org/2000/svg", sv = document.createElementNS(NSs, "svg"), pa = document.createElementNS(NSs, "path");
    sv.setAttribute("class", "ico"); sv.setAttribute("viewBox", "0 0 24 24"); sv.setAttribute("aria-hidden", "true");
    pa.setAttribute("d", "M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"); sv.appendChild(pa); star.appendChild(sv);
    star.addEventListener("click", function () { toggleFav(z.id); });
    var idx = ZONES.indexOf(z);
    main.appendChild(el("div", { class: "pp-top" }, [el("span", { class: "tag zc-" + z.cat, text: ZCATS[z.cat] }), el("span", { class: "label", text: "Área " + String(idx + 1).padStart(2, "0") }), star]));
    main.appendChild(el("h3", { text: z.name }));
    main.appendChild(el("p", { class: "pp-desc", text: z.desc }));
    var actions = el("div", { class: "pp-actions" });
    var prev = el("button", { class: "btn sm secondary", type: "button", text: "← Anterior" });
    prev.addEventListener("click", function () { selectZone(ZONES[(idx - 1 + ZONES.length) % ZONES.length].id, true); });
    var next = el("button", { class: "btn sm", type: "button", text: "Próxima área →" });
    next.addEventListener("click", function () { selectZone(ZONES[(idx + 1) % ZONES.length].id, true); });
    actions.appendChild(prev); actions.appendChild(next); main.appendChild(actions);
    det.appendChild(el("span", { class: "label", text: "O que você faz aqui" }));
    det.appendChild(el("ul", null, z.what.map(function (w) { return el("li", { text: w }); })));
    det.appendChild(el("p", { class: "small" }, [el("strong", { text: "Na região: " }), z.region]));
    det.appendChild(el("p", { class: "small" }, [el("strong", { text: "Leve: " }), z.leve]));
    det.appendChild(el("p", { class: "pp-tip small" }, [el("strong", { text: "Dica: " }), z.tip]));
    if (user && !reduceMotion) box.animate([{ opacity: 0, transform: "translateY(10px)" }, { opacity: 1, transform: "none" }], { duration: 400, easing: "cubic-bezier(.22,1,.36,1)" });
    document.querySelectorAll("#zoneList .zone-btn").forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.id === z.id)); });
  }
  function selectZone(id, user) {
    showZone(id, user);
    if (C3.ready) C3.focus(id, user);
  }
  function toggleFav(id) {
    var i = state.campusFav.indexOf(id);
    if (i >= 0) state.campusFav.splice(i, 1); else state.campusFav.push(id);
    save(); showZone(id, false); renderFavs();
    toast(i >= 0 ? "Removido dos seus lugares." : "Salvo em meus lugares.");
  }
  function renderFavs() {
    var ul = $("favList"); clear(ul);
    var favs = ZONES.filter(function (z) { return state.campusFav.indexOf(z.id) >= 0; });
    if (!favs.length) { ul.appendChild(el("li", { class: "empty", text: "Nenhuma área salva ainda. Toque na estrela no painel do campus." })); return; }
    favs.forEach(function (z) {
      var go = el("button", { class: "fav-go", type: "button" }, [el("span", { class: "dotc zc-" + z.cat, "aria-hidden": "true" }), el("b", { text: z.name }), el("span", { class: "small muted", text: ZCATS[z.cat] })]);
      go.addEventListener("click", function () { selectZone(z.id, true); $("mapa").scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" }); });
      ul.appendChild(el("li", null, [go]));
    });
  }
  function buildZoneUI() {
    var f = $("zoneFilter");
    var counts = { todos: ZONES.length }; ZONES.forEach(function (z) { counts[z.cat] = (counts[z.cat] || 0) + 1; });
    [["todos", "Todas"]].concat(Object.keys(ZCATS).map(function (k) { return [k, ZCATS[k]]; })).forEach(function (c) {
      var b = el("button", { type: "button", "data-cat": c[0], "aria-pressed": String(c[0] === "todos") }, [c[1] + " ", el("span", { class: "cnt", text: String(counts[c[0]] || 0) })]);
      b.addEventListener("click", function () {
        zoneCat = c[0];
        f.querySelectorAll("button").forEach(function (x) { x.setAttribute("aria-pressed", String(x === b)); });
        document.querySelectorAll("#zoneList .zone-btn").forEach(function (zb) { zb.classList.toggle("dim", zoneCat !== "todos" && zb.dataset.cat !== zoneCat); });
        if (C3.ready) C3.filter(zoneCat);
      });
      f.appendChild(b);
    });
    var list = $("zoneList");
    ZONES.forEach(function (z, i) {
      var b = el("button", { type: "button", class: "zone-btn zc-" + z.cat, "data-id": z.id, "data-cat": z.cat, role: "listitem", "aria-pressed": "false" }, [
        el("span", { class: "zn", text: String(i + 1).padStart(2, "0") }), el("b", { text: z.name }), el("span", { class: "zd", text: ZCATS[z.cat] })]);
      b.addEventListener("click", function () { selectZone(z.id, true); if (window.innerWidth < 900) $("c3dStage").scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "center" }); });
      list.appendChild(b);
    });
  }

  /* Cena 3D (three.js) */
  var C3 = { ready: false }; window.C3ref = C3;
  // A biblioteca 3D (600 KB) só é baixada quando alguém abre a página Campus.
  function loadThree(cb) {
    if (window.THREE) { cb(); return; }
    var s = document.createElement("script"), done = false;
    var fin = function () { if (done) return; done = true; cb(); };
    s.src = "assets/vendor/three-r128.min.js"; s.async = true; s.onload = fin; s.onerror = fin;
    document.head.appendChild(s);
  }
  function buildCampus3D() {
    var THREE = window.THREE, canvas = $("c3dCanvas"), stage = $("c3dStage");
    if (!THREE) { $("c3dFallback").hidden = false; canvas.hidden = true; $("c3dHint").hidden = true; return; }
    var renderer;
    try { renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true }); }
    catch (e) { $("c3dFallback").hidden = false; canvas.hidden = true; $("c3dHint").hidden = true; return; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    var scene = new THREE.Scene();
    var camera = new THREE.PerspectiveCamera(40, 1, 1, 1000);
    var hemi = new THREE.HemisphereLight(0xffffff, 0x445566, .75); scene.add(hemi);
    var sun = new THREE.DirectionalLight(0xffffff, .85);
    sun.position.set(60, 90, 40); sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    var sc = sun.shadow.camera; sc.left = -80; sc.right = 80; sc.top = 80; sc.bottom = -80; sc.near = 10; sc.far = 260;
    scene.add(sun);
    var world = new THREE.Group(); scene.add(world);

    var mats = {};
    function mat(key, color, extra) {
      var m = new THREE.MeshStandardMaterial(Object.assign({ color: color, roughness: .9, metalness: 0 }, extra || {}));
      mats[key] = m; return m;
    }
    // Chão e vias
    var ground = new THREE.Mesh(new THREE.CircleGeometry(66, 72), mat("ground", 0xcccccc));
    ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; world.add(ground);
    function ring(r1, r2, key) {
      var m = new THREE.Mesh(new THREE.RingGeometry(r1, r2, 96), mats[key] || mat(key, 0x999999));
      m.rotation.x = -Math.PI / 2; m.position.y = .05; m.receiveShadow = true; world.add(m); return m;
    }
    ring(21, 23.5, "road"); ring(41.5, 44, "road");
    [0, 90, 180, 270].forEach(function (a) {
      var g = new THREE.Mesh(new THREE.PlaneGeometry(2.5, 20.5), mats.road);
      var p = polar(32.75, a); g.rotation.x = -Math.PI / 2; g.rotation.z = -a * Math.PI / 180 + Math.PI / 2; g.position.set(p[0], .06, p[1]); world.add(g);
    });
    var entr = new THREE.Mesh(new THREE.PlaneGeometry(3, 16), mats.road); entr.rotation.x = -Math.PI / 2; entr.position.set(0, .06, 51); world.add(entr);
    // Árvores decorativas
    mat("tree", 0x77aa77); mat("trunk", 0x8a6a4a); mat("tree2", 0x6f9f63); mat("ipeR", 0xd97aa6); mat("ipeY", 0xf2c94c); mat("car", 0xdddddd);
    var treeGeo = new THREE.ConeGeometry(1.6, 4.2, 7), trunkGeo = new THREE.CylinderGeometry(.3, .3, 1.2, 6), blobGeo = new THREE.IcosahedronGeometry(1.2, 1);
    // Detalhes das estruturas: janelas em faixas, colunas, telhados, placas, mobiliário
    var zmats = {};
    function zm(zid, name, color, extra, kind) {
      var k = "z-" + zid + "-" + name;
      if (mats[k]) return mats[k];
      var m = new THREE.MeshStandardMaterial(Object.assign({ color: color, roughness: .85, metalness: 0, transparent: true, opacity: 1 }, extra || {}));
      m.userData.kind = kind || ""; m.userData.op = (extra && extra.opacity) || 1;
      mats[k] = m; (zmats[zid] = zmats[zid] || []).push(m); return m;
    }
    function reg(zid, m) { m.userData.op = m.userData.op || 1; (zmats[zid] = zmats[zid] || []).push(m); return m; }
    function B(p, w, h, d, m, x, y, z) { var o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x || 0, y || 0, z || 0); p.add(o); return o; }
    function Cy(p, rt, rb, h, seg, m, x, y, z) { var o = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg || 12), m); o.position.set(x || 0, y || 0, z || 0); p.add(o); return o; }
    function prism(p, w, hgt, d, m, x, yBase, z) { // telhado de duas águas ao longo do eixo x, apoiado em yBase
      var r = d * .58, sz = hgt / (1.5 * r);
      var o = new THREE.Mesh(new THREE.CylinderGeometry(r, r, w, 3, 1), m);
      o.rotation.z = Math.PI / 2; o.rotation.x = -Math.PI / 2; o.scale.set(1, 1, sz); o.position.set(x || 0, yBase + .5 * r * sz, z || 0); p.add(o); return o;
    }
    var texCache = {};
    function signTex(text, bg, fg, w) {
      var key = text + bg + fg; if (texCache[key]) return texCache[key];
      var c = document.createElement("canvas"); c.width = w || 512; c.height = 128;
      var g = c.getContext("2d");
      g.fillStyle = bg; g.fillRect(0, 0, c.width, c.height);
      g.fillStyle = fg; g.textAlign = "center"; g.textBaseline = "middle";
      var fs = 74; g.font = "600 " + fs + "px Inter, system-ui, sans-serif";
      while (g.measureText(text).width > c.width - 40 && fs > 20) { fs -= 4; g.font = "600 " + fs + "px Inter, system-ui, sans-serif"; }
      g.fillText(text, c.width / 2, c.height / 2 + 4);
      var t = new THREE.CanvasTexture(c); t.anisotropy = 4; texCache[key] = t; return t;
    }
    function sign(zid, p, text, w, h, x, y, z, ry, bg, fg) {
      var m = reg(zid, new THREE.MeshBasicMaterial({ map: signTex(text, bg || "#10324a", fg || "#ffffff"), transparent: true, opacity: 1 }));
      ry = ry || 0;
      var o = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m); o.position.set(x, y, z); o.rotation.y = ry; p.add(o);
      var back = o.clone(); back.rotation.y = ry + Math.PI; back.position.set(x - Math.sin(ry) * .03, y, z - Math.cos(ry) * .03); p.add(back);
      return o;
    }
    function clockTex() {
      if (texCache.clock) return texCache.clock;
      var c = document.createElement("canvas"); c.width = c.height = 128; var g = c.getContext("2d");
      g.fillStyle = "#fbf7ee"; g.beginPath(); g.arc(64, 64, 60, 0, Math.PI * 2); g.fill();
      g.strokeStyle = "#10324a"; g.lineWidth = 6; g.stroke();
      for (var i = 0; i < 12; i++) { var a = i * Math.PI / 6; g.lineWidth = i % 3 ? 3 : 6; g.beginPath(); g.moveTo(64 + Math.cos(a) * 46, 64 + Math.sin(a) * 46); g.lineTo(64 + Math.cos(a) * 54, 64 + Math.sin(a) * 54); g.stroke(); }
      g.lineWidth = 7; g.beginPath(); g.moveTo(64, 64); g.lineTo(64, 28); g.stroke();
      g.lineWidth = 5; g.beginPath(); g.moveTo(64, 64); g.lineTo(92, 74); g.stroke();
      return (texCache.clock = new THREE.CanvasTexture(c));
    }
    // faixas de janelas que contornam o prédio, uma por andar
    function ribbons(zid, p, w, h, d, fh, y0) {
      var gm = zm(zid, "glass", 0x2a4a5e, { roughness: .25, metalness: .3 }, "glass");
      var fm = zm(zid, "frame", 0xf2efe8, { roughness: .9 });
      fh = fh || 1.8; y0 = y0 || 0;
      for (var y = y0 + fh * .62; y < y0 + h - .6; y += fh) {
        B(p, w + .12, fh * .42, d + .12, gm, 0, y, 0);
        // montantes verticais nas fachadas longas
        for (var x = -w / 2 + 1.2; x < w / 2 - .4; x += 1.4) { B(p, .12, fh * .42, d + .2, fm, x, y, 0); }
      }
    }
    function door(zid, p, x, z, ry, w) {
      var dm = zm(zid, "door", 0x16303f, { roughness: .4 }, "glass");
      var o = B(p, w || 1.4, 1.9, .14, dm, x, .95, z); o.rotation.y = ry || 0; return o;
    }
    function canopy(zid, p, w, x, y, z, depth) {
      var cm = zm(zid, "canopy", 0xf2efe8, { roughness: .8 });
      var o = B(p, w, .2, depth || 1.8, cm, x, y, z);
      [-1, 1].forEach(function (s) { Cy(p, .08, .08, y, 6, cm, x + s * (w / 2 - .3), y / 2, z + (z < 0 ? -1 : 1) * ((depth || 1.8) / 2 - .2)); });
      return o;
    }
    function acUnits(zid, p, w, d, h, n) {
      var am = zm(zid, "equip", 0xbfc6cc, { roughness: .6, metalness: .2 });
      for (var i = 0; i < n; i++) B(p, 1, .7, .8, am, -w / 2 + 1.5 + i * (w - 3) / Math.max(1, n - 1), h + .85, (i % 2 ? .25 : -.25) * d);
    }
    function bench(zid, p, x, z, ry) {
      var wm = zm(zid, "wood", 0x9b7350, { roughness: .9 }), im = zm(zid, "iron", 0x3b4650, { roughness: .5, metalness: .4 });
      var g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry || 0; p.add(g);
      B(g, 1.8, .12, .5, wm, 0, .5, 0); B(g, 1.8, .4, .1, wm, 0, .8, -.22);
      B(g, .1, .5, .5, im, -.75, .25, 0); B(g, .1, .5, .5, im, .75, .25, 0);
      return g;
    }
    function lamp(zid, p, x, z, hgt) {
      var im = zm(zid, "iron", 0x3b4650, { roughness: .5, metalness: .4 });
      var lm = zm(zid, "lamp", 0xfff3d1, { emissive: 0xffd88a, emissiveIntensity: .3 }, "lamp");
      hgt = hgt || 3.2;
      Cy(p, .07, .1, hgt, 6, im, x, hgt / 2, z);
      var b = new THREE.Mesh(new THREE.SphereGeometry(.28, 10, 8), lm); b.position.set(x, hgt + .15, z); p.add(b);
    }
    function columns(zid, p, n, span, z, hgt, r) {
      var cm = zm(zid, "column", 0xf4f1ea, { roughness: .7 });
      for (var i = 0; i < n; i++) Cy(p, r || .32, (r || .32) * 1.12, hgt, 14, cm, -span / 2 + i * span / (n - 1), hgt / 2, z);
    }
    function car(zid, p, x, z, ry, color, k) {
      var bm = zm(zid, "car" + k, color, { roughness: .45, metalness: .3 });
      var gm = zm(zid, "carglass", 0x203040, { roughness: .2 });
      var wm = zm(zid, "tire", 0x1d1f22, { roughness: .9 });
      var g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry || 0; p.add(g);
      B(g, 1.7, .6, 3.4, bm, 0, .55, 0); B(g, 1.5, .55, 1.8, gm, 0, 1.1, -.15);
      [[-.8, -1.1], [.8, -1.1], [-.8, 1.1], [.8, 1.1]].forEach(function (q) { var t = Cy(g, .3, .3, .2, 10, wm, q[0], .3, q[1]); t.rotation.z = Math.PI / 2; });
      return g;
    }
    function busModel(zid, p, x, z, label) {
      var g = new THREE.Group(); g.position.set(x, 0, z); p.add(g);
      var bm = zm(zid, "busbody", 0xf5f2ea, { roughness: .5 });
      var stripe = mats["z-" + zid + "-roof"];
      var gm = zm(zid, "glass", 0x2a4a5e, { roughness: .25, metalness: .3 }, "glass");
      var wm = zm(zid, "tire", 0x1d1f22, { roughness: .9 });
      B(g, 9, 2.6, 2.6, bm, 0, 1.75, 0);
      B(g, 9.04, .35, 2.64, stripe, 0, .85, 0);
      B(g, 7.6, .85, 2.66, gm, -.4, 2.3, 0);
      B(g, .1, 1.1, 2.2, gm, 4.52, 2.15, 0);
      B(g, 8.6, .15, 2.3, bm, 0, 3.12, 0);
      [-3, 3].forEach(function (bx) { [-1.25, 1.25].forEach(function (bz) { var t = Cy(g, .55, .55, .35, 14, wm, bx, .55, bz); t.rotation.x = Math.PI / 2; }); });
      var s = sign(zid, g, label, 2.2, .45, 4.56, 2.95, 0, Math.PI / 2, "#111a20", "#ffb54a");
      return g;
    }
    function tree(p, x, z, kind, scale) {
      var g = new THREE.Group(); g.position.set(x, 0, z); g.scale.setScalar(scale || 1); p.add(g);
      var tk = new THREE.Mesh(trunkGeo, mats.trunk); tk.position.y = .6; g.add(tk);
      if (kind === "cone") { var c = new THREE.Mesh(treeGeo, mats.tree); c.position.y = 2.6; c.castShadow = true; g.add(c); }
      else {
        var m = kind === "ipe-r" ? mats.ipeR : kind === "ipe-y" ? mats.ipeY : mats.tree2;
        [[0, 2.5, 0, 1.5], [.7, 2.1, .3, 1], [-.6, 2.2, -.3, 1.1]].forEach(function (q) { var s = new THREE.Mesh(blobGeo, m); s.position.set(q[0], q[1], q[2]); s.scale.setScalar(q[3]); s.castShadow = true; g.add(s); });
        tk.scale.y = 1.6; tk.position.y = 1;
      }
      return g;
    }

    function addDetails(z, s, si, grp, h) {
      var id = z.id, roofM = mats["z-" + id + "-roof"];
      var white = zm(id, "white", 0xf6f3ec), dark = zm(id, "dark", 0x26333c, { roughness: .6 });
      var red = zm(id, "red", 0xd8483b), path = zm(id, "path", 0xe2d7c3);
      if (id === "biblioteca") {
        if (si === 0) {
          // pódio com escadaria e colunata voltada para a praça
          var st = zm(id, "stone", 0xe6dfd0);
          for (var k = 0; k < 3; k++) B(grp, s.w + 2 - k * .6, .3, 2.2 - k * .5, st, 0, .15 + k * .3, s.d / 2 + 1.2 - k * .25);
          columns(id, grp, 8, s.w - 1.2, s.d / 2 + .7, s.h - .5, .3);
          B(grp, s.w + .4, .7, 1.8, white, 0, s.h - .1, s.d / 2 + .4);
          ribbons(id, grp, s.w, s.h - 1, s.d, 2.2);
          sign(id, grp, "BIBLIOTECA", 7, 1.1, 0, s.h + .45, s.d / 2 + 1.32, 0, "#10324a", "#f6e7c4");
        } else {
          // volume superior todo envidraçado, com brises
          var gl = zm(id, "glass", 0x2a4a5e, { roughness: .25, metalness: .3 }, "glass");
          B(grp, s.w + .1, s.h - 7.6, s.d + .1, gl, 0, 7.5 + (s.h - 7.6) / 2, 0);
          for (var x = -s.w / 2 + .5; x <= s.w / 2 - .4; x += .9) { B(grp, .14, s.h - 7.5, s.d + .25, white, x, 7.5 + (s.h - 7.5) / 2, 0); }
        }
      } else if (id === "praca") {
        var wt = zm(id, "water", 0x6fb7d6, { roughness: .1, metalness: .2, opacity: .9 });
        var st2 = zm(id, "stone", 0xe6dfd0), fl = zm(id, "flower", 0xe58bb0), gr = zm(id, "grass", 0x8fbf7a);
        var top = s.h;
        B(grp, s.r * 2 - .6, .05, 1.6, path, 0, top + .03, 0); var pz = B(grp, 1.6, .05, s.r * 2 - .6, path, 0, top + .03, 0);
        Cy(grp, 2.8, 3, .6, 32, st2, 0, top + .3, 0); Cy(grp, 2.4, 2.4, .1, 32, wt, 0, top + .58, 0);
        Cy(grp, .35, .45, 1.6, 12, st2, 0, top + 1.2, 0); Cy(grp, 1.1, .6, .3, 20, st2, 0, top + 2.1, 0);
        Cy(grp, .9, .9, .06, 20, wt, 0, top + 2.27, 0);
        [45, 135, 225, 315].forEach(function (a) { var q = polar(5.4, a); Cy(grp, 1.4, 1.5, .35, 18, gr, q[0], top + .18, q[1]); for (var f = 0; f < 5; f++) { var fq = polar(.8, f * 72 + a); var bl = new THREE.Mesh(new THREE.SphereGeometry(.22, 6, 5), fl); bl.position.set(q[0] + fq[0], top + .45, q[1] + fq[1]); grp.add(bl); } });
        [0, 90, 180, 270].forEach(function (a) { [-1, 1].forEach(function (sd) { var q = polar(4.4, a + sd * 20); var b = bench(id, grp, q[0], q[1], -(a + sd * 20) * Math.PI / 180 - Math.PI / 2); b.position.y = top; }); });
        [22, 112, 202, 292].forEach(function (a) { var q = polar(7.9, a); lamp(id, grp, q[0], q[1], 3.4); });
      } else if (id === "salas") {
        ribbons(id, grp, s.w, s.h, s.d, 1.7);
        var face = s.x > 0 ? -1 : 1;
        var cpm = zm(id, "canopy", 0xf2efe8, { roughness: .8 });
        B(grp, 1.8, .2, 3.6, cpm, face * (s.w / 2 + .9), 2.4, 0);
        [-1.5, 1.5].forEach(function (pz) { Cy(grp, .08, .08, 2.4, 6, cpm, face * (s.w / 2 + 1.6), 1.2, pz); });
        door(id, grp, face * (s.w / 2 + .08), 0, Math.PI / 2, 1.8);
        acUnits(id, grp, s.w, s.d, s.h, 3);
        B(grp, .8, 1.6, .8, white, 0, s.h + 1.3, s.d / 2 - 1.5); // caixa da escada
        bench(id, grp, face * (s.w / 2 + 2.2), 4, face > 0 ? -Math.PI / 2 : Math.PI / 2);
        bench(id, grp, face * (s.w / 2 + 2.2), -4, face > 0 ? -Math.PI / 2 : Math.PI / 2);
      } else if (id === "institutos") {
        ribbons(id, grp, s.w, s.h, s.d, 1.9);
        door(id, grp, 0, -s.d / 2 - .08, 0, 1.6);
        canopy(id, grp, 3, 0, 2.3, -s.d / 2 - .9, 1.6);
        var kind = si % 3;
        if (kind === 0) { prism(grp, s.w + .4, 2.2, s.d + .4, roofM, 0, s.h + .5, 0); }
        else if (kind === 1) { Cy(grp, .9, .9, 1.6, 14, white, s.w / 2 - 1.6, s.h + 1.3, 0); Cy(grp, .95, .95, .2, 14, roofM, s.w / 2 - 1.6, s.h + 2.15, 0); acUnits(id, grp, s.w - 3, s.d, s.h, 2); }
        else { var sp = zm(id, "solar", 0x1f3550, { roughness: .2, metalness: .5 }); for (var r = 0; r < 3; r++) { var pnl = B(grp, s.w - 1.6, .1, 1.3, sp, 0, s.h + .9, -s.d / 2 + 1.4 + r * 2.1); pnl.rotation.x = -.35; } }
        var NAMES = ["FÍSICA", "COMPUTAÇÃO", "ENGENHARIA", "HUMANAS", "MATEMÁTICA", "QUÍMICA"];
        sign(id, grp, NAMES[si] || "INSTITUTO", 4.6, .75, 0, 2.95, -s.d / 2 - .08, 0, "#f6f3ec", "#10324a");
      } else if (id === "labs") {
        if (s.t === "box") {
          ribbons(id, grp, s.w, s.h, s.d, 2.4);
          for (var r2 = 0; r2 < 3; r2++) { var sw = new THREE.Mesh(new THREE.BoxGeometry(s.w + .2, .9, .12), roofM); sw.position.set(0, s.h + .85, -s.d / 2 + 1.2 + r2 * 2.3); sw.rotation.x = -.55; grp.add(sw); }
          var chm = zm(id, "chimney", 0xe9e4da);
          Cy(grp, .3, .38, 3.4, 10, chm, s.w / 2 - 1, s.h + 1.9, s.d / 2 - 1); Cy(grp, .32, .32, .4, 10, red, s.w / 2 - 1, s.h + 3.4, s.d / 2 - 1);
          if (si === 1) {
            var mast = Cy(grp, .08, .1, 5, 6, dark, -s.w / 2 + 1.2, s.h + 2.7, 0);
            var dish = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 3), white);
            dish.position.set(-s.w / 2 + 1.2, s.h + 4.2, 0); dish.rotation.x = Math.PI * .8; grp.add(dish);
          }
          if (si === 0) sign(id, grp, "LABORATÓRIOS", 6, .8, 0, 3.2, -s.d / 2 - .08, 0, "#f6f3ec", "#10324a");
          door(id, grp, 0, -s.d / 2 - .08, 0, 1.6);
        } else {
          // observatório/acelerador: cúpula com fenda e anel
          var dm = new THREE.Mesh(new THREE.SphereGeometry(s.r * .92, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), white);
          dm.position.y = s.h; grp.add(dm);
          var tel = Cy(grp, .45, .6, 2.6, 10, dark, 0, s.h + s.r * .75, -1.2); tel.rotation.x = -.7;
          var ring = new THREE.Mesh(new THREE.TorusGeometry(s.r + 1.6, .45, 8, 40), roofM); ring.rotation.x = Math.PI / 2; ring.position.y = .5; grp.add(ring);
          var gcy = zm(id, "glass", 0x2a4a5e, { roughness: .25, metalness: .3 }, "glass");
          [1.2, 3.0].forEach(function (yy) { if (yy < s.h - .3) Cy(grp, s.r + .06, s.r + .06, .7, 28, gcy, 0, yy, 0); });
        }
      } else if (id === "ru") {
        ribbons(id, grp, s.w, s.h, s.d, 2.2);
        var aw = B(grp, s.w - 2, .18, 2.4, roofM, 0, 2.75, -s.d / 2 - 1.1); aw.rotation.x = .18;
        [-1, 1].forEach(function (sd) { Cy(grp, .08, .08, 2.6, 6, white, sd * (s.w / 2 - 1.4), 1.3, -s.d / 2 - 2.1); });
        door(id, grp, 0, -s.d / 2 - .08, 0, 2.4);
        var um = zm(id, "umbrella", 0xf0e6d2), tm = zm(id, "table", 0xf6f3ec);
        [[s.w / 2 + 2.2, -1.8], [s.w / 2 + 2.2, 1.8], [-s.w / 2 - 2.2, -1.8], [-s.w / 2 - 2.2, 1.8]].forEach(function (q, i) {
          Cy(grp, .75, .75, .1, 14, tm, q[0], .8, q[1]); Cy(grp, .08, .08, .8, 6, dark, q[0], .4, q[1]);
          Cy(grp, .05, .05, 2.4, 6, dark, q[0], 1.6, q[1]);
          var ub = new THREE.Mesh(new THREE.ConeGeometry(1.4, .6, 8), i % 2 ? um : roofM); ub.position.set(q[0], 2.75, q[1]); grp.add(ub);
          [0, 1, 2].forEach(function (c) { var cq = polar(1.1, c * 120 + 30); Cy(grp, .22, .22, .5, 8, tm, q[0] + cq[0], .25, q[1] + cq[1]); });
        });
        Cy(grp, .45, .45, 2.4, 10, zm(id, "chimney", 0xc9c3b8), s.w / 2 - 1.5, s.h + 1.2, s.d / 2 - 1.3);
        sign(id, grp, "BANDEJÃO", 5, .9, 0, s.h - .4, -s.d / 2 - .26, 0, "#f6f3ec", "#a2442b");
      } else if (id === "admin") {
        ribbons(id, grp, s.w, s.h, s.d, 2);
        columns(id, grp, 4, 5.4, -s.d / 2 - 1.2, 3.6, .26);
        B(grp, 6.4, .45, 2.6, white, 0, 3.8, -s.d / 2 - 1.05);
        prism(grp, 6.4, 1.4, 2.6, roofM, 0, 4.02, -s.d / 2 - 1.05);
        door(id, grp, 0, -s.d / 2 - .08, 0, 1.6);
        var ck = reg(id, new THREE.MeshBasicMaterial({ map: clockTex(), transparent: true, opacity: 1 }));
        var cf = new THREE.Mesh(new THREE.CircleGeometry(1.1, 32), ck); cf.position.set(0, s.h + 1.2, -(s.d - 1) / 2 - .03); cf.rotation.y = Math.PI; grp.add(cf);
        var cf2 = cf.clone(); cf2.position.z = (s.d - 1) / 2 + .03; cf2.rotation.y = 0; grp.add(cf2);
        B(grp, 3, 2.8, s.d - 1, white, 0, s.h + 1.1, 0);
        prism(grp, 3.2, 1.2, s.d - .8, roofM, 0, s.h + 2.5, 0);
        Cy(grp, .07, .09, 8, 8, dark, s.w / 2 + 1.8, 4, -s.d / 2 - 1.5);
        var flag = B(grp, 1.8, 1.1, .05, zm(id, "flag", 0x2f8f5b), s.w / 2 + 2.75, 7.3, -s.d / 2 - 1.5);
        B(grp, .9, .55, .06, zm(id, "flag2", 0xf2c94c), s.w / 2 + 2.75, 7.3, -s.d / 2 - 1.55);
        sign(id, grp, "SECRETARIA", 4.8, .75, 0, 4.75, -s.d / 2 - 2.4, 0, "#f6f3ec", "#7a5a12");
      } else if (id === "apoio") {
        ribbons(id, grp, s.w, s.h, s.d, 1.9);
        door(id, grp, 0, -s.d / 2 - .08, 0, 1.6);
        if (si === 0) {
          var rp = B(grp, 1.4, .15, 4, path, s.w / 2 - 1.2, .45, -s.d / 2 - 2.1); rp.rotation.x = -.2;
          sign(id, grp, "APOIO AO ESTUDANTE", 6.4, .8, 0, s.h + .95, -s.d / 2 - .3, 0, "#f6f3ec", "#7a5a12");
          canopy(id, grp, 3, 0, 2.4, -s.d / 2 - .9, 1.6);
        } else { prism(grp, s.w + .4, 1.6, s.d + .4, roofM, 0, s.h + .5, 0); }
      } else if (id === "saude") {
        if (si === 0) {
          ribbons(id, grp, s.w, s.h, s.d, 1.9);
          // heliponto no terraço
          var hp = zm(id, "helipad", 0x3a454d, { roughness: .8 });
          Cy(grp, 3.3, 3.3, .2, 32, hp, 0, s.h + .65, 0);
          var ring2 = new THREE.Mesh(new THREE.TorusGeometry(2.7, .1, 4, 40), white); ring2.rotation.x = Math.PI / 2; ring2.position.y = s.h + .78; grp.add(ring2);
          B(grp, .35, .06, 2.2, white, -.6, s.h + .78, 0); B(grp, .35, .06, 2.2, white, .6, s.h + .78, 0); B(grp, 1.2, .06, .35, white, 0, s.h + .78, 0);
          // cruz vermelha na fachada e entrada de ambulância
          var cr = reg(id, new THREE.MeshBasicMaterial({ color: 0xd8483b, transparent: true, opacity: 1, side: THREE.DoubleSide }));
          var c1 = new THREE.Mesh(new THREE.PlaneGeometry(2.6, .8), cr), c2 = new THREE.Mesh(new THREE.PlaneGeometry(.8, 2.6), cr);
          [-1, 1].forEach(function (sd) { var g2 = new THREE.Group(); g2.add(c1.clone()); g2.add(c2.clone()); g2.position.set(sd * (s.w / 2 - 2.2), s.h - 2.2, -s.d / 2 - .1); grp.add(g2); var g3 = g2.clone(); g3.position.z = s.d / 2 + .1; grp.add(g3); });
          canopy(id, grp, 6, 0, 3, -s.d / 2 - 1.6, 3.2);
          var amb = new THREE.Group(); amb.position.set(-1.5, 0, -s.d / 2 - 4.2); amb.rotation.y = Math.PI / 2; grp.add(amb);
          B(amb, 3.6, 1.8, 1.8, white, 0, 1.15, 0); B(amb, 3.62, .3, 1.82, red, 0, 1.2, 0); B(amb, .5, .2, .5, red, -.6, 2.15, 0);
          [-1.1, 1.1].forEach(function (bx) { [-.85, .85].forEach(function (bz) { var t = Cy(amb, .35, .35, .2, 10, dark, bx, .35, bz); t.rotation.x = Math.PI / 2; }); });
          sign(id, grp, "HOSPITAL", 5, .9, 0, 3.75, -s.d / 2 - 3.2, 0, "#ffffff", "#c0392b");
          door(id, grp, 0, -s.d / 2 - .08, 0, 2.4);
        } else {
          ribbons(id, grp, s.w, s.h, s.d, 1.9);
          acUnits(id, grp, s.w, s.d, s.h, 3);
          B(grp, 2, 1.2, s.d + .6, zm(id, "glass", 0x2a4a5e, {}, "glass"), -s.w / 2 - 1, s.h * .6, 0);
        }
      } else if (id === "esporte") {
        var lm2 = zm(id, "lines", 0xffffff, { roughness: .6 });
        if (s.t === "dome") {
          for (var i = 0; i < 6; i++) { var rib = new THREE.Mesh(new THREE.TorusGeometry(s.r + .02, .14, 6, 30, Math.PI), white); rib.rotation.y = i * Math.PI / 6; rib.scale.y = s.h / s.r; grp.add(rib); }
          Cy(grp, s.r + .35, s.r + .45, 1, 40, white, 0, .5, 0);
          Cy(grp, 1, 1, .6, 16, white, 0, s.h + .3, 0);
          var ent = B(grp, 3.4, 2.6, 2.4, roofM, 0, 1.3, s.r - .3);
          door(id, ent, 0, 0, 0, 2).position.set(0, -.35, 1.25);
          sign(id, grp, "GINÁSIO", 3.6, .75, 0, 3.1, s.r + .92, 0, "#f6f3ec", "#3f6b4d");
        } else {
          var top2 = .32;
          [[s.w, .16, 0, s.d / 2 - .2], [s.w, .16, 0, -s.d / 2 + .2]].forEach(function (q) { B(grp, q[0] - .4, .04, q[1], lm2, q[2], top2, q[3]); });
          [-1, 1].forEach(function (sd) { B(grp, .16, .04, s.d - .4, lm2, sd * (s.w / 2 - .2), top2, 0); });
          B(grp, .14, .04, s.d - .4, lm2, 0, top2, 0);
          var cc = new THREE.Mesh(new THREE.RingGeometry(1.1, 1.26, 32), lm2); cc.rotation.x = -Math.PI / 2; cc.position.y = top2 + .03; grp.add(cc);
          if (si === 1) {
            [-1, 1].forEach(function (sd) { var gx = sd * (s.w / 2 - .4); Cy(grp, .08, .08, 1.6, 6, lm2, gx, 1.1, -1.3); Cy(grp, .08, .08, 1.6, 6, lm2, gx, 1.1, 1.3); B(grp, .12, .12, 2.7, lm2, gx, 1.9, 0); });
            [-1, 1].forEach(function (sd) { lamp(id, grp, sd * (s.w / 2 + .8), s.d / 2 + .8, 5); lamp(id, grp, sd * (s.w / 2 + .8), -s.d / 2 - .8, 5); });
          } else {
            [-1, 1].forEach(function (sd) { var gx = sd * (s.w / 2 + .3); Cy(grp, .1, .1, 3.2, 6, dark, gx, 1.6, 0); B(grp, .1, 1, 1.6, white, gx - sd * .3, 3.1, 0); var hoop = new THREE.Mesh(new THREE.TorusGeometry(.35, .05, 6, 16), red); hoop.rotation.x = Math.PI / 2; hoop.position.set(gx - sd * .75, 2.8, 0); grp.add(hoop); });
          }
          var stands = zm(id, "stands", 0xd8d2c4);
          for (var k2 = 0; k2 < 3; k2++) B(grp, s.w - 1, .4, .8, stands, 0, .2 + k2 * .4, s.d / 2 + .8 + k2 * .8);
        }
      } else if (id === "moradia") {
        var gm2 = zm(id, "glass", 0x2a4a5e, { roughness: .25, metalness: .3 }, "glass");
        var floors = Math.max(1, Math.floor(s.h / 1.5));
        for (var f2 = 0; f2 < floors; f2++) {
          var wy = 1 + f2 * 1.5;
          [-1.6, 0, 1.6].forEach(function (wx) { if (f2 === 0 && wx === 0) return; B(grp, .9, .8, s.d + .1, gm2, wx, wy, 0); B(grp, 1.1, .1, s.d + .25, white, wx, wy - .45, 0); });
          B(grp, s.w + .1, .8, 1, gm2, 0, wy, 0);
        }
        door(id, grp, 0, -s.d / 2 - .08, 0, 1);
        B(grp, .7, 1.8, .7, zm(id, "brick", 0xa45a3c), s.w / 2 - 1.2, s.h + 1.6, 1);
        bench(id, grp, s.w / 2 + 1.4, -1, Math.PI / 2);
        var bike = zm(id, "bike", 0x2f8f5b, { roughness: .5 });
        [0, 1].forEach(function (b) { var w1 = new THREE.Mesh(new THREE.TorusGeometry(.35, .05, 6, 14), dark); w1.position.set(-s.w / 2 - .8, .4, -1 + b * 1.4); w1.rotation.y = Math.PI / 2; grp.add(w1); var w2 = w1.clone(); w2.position.z += .9; grp.add(w2); B(grp, .06, .06, .9, bike, -s.w / 2 - .8, .7, -.55 + b * 1.4); });
      } else if (id === "terminal") {
        if (s.t === "shelter") {
          var gs = zm(id, "glass", 0x2a4a5e, { roughness: .25, metalness: .3, opacity: .75 }, "glass");
          B(grp, 5.6, 1.8, .08, gs, 0, 1.4, -1.15);
          bench(id, grp, -1.2, -.6, 0); bench(id, grp, 1.2, -.6, 0);
          B(grp, 1, 1.8, .15, white, 3.6, 1.2, -.8);
          sign(id, grp, "PONTO DE ÔNIBUS", 5.4, .6, 0, 3.4, 1.32, 0, "#10324a", "#ffffff");
          B(grp, 14, .25, 1.1, path, 4, .12, 1.8);
        } else {
          grp.remove(grp.children[0]);
          busModel(id, grp, 0, 0, "330 UNICAMP");
          var bus2 = busModel(id, grp, -15, -.3, "CIRCULAR"); bus2.scale.set(.8, .9, .95);
          Cy(grp, .08, .08, 3, 6, dark, -6.5, 1.5, -2); B(grp, 1, 1, .1, roofM, -6.5, 3.2, -2);
        }
      } else if (id === "portaria") {
        var gm3 = zm(id, "glass", 0x2a4a5e, { roughness: .25, metalness: .3 }, "glass");
        B(grp, 3.12, 1, 3.12, gm3, 5, 2.3, 0);
        B(grp, 4.2, .3, 4.2, roofM, 5, 3.65, 0);
        for (var sx = 0; sx < 6; sx++) B(grp, .6, .36, .36, sx % 2 ? white : red, 3.2 - sx * 1.15, 1.95, 0);
        Cy(grp, .3, .3, 1.8, 10, dark, 3.6, .9, 0);
        // pórtico de entrada com o nome do campus
        var pil = zm(id, "stone", 0xe6dfd0);
        B(grp, 1.4, 7, 1.4, pil, -8.2, 3.5, 2.8); B(grp, 1.4, 7, 1.4, pil, 8.2, 3.5, 2.8);
        B(grp, 18, 1.4, 1.2, roofM, 0, 7.3, 2.8);
        sign(id, grp, "CAMPUS UNIVERSITÁRIO", 14, 1, 0, 7.3, 3.42, 0, "#10324a", "#f6e7c4");
        lamp(id, grp, -10, 1, 4); lamp(id, grp, 10, 1, 4);
      } else if (id === "estacionamento") {
        var COLORS = [0xc0392b, 0x2e6da4, 0xf3f1ec, 0x8c959c, 0xe2b13c, 0x2f8f5b, 0x34495e];
        for (var c3 = 0; c3 < 7; c3++) {
          var cx = -7.2 + c3 * 2.4;
          B(grp, .12, .03, 3.8, white, cx - 1.2, .22, 2.6); B(grp, .12, .03, 3.8, white, cx - 1.2, .22, -2.6);
          if (c3 !== 2) car(id, grp, cx, 2.6, 0, COLORS[c3], c3);
          if (c3 !== 5) car(id, grp, cx, -2.6, Math.PI, COLORS[(c3 + 3) % 7], (c3 + 3) % 7);
        }
        B(grp, .12, .03, 3.8, white, 9.6 - 1.2, .22, 2.6); B(grp, .12, .03, 3.8, white, 9.6 - 1.2, .22, -2.6);
        lamp(id, grp, -9.6, 0, 5); lamp(id, grp, 9.6, 0, 5);
        var bk = zm(id, "bike", 0x2f8f5b, { roughness: .5 });
        for (var b2 = 0; b2 < 4; b2++) { var bz2 = -1.4 + b2 * .9; var w3 = new THREE.Mesh(new THREE.TorusGeometry(.35, .05, 6, 14), dark); w3.position.set(10.6, .4, bz2); w3.rotation.y = Math.PI / 2; grp.add(w3); var w4 = w3.clone(); w4.position.x += .9; grp.add(w4); B(grp, .9, .06, .06, bk, 11.05, .7, bz2); }
        sign(id, grp, "P", .9, .9, -9.6, 3.6, .2, 0, "#2e6da4", "#ffffff");
      } else if (id === "convivencia") {
        ribbons(id, grp, s.w, s.h, s.d, 1.9);
        ["#d8483b", "#f2c94c", "#2f8f5b", "#2e6da4"].forEach(function (c, i) { var bn = reg(id, new THREE.MeshStandardMaterial({ color: c, transparent: true, opacity: 1, side: THREE.DoubleSide })); var pl = new THREE.Mesh(new THREE.PlaneGeometry(.8, 2.4), bn); pl.position.set(-s.w / 2 + 1.2 + i * 1.1, 2.1, -s.d / 2 - .12); grp.add(pl); });
        sign(id, grp, "DCE", 2.4, .9, 2.1, s.h + .85, -s.d / 2 - .3, 0, "#d8483b", "#ffffff");
        var stage = B(grp, 4.4, .5, 2.4, zm(id, "wood", 0x9b7350), s.w / 2 + 3, .25, 0);
        B(grp, 4.4, .15, 2.4, roofM, s.w / 2 + 3, 3, 0);
        [-1, 1].forEach(function (sd) { Cy(grp, .08, .08, 2.6, 6, dark, s.w / 2 + 3 + sd * 2, 1.6, -1.1); Cy(grp, .08, .08, 2.6, 6, dark, s.w / 2 + 3 + sd * 2, 1.6, 1.1); });
        bench(id, grp, -1.5, -s.d / 2 - 2.2, Math.PI); bench(id, grp, 1.5, -s.d / 2 - 2.2, Math.PI);
      } else if (id === "verde") {
        var wood = zm(id, "wood", 0x9b7350), lily = zm(id, "lily", 0x5f9e5b), duck = zm(id, "duck", 0xffffff), reed = zm(id, "reed", 0x7a9a4e);
        B(grp, 1.6, .25, 5.5, wood, s.r - 1, .45, 0).rotation.y = Math.PI / 2;
        for (var pp = 0; pp < 3; pp++) Cy(grp, .1, .1, .8, 6, wood, s.r - 3 + pp * 1.4, .2, .75);
        for (var l = 0; l < 9; l++) { var lq = polar(2 + (l * 1.7) % 5, l * 83); Cy(grp, .55, .55, .05, 12, lily, lq[0], .43, lq[1]); }
        [[-2, 1.5], [-3, 1.2], [1.5, -3]].forEach(function (q) { var d = new THREE.Mesh(new THREE.SphereGeometry(.28, 8, 6), duck); d.position.set(q[0], .55, q[1]); grp.add(d); var hd = new THREE.Mesh(new THREE.SphereGeometry(.16, 8, 6), duck); hd.position.set(q[0] + .25, .82, q[1]); grp.add(hd); });
        for (var rr = 0; rr < 16; rr++) { var rq = polar(s.r * 1.08, 200 + rr * 9); var rd = new THREE.Mesh(new THREE.ConeGeometry(.12, 1.4 + (rr % 3) * .3, 4), reed); rd.position.set(rq[0], .7, rq[1]); grp.add(rd); }
        [40, 110].forEach(function (a) { var q = polar(s.r + 2, a); bench(id, grp, q[0], q[1], -a * Math.PI / 180 - Math.PI / 2); });
        tree(grp, s.r + 3, -4, "ipe-y", 1.1); tree(grp, -s.r - 2.5, 3, "ipe-r", 1);
      }
    }

    // árvores: pinheiros, copas redondas e ipês (rosa e amarelo, marca de Campinas)
    var TK = ["cone", "round", "round", "ipe-r", "cone", "round", "ipe-y"];
    for (var t = 0; t < 52; t++) {
      var ang = t * 137.5, rad = 12 + (t * 7.3 % 50);
      if (rad > 20 && rad < 25) rad += 6; if (rad > 40 && rad < 45) rad += 6;
      var p = polar(rad, ang);
      tree(world, p[0], p[1], TK[t % TK.length], .85 + (t % 3) * .15);
    }
    // Áreas clicáveis
    var pickables = [], zoneMeshes = {}, zoneTop = {};
    ZONES.forEach(function (z, zi) {
      var key = "z-" + z.id, m = mat(key, 0xffffff, { transparent: true, opacity: 1 });
      var roofM = mat(key + "-roof", 0xffffff, { transparent: true, opacity: 1 });
      reg(z.id, m); reg(z.id, roofM);
      zoneMeshes[z.id] = [];
      var top = new THREE.Vector3(), n = 0, maxH = 0;
      z.shapes.forEach(function (s, si) {
        var g, mesh, h = s.h || 1, y = h / 2, grp = new THREE.Group();
        if (s.t === "box") { mesh = new THREE.Mesh(new THREE.BoxGeometry(s.w, h, s.d), m); var roof = new THREE.Mesh(new THREE.BoxGeometry(s.w + .4, .5, s.d + .4), roofM); roof.position.y = h / 2 + .25; mesh.add(roof); roof.userData.zone = z.id; pickables.push(roof); zoneMeshes[z.id].push(roof); }
        else if (s.t === "cyl") { mesh = new THREE.Mesh(new THREE.CylinderGeometry(s.r, s.r, h, 24), m); }
        else if (s.t === "dome") { mesh = new THREE.Mesh(new THREE.SphereGeometry(s.r, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), m); y = 0; h = s.r; mesh.scale.y = s.h / s.r; }
        else if (s.t === "disc") { mesh = new THREE.Mesh(new THREE.CylinderGeometry(s.r, s.r, h, 40), m); }
        else if (s.t === "water") { mesh = new THREE.Mesh(new THREE.CylinderGeometry(s.r, s.r * 1.1, .4, 40), m); h = .4; y = .2; }
        else if (s.t === "court") { mesh = new THREE.Mesh(new THREE.BoxGeometry(s.w, .3, s.d), m); h = .3; y = .15; }
        else if (s.t === "parking") {
          mesh = new THREE.Mesh(new THREE.BoxGeometry(s.w, .2, s.d), m); h = .2; y = .1;
        }
        else if (s.t === "house") {
          mesh = new THREE.Mesh(new THREE.BoxGeometry(s.w, h, s.d), m);
          var rf = new THREE.Mesh(new THREE.ConeGeometry(Math.max(s.w, s.d) * .72, 2.2, 4), roofM); rf.position.y = h / 2 + 1.1; rf.rotation.y = Math.PI / 4; rf.userData.zone = z.id; mesh.add(rf); pickables.push(rf); zoneMeshes[z.id].push(rf); h += 2.2;
        }
        else if (s.t === "shelter") {
          mesh = new THREE.Mesh(new THREE.BoxGeometry(6, .4, 2.6), m); y = 2.8; h = 3;
          var post = new THREE.Mesh(new THREE.BoxGeometry(.3, 2.8, .3), roofM); post.position.set(-2.6, -1.4, 0); mesh.add(post);
          var post2 = post.clone(); post2.position.x = 2.6; mesh.add(post2);
        }
        else if (s.t === "bus") { mesh = new THREE.Mesh(new THREE.BoxGeometry(9, 3, 2.8), roofM); h = 3; y = 1.6; }
        else if (s.t === "gate") {
          mesh = new THREE.Mesh(new THREE.BoxGeometry(3, 3.5, 3), m); h = 3.5; mesh.position.x = 5;
          var bar = new THREE.Mesh(new THREE.BoxGeometry(7, .3, .3), roofM); bar.position.set(-4.5, .2, 0); mesh.add(bar); bar.userData.zone = z.id; pickables.push(bar);
        }
        else if (s.t === "cross") {
          mesh = new THREE.Group(); y = 0; h = 0;
        }
        if (s.t !== "gate") mesh.position.set(0, 0, 0);
        grp.add(mesh); mesh.position.y = y;
        if (s.t === "gate") mesh.position.y = y;
        grp.position.set(s.x, 0, s.z);
        if (s.ry) grp.rotation.y = s.ry * Math.PI / 180 + Math.PI / 2;
        addDetails(z, s, si, grp, h);
        grp.traverse(function (o) { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; if (!o.userData.zone) { o.userData.zone = z.id; pickables.push(o); zoneMeshes[z.id].push(o); } } });
        world.add(grp);
        top.x += s.x; top.z += s.z; n++; maxH = Math.max(maxH, (s.h || 1) + (s.t === "house" ? 2.2 : 0) + (s.t === "cross" ? 2 : 0));
      });
      top.x /= n; top.z /= n; top.y = maxH + 2.5;
      zoneTop[z.id] = top;
    });

    // Marcadores numerados (HTML)
    var pinsBox = $("c3dPins"), pins = {};
    ZONES.forEach(function (z, i) {
      var pin = el("button", { type: "button", class: "c3d-pin zc-" + z.cat, "data-id": z.id, tabindex: "-1" }, [el("span", { class: "pn", text: String(i + 1) }), el("span", { class: "pl", text: z.s })]);
      pin.addEventListener("click", function (e) { e.stopPropagation(); selectZone(z.id, true); });
      pinsBox.appendChild(pin); pins[z.id] = pin;
    });

    // Cores conforme o tema
    function hexOf(v) { return new THREE.Color(v.indexOf("color-mix") >= 0 ? "#888888" : v); }
    function paint() {
      var dark = isDark();
      mats.ground.color.set(dark ? "#0d3a52" : "#e9e4d8");
      mats.road.color.set(dark ? "#1d4d66" : "#d2cabb");
      mats.tree.color.set(dark ? "#4f8a6a" : "#8fb88a");
      mats.trunk.color.set(dark ? "#5a4636" : "#9b7a58");
      mats.car.color.set(dark ? "#6c8696" : "#b8c2ca");
      mats.tree2.color.set(dark ? "#3f7a5a" : "#7fae72");
      mats.ipeR.color.set(dark ? "#b45c88" : "#e08ab2");
      mats.ipeY.color.set(dark ? "#c9a43a" : "#f2c94c");
      Object.keys(zmats).forEach(function (k) { zmats[k].forEach(function (m) {
        if (m.userData.kind === "glass") { m.color.set(dark ? "#1d3445" : "#7fa3b8"); m.emissive.set(dark ? "#ffc874" : "#000000"); m.emissiveIntensity = dark ? .32 : 0; }
        else if (m.userData.kind === "lamp") { m.emissiveIntensity = dark ? 1.1 : .15; }
      }); });
      hemi.intensity = dark ? .6 : .85; sun.intensity = dark ? .7 : .9;
      hemi.groundColor.set(dark ? "#001520" : "#b9b2a4");
      ZONES.forEach(function (z) {
        var c = hexOf(cssColor(ZCOLOR[z.cat]));
        var base = c.clone().lerp(new THREE.Color(dark ? "#0f3247" : "#ffffff"), z.id === curSel ? 0 : .45);
        if (z.id === "verde") base = new THREE.Color(dark ? "#2e6f8f" : "#8ec3dc");
        if (z.id === "praca") base = new THREE.Color(dark ? "#3a6a54" : "#b9d4ac");
        mats["z-" + z.id].color.copy(base);
        mats["z-" + z.id + "-roof"].color.copy(c);
        mats["z-" + z.id].emissive = new THREE.Color(z.id === curHover ? (dark ? "#223344" : "#222222") : "#000000");
      });
    }
    var curSel = null, curHover = null;

    // Órbita da câmera
    var cam = { az: -0.6, pol: 0.95, dist: 125, tx: 0, tz: 4 }, goal = Object.assign({}, cam), spin = false;
    var DEF = Object.assign({}, cam);
    function placeCam() {
      camera.position.set(cam.tx + cam.dist * Math.sin(cam.pol) * Math.sin(cam.az), cam.dist * Math.cos(cam.pol), cam.tz + cam.dist * Math.sin(cam.pol) * Math.cos(cam.az));
      camera.lookAt(cam.tx, 0, cam.tz);
    }
    function setGoal(o) { Object.assign(goal, o); goal.pol = clamp(goal.pol, .35, 1.25); goal.dist = clamp(goal.dist, 45, 170); kick(); }
    var drag = null, moved = false, pointers = {};
    canvas.addEventListener("pointerdown", function (e) {
      $("c3dHint").classList.add("gone");
      pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
      drag = { x: e.clientX, y: e.clientY, az: goal.az, pol: goal.pol }; moved = false;
      spin = false; $("c3dSpin").setAttribute("aria-pressed", "false");
    });
    window.addEventListener("pointermove", function (e) {
      if (pointers[e.pointerId]) {
        var ids = Object.keys(pointers);
        if (ids.length === 2) {
          var o = ids.map(function (k) { return pointers[k]; });
          var before = Math.hypot(o[0].x - o[1].x, o[0].y - o[1].y);
          pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
          o = ids.map(function (k) { return pointers[k]; });
          var after = Math.hypot(o[0].x - o[1].x, o[0].y - o[1].y);
          if (before) setGoal({ dist: goal.dist * before / after }); moved = true; return;
        }
        pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
      }
      if (drag) {
        var dx = e.clientX - drag.x, dy = e.clientY - drag.y;
        if (Math.abs(dx) + Math.abs(dy) > 4) moved = true;
        if (moved) { setGoal({ az: drag.az - dx * .008, pol: drag.pol - dy * .005 }); stage.classList.add("dragging"); }
      } else hover(e);
    });
    function endPtr(e) { delete pointers[e.pointerId]; if (!Object.keys(pointers).length) { drag = null; stage.classList.remove("dragging"); } }
    window.addEventListener("pointerup", endPtr); window.addEventListener("pointercancel", endPtr);
    canvas.addEventListener("click", function (e) {
      if (moved) return;
      var hit = raycast(e);
      if (hit) selectZone(hit, true);
    });
    canvas.addEventListener("wheel", function (e) {
      if (!$("c3dCard").classList.contains("expanded") && !e.ctrlKey) return;
      e.preventDefault(); setGoal({ dist: goal.dist * (e.deltaY > 0 ? 1.1 : .9) });
    }, { passive: false });
    var ray = new THREE.Raycaster(), mouse = new THREE.Vector2();
    function raycast(e) {
      var r = canvas.getBoundingClientRect();
      mouse.x = (e.clientX - r.left) / r.width * 2 - 1; mouse.y = -(e.clientY - r.top) / r.height * 2 + 1;
      ray.setFromCamera(mouse, camera);
      var hits = ray.intersectObjects(pickables, false).filter(function (h) { return h.object.material.opacity > .5; });
      return hits.length ? hits[0].object.userData.zone : null;
    }
    function hover(e) {
      if (e.target !== canvas) { if (curHover) { curHover = null; paint(); kick(); } return; }
      var id = raycast(e);
      canvas.style.cursor = id ? "pointer" : "grab";
      if (id !== curHover) { curHover = id; paint(); Object.keys(pins).forEach(function (k) { pins[k].classList.toggle("hover", k === id); }); kick(); }
    }
    $("c3dIn").addEventListener("click", function () { setGoal({ dist: goal.dist * .8 }); });
    $("c3dOut").addEventListener("click", function () { setGoal({ dist: goal.dist * 1.25 }); });
    $("c3dLeft").addEventListener("click", function () { setGoal({ az: goal.az + Math.PI / 4 }); });
    $("c3dReset").addEventListener("click", function () { setGoal(Object.assign({}, DEF)); });
    $("c3dSpin").addEventListener("click", function () { spin = !spin; this.setAttribute("aria-pressed", String(spin)); kick(); });
    $("c3dFull").addEventListener("click", function () { setFull(!$("c3dCard").classList.contains("expanded")); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && $("c3dCard").classList.contains("expanded")) setFull(false); });
    function setFull(on) {
      $("c3dCard").classList.toggle("expanded", on);
      $("c3dFull").setAttribute("aria-pressed", String(on));
      $("c3dFull").setAttribute("aria-label", on ? "Fechar visão ampliada" : "Ampliar");
      document.body.classList.toggle("map-open", on);
      setTimeout(resize, 30);
    }

    function resize() {
      var r = stage.getBoundingClientRect();
      if (!r.width) return;
      renderer.setSize(r.width, r.height, false);
      camera.aspect = r.width / r.height; camera.updateProjectionMatrix(); kick();
    }
    if (window.ResizeObserver) new ResizeObserver(resize).observe(stage); else window.addEventListener("resize", resize);

    var running = false, vec = new THREE.Vector3(), lastT = 0, pulse = 0;
    function visible() { return currentView === "campus" && !document.hidden; }
    function kick() { if (!running && visible()) { running = true; lastT = performance.now(); requestAnimationFrame(frame); } }
    function frame(now) {
      if (!visible()) { running = false; return; }
      var dt = Math.min(.05, (now - lastT) / 1000); lastT = now;
      if (spin && !reduceMotion) goal.az += dt * .25;
      var k = reduceMotion ? 1 : 1 - Math.pow(.0015, dt);
      var moving = false;
      ["az", "pol", "dist", "tx", "tz"].forEach(function (p) { var d = goal[p] - cam[p]; if (Math.abs(d) > .0005) { cam[p] += d * k; moving = true; } else cam[p] = goal[p]; });
      placeCam();
      renderer.render(scene, camera);
      // Marcadores
      var r = canvas.getBoundingClientRect();
      ZONES.forEach(function (z) {
        vec.copy(zoneTop[z.id]).project(camera);
        var pin = pins[z.id], x = (vec.x + 1) / 2 * r.width, y = (1 - vec.y) / 2 * r.height;
        var hide = vec.z > 1 || x < -20 || x > r.width + 20 || y < -20 || y > r.height + 20;
        pin.style.transform = "translate(" + x.toFixed(1) + "px," + y.toFixed(1) + "px)";
        pin.classList.toggle("off", hide);
      });
      if (moving || spin) requestAnimationFrame(frame); else running = false;
    }
    C3.focus = function (id, user) {
      curSel = id; paint();
      Object.keys(pins).forEach(function (k) { pins[k].classList.toggle("sel", k === id); });
      if (user) { var t = zoneTop[id]; setGoal({ tx: t.x * .9, tz: t.z * .9, dist: Math.min(goal.dist, 92) }); }
      kick();
    };
    C3.filter = function (cat) {
      ZONES.forEach(function (z) {
        var on = cat === "todos" || z.cat === cat;
        (zmats[z.id] || []).forEach(function (m) { m.opacity = on ? m.userData.op : .14; m.depthWrite = on; });
        pins[z.id].classList.toggle("dim", !on);
      });
      kick();
    };
    C3.kick = function () { resize(); kick(); };
    C3.repaint = function () { paint(); kick(); };
    C3.ready = true;
    paint(); resize(); placeCam();
    if (curZone) C3.focus(curZone.id, false);
  }

  var WEEK = [
    "Retirar a carteirinha e anotar o número de matrícula (na Unicamp, o RA)",
    "Ativar o e-mail institucional e o Wi-Fi do campus",
    "Entrar no sistema acadêmico e conferir a grade",
    "Descobrir onde ficam as salas das primeiras aulas",
    "Fazer o cadastro na biblioteca",
    "Ver o cardápio e o preço do restaurante universitário",
    "Conhecer a assistência estudantil e os editais de auxílio",
    "Pedir o passe escolar, se usar ônibus",
    "Salvar o telefone da segurança e do serviço de saúde do campus",
    "Conhecer o DCE e o centro acadêmico do seu curso"
  ];
  function renderWeek() {
    var ul = $("weekList"); clear(ul);
    WEEK.forEach(function (t, i) {
      var cb = el("input", { type: "checkbox", id: "wk" + i });
      cb.checked = !!state.campusWeek[i];
      cb.addEventListener("change", function () {
        if (cb.checked) state.campusWeek[i] = true; else delete state.campusWeek[i];
        save(); updWeek();
        if (cb.checked && Object.keys(state.campusWeek).length === WEEK.length) { confetti(); toast("Primeira semana resolvida. Bem-vindo ao campus!"); }
      });
      ul.appendChild(el("li", null, [el("label", { for: "wk" + i }, [cb, el("span", { text: t })])]));
    });
    updWeek(); renderFavs();
  }
  function updWeek() {
    var n = Object.keys(state.campusWeek).length, C = 2 * Math.PI * 36, ring = $("weekRing");
    ring.style.strokeDasharray = C.toFixed(2);
    ring.style.strokeDashoffset = (C * (1 - n / WEEK.length)).toFixed(2);
    $("weekPct").textContent = Math.round(n / WEEK.length * 100) + "%";
    $("weekCount").textContent = n + " de " + WEEK.length;
  }

  /* ---------- Agenda ---------- */
  var filtro = "pend";
  document.querySelectorAll(".seg button").forEach(function (b) {
    b.addEventListener("click", function () {
      filtro = b.dataset.f;
      document.querySelectorAll(".seg button").forEach(function (x) { x.setAttribute("aria-pressed", String(x === b)); });
      renderAtiv();
    });
  });
  function renderAtiv() {
    var ul = $("ativList"); clear(ul);
    var list = state.ativ.filter(function (a) { return filtro === "all" || (filtro === "done" ? a.done : !a.done); })
      .sort(function (a, b) { return a.data < b.data ? -1 : 1; });
    if (!list.length) ul.appendChild(el("li", { class: "empty", text: filtro === "done" ? "Nenhuma atividade concluída ainda." : "Nenhuma atividade aqui. Adicione uma acima." }));
    list.forEach(function (a) {
      var d = daysUntil(a.data);
      var cb = el("input", { type: "checkbox", id: "at" + a.id, "aria-label": "Concluir: " + a.tit });
      cb.checked = a.done;
      cb.addEventListener("change", function () { a.done = cb.checked; save(); renderAtiv(); toast(a.done ? "Atividade concluída." : "Atividade reaberta."); });
      var del = el("button", { class: "btn del", type: "button", "aria-label": "Excluir " + a.tit, text: "Excluir" });
      del.addEventListener("click", function () { state.ativ = state.ativ.filter(function (y) { return y.id !== a.id; }); save(); renderAtiv(); updateSampleBar(); toast("Atividade excluída."); });
      var when = fmtLong.format(parseD(a.data)) + " · " + (a.done ? "concluída" : d < 0 ? "atrasada, " + rel(d) : rel(d));
      ul.appendChild(el("li", { class: a.done ? "done" : "" }, [
        cb,
        el("div", null, [
          el("div", { class: "t" }, [a.tit + " ", exTag(a)]),
          el("div", { class: "d" }, [el("span", { class: !a.done && d < 0 ? "neg" : "", text: when }), " · " + a.tipo])
        ]),
        del
      ]));
    });
  }
  $("ativForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var tit = str($("aTit").value, 70), data = $("aData").value, err = "";
    $("aTit").removeAttribute("aria-invalid");
    if (!tit) { err = "Descreva a atividade."; $("aTit").setAttribute("aria-invalid", "true"); }
    else if (!okDate(data)) err = "Escolha a data da atividade.";
    else if (state.ativ.length >= LIMITS.ativ) err = "Limite de atividades atingido. Exclua as concluídas.";
    $("aErr").textContent = err;
    if (err) return;
    var tipo = TIPOS_ATIV.indexOf($("aTipo").value) >= 0 ? $("aTipo").value : "Entrega";
    state.ativ.push({ id: uid(), tit: tit, tipo: tipo, data: data, done: false, ex: false });
    save(); renderAtiv();
    $("aTit").value = ""; $("aData").value = "";
    toast("Atividade adicionada.");
  });

  /* ---------- Calendário Unicamp 2027 (Comvest) ----------
     Conferido em 20/10/2026: edital Comvest (via Estratégia Vestibulares) e Vestibulando Web. */
  var UNICAMP = [
    { a: "2026-05-11", b: "2026-06-05", t: "Pedidos de isenção da taxa" },
    { a: "2026-07-31", b: "2026-07-31", t: "Resultado dos pedidos de isenção" },
    { a: "2026-08-03", b: "2026-08-31", t: "Inscrições" },
    { a: "2026-10-18", b: "2026-10-18", t: "Provas da 1ª fase" },
    { a: "2026-10-21", b: "2026-10-21", t: "Gabarito da 1ª fase" },
    { a: "2026-11-23", b: "2026-11-23", t: "Lista de convocados para a 2ª fase" },
    { a: "2026-11-29", b: "2026-11-30", t: "Provas da 2ª fase" },
    { a: "2026-12-02", b: "2026-12-04", t: "Provas de habilidades específicas" },
    { a: "2027-01-25", b: "2027-01-25", t: "Resultado da 1ª chamada" },
    { a: "2027-01-26", b: "2027-01-27", t: "Matrícula da 1ª chamada" }
  ];
  function calWhen(e) {
    var a = parseD(e.a), b = parseD(e.b);
    if (e.a === e.b) return fmtDay.format(a);
    return String(a.getDate()).padStart(2, "0") + (a.getMonth() === b.getMonth() ? "" : "/" + String(a.getMonth() + 1).padStart(2, "0")) + "–" + fmtDay.format(b);
  }
  function renderCal(id, limit) {
    var ol = $(id); clear(ol);
    var list = UNICAMP, firstNext = -1;
    list.forEach(function (e, i) { if (firstNext < 0 && daysUntil(e.b) >= 0) firstNext = i; });
    if (limit) { var st = firstNext < 0 ? list.length - limit : firstNext; list = list.slice(st, st + limit); }
    list.forEach(function (e) {
      var da = daysUntil(e.a), db = daysUntil(e.b), tag;
      if (db < 0) tag = el("span", { class: "tag", text: "concluído" });
      else if (da <= 0) tag = el("span", { class: "tag ok", text: "acontecendo" });
      else tag = el("span", { class: "tag " + (da <= 7 ? "warn" : "tone"), text: rel(da) });
      var isNext = UNICAMP.indexOf(e) === firstNext;
      ol.appendChild(el("li", { class: db < 0 ? "past" : isNext ? "next" : "" }, [el("span", { class: "when", text: calWhen(e) }), el("span", { class: "what", text: e.t }), tag]));
    });
  }


  /* ---------- Calendário ao vivo ----------
     Feriados conferidos em 20/10/2026: decreto municipal de Campinas de 2026 (municipais: Paixão de Cristo,
     Corpus Christi, Dia do Evangélico em 12/08 e N. Sra. da Conceição em 08/12). O aniversário da cidade (14/07) não é feriado. */
  var FERIADOS = [
    ["2026-01-01", "Confraternização Universal"], ["2026-02-16", "Carnaval (ponto facultativo)"], ["2026-02-17", "Carnaval (ponto facultativo)"],
    ["2026-04-03", "Sexta-feira Santa"], ["2026-04-21", "Tiradentes"], ["2026-05-01", "Dia do Trabalho"], ["2026-06-04", "Corpus Christi"],
    ["2026-07-09", "Revolução Constitucionalista (SP)"], ["2026-08-12", "Dia do Evangélico (Campinas)"], ["2026-09-07", "Independência do Brasil"],
    ["2026-10-12", "Nossa Senhora Aparecida"], ["2026-11-02", "Finados"], ["2026-11-15", "Proclamação da República"],
    ["2026-11-20", "Dia da Consciência Negra"], ["2026-12-08", "Nossa Senhora da Conceição (Campinas)"], ["2026-12-25", "Natal"],
    ["2027-01-01", "Confraternização Universal"], ["2027-02-08", "Carnaval (ponto facultativo)"], ["2027-02-09", "Carnaval (ponto facultativo)"],
    ["2027-03-26", "Sexta-feira Santa"], ["2027-04-21", "Tiradentes"], ["2027-05-01", "Dia do Trabalho"], ["2027-05-27", "Corpus Christi"],
    ["2027-07-09", "Revolução Constitucionalista (SP)"], ["2027-08-12", "Dia do Evangélico (Campinas)"], ["2027-09-07", "Independência do Brasil"],
    ["2027-10-12", "Nossa Senhora Aparecida"], ["2027-11-02", "Finados"], ["2027-11-15", "Proclamação da República"],
    ["2027-11-20", "Dia da Consciência Negra"], ["2027-12-08", "Nossa Senhora da Conceição (Campinas)"], ["2027-12-25", "Natal"]
  ];
  var OFICIAIS = [
    { d: "2026-11-08", t: "ENEM 2026 · 1º dia", h: 13, m: 30 },
    { d: "2026-11-15", t: "ENEM 2026 · 2º dia", h: 13, m: 30 }
  ];
  function rangeDays(a, b) {
    var out = [], d = parseD(a), end = parseD(b);
    while (d <= end) { out.push(iso(d)); d.setDate(d.getDate() + 1); }
    return out;
  }
  function eventsByDay() {
    var map = {};
    function add(day, ev) { (map[day] = map[day] || []).push(ev); }
    FERIADOS.forEach(function (f) { add(f[0], { k: "feriado", t: f[1] }); });
    OFICIAIS.forEach(function (o) { add(o.d, { k: "oficial", t: o.t }); });
    UNICAMP.forEach(function (u) { rangeDays(u.a, u.b).forEach(function (d) { add(d, { k: "oficial", t: "Unicamp: " + u.t }); }); });
    state.provas.forEach(function (p) { add(p.data, { k: "prova", t: p.tipo + ": " + p.disc, sub: p.cont, id: p.id }); });
    state.ativ.forEach(function (a) { add(a.data, { k: "ativ", t: a.tit, sub: a.tipo, done: a.done, id: a.id }); });
    var order = { prova: 0, oficial: 1, ativ: 2, feriado: 3 };
    Object.keys(map).forEach(function (k) { map[k].sort(function (x, y) { return order[x.k] - order[y.k]; }); });
    return map;
  }
  var calYM = { y: today.getFullYear(), m: today.getMonth() };
  var miniYM = { y: today.getFullYear(), m: today.getMonth() };
  var selDay = iso(today);
  var WD = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
  var fmtMonthOnly = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" });
  var fmtFull = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  var KCOLOR = { prova: "var(--terra)", ativ: "var(--mustard)", oficial: "var(--blue)", feriado: "var(--sage)" };
  var KNAME = { prova: "Prova", ativ: "Atividade", oficial: "Data oficial", feriado: "Feriado" };

  function buildMonth(grid, ym, mini) {
    clear(grid);
    var map = eventsByDay();
    WD.forEach(function (w) { grid.appendChild(el("span", { class: "wd", role: "columnheader", text: mini ? w.charAt(0) : w })); });
    var first = new Date(ym.y, ym.m, 1), start = new Date(first);
    start.setDate(1 - first.getDay());
    var todayIso = iso(today);
    for (var i = 0; i < 42; i++) {
      var d = new Date(start); d.setDate(start.getDate() + i);
      if (i === 35 && d.getMonth() !== ym.m) break;
      var key = iso(d), evs = map[key] || [];
      var cls = "day" + (d.getMonth() !== ym.m ? " out" : "") + (key === todayIso ? " today" : "") + (key < todayIso ? " past" : "") + (!mini && key === selDay ? " sel" : "");
      var label = fmtFull.format(d) + (evs.length ? ", " + evs.length + " evento(s)" : "");
      var cell = el("button", { type: "button", class: cls, "data-day": key, "aria-label": label, role: "gridcell" }, [el("span", { class: "dn", text: String(d.getDate()) })]);
      var dots = el("span", { class: "dots", "aria-hidden": "true" });
      evs.slice(0, 4).forEach(function (e) { var dot = el("i"); dot.style.background = KCOLOR[e.k]; dots.appendChild(dot); });
      if (mini) cell.appendChild(dots);
      else {
        evs.slice(0, 2).forEach(function (e) { cell.appendChild(el("span", { class: "ev " + e.k + (e.done ? " done" : ""), text: e.t })); });
        if (evs.length > 2) cell.appendChild(el("span", { class: "ev more", text: "+" + (evs.length - 2) + " mais" }));
        cell.appendChild(dots);
      }
      cell.addEventListener("click", (function (k) {
        return function () {
          selDay = k;
          var dd = parseD(k); calYM = { y: dd.getFullYear(), m: dd.getMonth() };
          if (mini) { location.hash = "dia"; } else { renderCalendar(); }
          renderDay();
        };
      })(key));
      grid.appendChild(cell);
    }
  }
  function renderCalendar() {
    $("monthLbl").textContent = fmtMonthOnly.format(new Date(calYM.y, calYM.m, 1));
    buildMonth($("monthGrid"), calYM, false);
  }
  function renderMini() {
    $("miniLbl").textContent = fmtMonthOnly.format(new Date(miniYM.y, miniYM.m, 1));
    buildMonth($("miniGrid"), miniYM, true);
  }
  function shift(ym, n) { var d = new Date(ym.y, ym.m + n, 1); return { y: d.getFullYear(), m: d.getMonth() }; }
  $("calPrev").addEventListener("click", function () { calYM = shift(calYM, -1); renderCalendar(); });
  $("calNext").addEventListener("click", function () { calYM = shift(calYM, 1); renderCalendar(); });
  $("calToday").addEventListener("click", function () { calYM = { y: today.getFullYear(), m: today.getMonth() }; selDay = iso(today); renderCalendar(); renderDay(); });
  $("miniPrev").addEventListener("click", function () { miniYM = shift(miniYM, -1); renderMini(); });
  $("miniNext").addEventListener("click", function () { miniYM = shift(miniYM, 1); renderMini(); });

  function renderDay() {
    var d = parseD(selDay), n = daysUntil(selDay);
    $("dayTitle").textContent = fmtFull.format(d) + " · " + rel(n);
    var ul = $("dayList"); clear(ul);
    var evs = eventsByDay()[selDay] || [];
    if (!evs.length) ul.appendChild(el("li", { class: "empty", text: "Nada marcado neste dia. Adicione algo abaixo." }));
    evs.forEach(function (e) {
      var k = el("span", { class: "k", "aria-hidden": "true" }); k.style.background = KCOLOR[e.k];
      ul.appendChild(el("li", null, [k, el("div", null, [el("div", { class: "t", text: e.t }), e.sub ? el("div", { class: "small muted", text: e.sub }) : null]),
        el("span", { class: "tag", text: e.done ? "concluída" : KNAME[e.k] })]));
    });
  }
  $("dayForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var tit = str($("dTit").value, 70), tipo = $("dTipo").value, err = "";
    $("dTit").removeAttribute("aria-invalid");
    if (!tit) { err = "Escreva o que vai acontecer neste dia."; $("dTit").setAttribute("aria-invalid", "true"); }
    $("dErr").textContent = err;
    if (err) return;
    if (tipo === "__prova") {
      if (state.provas.length >= LIMITS.provas) { $("dErr").textContent = "Limite de avaliações atingido."; return; }
      state.provas.push({ id: uid(), disc: str(tit, 50), tipo: "Prova", data: selDay, cont: "", ex: false });
    } else {
      if (state.ativ.length >= LIMITS.ativ) { $("dErr").textContent = "Limite de atividades atingido."; return; }
      state.ativ.push({ id: uid(), tit: tit, tipo: TIPOS_ATIV.indexOf(tipo) >= 0 ? tipo : "Entrega", data: selDay, done: false, ex: false });
    }
    save(); $("dTit").value = "";
    renderAll();
    toast("Adicionado em " + fmtDay.format(parseD(selDay)) + ".");
  });

  function renderFixed() {
    var ol = $("fixedList"); clear(ol);
    var items = [];
    FERIADOS.forEach(function (f) { items.push({ d: f[0], t: f[1], k: "feriado" }); });
    OFICIAIS.forEach(function (o) { items.push({ d: o.d, t: o.t, k: "oficial" }); });
    UNICAMP.forEach(function (u) { items.push({ d: u.a, t: "Unicamp: " + u.t, k: "oficial" }); });
    items = items.filter(function (i) { return daysUntil(i.d) >= 0; }).sort(function (a, b) { return a.d < b.d ? -1 : 1; }).slice(0, 10);
    items.forEach(function (i) {
      ol.appendChild(el("li", null, [el("span", { class: "when", text: fmtLong.format(parseD(i.d)) }), el("span", { class: "what", text: i.t }),
        el("span", { class: "tag " + (i.k === "feriado" ? "ok" : "tone"), text: rel(daysUntil(i.d)) })]));
    });
  }

  // Próximo evento com horário: provas e atividades do usuário, ENEM e Unicamp
  function nextEvent(now) {
    var cands = [];
    OFICIAIS.forEach(function (o) { var d = parseD(o.d); d.setHours(o.h, o.m, 0, 0); cands.push({ at: d, t: o.t }); });
    UNICAMP.forEach(function (u) { var d = parseD(u.a); d.setHours(u.t.indexOf("Provas") === 0 ? 13 : 0, 0, 0, 0); cands.push({ at: d, t: "Unicamp: " + u.t }); });
    state.provas.forEach(function (p) { var d = parseD(p.data); d.setHours(8, 0, 0, 0); cands.push({ at: d, t: p.tipo + ": " + p.disc }); });
    state.ativ.forEach(function (a) { if (!a.done) { var d = parseD(a.data); d.setHours(8, 0, 0, 0); cands.push({ at: d, t: a.tit }); } });
    return cands.filter(function (c) { return c.at > now; }).sort(function (a, b) { return a.at - b.at; })[0];
  }
  var fmtWhen = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
  function paintCountdown(box, now) {
    var ev = nextEvent(now);
    if (!box._built) {
      clear(box);
      box._lbl = el("span", { class: "label", text: "Próximo compromisso" });
      box._what = el("span", { class: "what" });
      box._at = el("span", { class: "small muted" });
      box._units = el("div", { class: "cd-units" });
      box._cells = ["dias", "horas", "min", "seg"].map(function (u) { var b = el("b", { text: "0" }); box._units.appendChild(el("span", null, [b, el("small", { text: u })])); return b; });
      [box._lbl, box._what, box._at, box._units].forEach(function (n) { box.appendChild(n); });
      box._built = true;
    }
    if (!ev) { box._what.textContent = "Nenhum compromisso futuro."; box._at.textContent = ""; box._units.hidden = true; return; }
    box._units.hidden = false;
    box._what.textContent = ev.t;
    box._at.textContent = fmtWhen.format(ev.at);
    var diff = Math.max(0, Math.floor((ev.at - now) / 1000));
    var v = [Math.floor(diff / 86400), Math.floor(diff % 86400 / 3600), Math.floor(diff % 3600 / 60), diff % 60];
    box._cells.forEach(function (b, i) { b.textContent = i === 0 ? String(v[i]) : String(v[i]).padStart(2, "0"); });
  }
  var fmtLiveDate = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  function hms(now) { return [now.getHours(), now.getMinutes(), now.getSeconds()].map(function (n) { return String(n).padStart(2, "0"); }).join(":"); }
  var fmtArtM = new Intl.DateTimeFormat("pt-BR", { month: "short" });
  onTick(function (now) {
    var am = $("artMonth"), ad = $("artDay");
    if (am) { am.textContent = (fmtArtM.format(now).replace(".", "") + " " + now.getFullYear()).toUpperCase(); ad.textContent = String(now.getDate()); }
  });
  onTick(function (now) {
    var t = hms(now), dl = fmtLiveDate.format(now); dl = dl.charAt(0).toUpperCase() + dl.slice(1);
    if (currentView === "calendario") { $("liveTime").textContent = t; $("liveDate").textContent = dl; paintCountdown($("countdown"), now); }
    if (currentView === "inicio") { $("homeTime").textContent = t; $("homeDate").textContent = dl; paintCountdown($("homeCountdown"), now); }
  });


  /* ---------- Faixas salariais ---------- */
  var SALARIOS = [
    { n: "Médico(a)", a: "saude", area: "Saúde", avg: 12000, lo: 7000, hi: 20000 },
    { n: "Engenheiro(a) civil", a: "exatas", area: "Exatas e tecnologia", avg: 8500, lo: 5500, hi: 13000 },
    { n: "Desenvolvedor(a) de software", a: "exatas", area: "Exatas e tecnologia", avg: 7500, lo: 4500, hi: 12000 },
    { n: "Analista financeiro(a)", a: "negocios", area: "Negócios", avg: 6200, lo: 4000, hi: 9000 },
    { n: "Advogado(a)", a: "negocios", area: "Direito", avg: 6000, lo: 3500, hi: 10000 },
    { n: "Contador(a)", a: "negocios", area: "Negócios", avg: 5000, lo: 3000, hi: 8000 },
    { n: "Enfermeiro(a)", a: "saude", area: "Saúde", avg: 4500, lo: 3200, hi: 6500 },
    { n: "Designer gráfico", a: "educacao", area: "Comunicação e artes", avg: 4000, lo: 2500, hi: 6500 },
    { n: "Professor(a) do ensino médio", a: "educacao", area: "Educação", avg: 3800, lo: 2500, hi: 5500 },
    { n: "Fisioterapeuta", a: "saude", area: "Saúde", avg: 3445, lo: 2768, hi: 4992, src: "piso e teto" },
    { n: "Psicólogo(a)", a: "saude", area: "Saúde", avg: 3324, src: "só média" },
    { n: "Vendedor(a)", a: "negocios", area: "Comércio", avg: 2800, lo: 1621, hi: 5000 },
    { n: "Auxiliar administrativo", a: "negocios", area: "Negócios", avg: 2200, lo: 1621, hi: 3200 }
  ];
  var SAL_MAX = 20000, salArea = "todas";
  var BRL0 = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
  var SAL_COLOR = { saude: "var(--terra)", exatas: "var(--blue)", negocios: "var(--sage)", educacao: "var(--mustard)" };
  function kfmt(v) { return (v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " mil"; }
  function pct(v) { return Math.min(100, v / SAL_MAX * 100) + "%"; }
  function renderSalarios() {
    var ul = $("salList");
    var before = {};
    ul.querySelectorAll("li[data-key]").forEach(function (li) { before[li.dataset.key] = li.getBoundingClientRect().top; });
    clear(ul);
    SALARIOS.filter(function (x) { return salArea === "todas" || x.a === salArea; }).forEach(function (x, i) {
      var track = el("div", { class: "sal-track", role: "img", "aria-label": x.n + ": média " + BRL0.format(x.avg) + (x.lo ? ", faixa de " + BRL0.format(x.lo) + " a " + BRL0.format(x.hi) : "") });
      track.style.setProperty("--c", SAL_COLOR[x.a]);
      if (x.lo) { var r = el("span", { class: "sal-range" }); r.style.left = pct(x.lo); r.style.width = (Math.min(x.hi, SAL_MAX) - x.lo) / SAL_MAX * 100 + "%"; track.appendChild(r); }
      var dot = el("span", { class: "sal-avg" }); dot.style.left = pct(x.avg); track.appendChild(dot);
      var li = el("li", null, [
        el("div", { class: "sal-name" }, [el("b", { text: x.n }), el("span", { text: x.area + (x.src ? " · " + x.src : "") })]),
        track,
        el("div", { class: "sal-val" }, [el("b", { text: BRL0.format(x.avg) }), el("span", { text: x.lo ? "de " + kfmt(x.lo) + " a " + kfmt(x.hi) : "média" })])
      ]);
      li.dataset.key = x.n;
      ul.appendChild(li);
    });
    // FLIP: cada item desliza da posição antiga para a nova
    if (reduceMotion) return;
    ul.querySelectorAll("li[data-key]").forEach(function (li) {
      var old = before[li.dataset.key], now = li.getBoundingClientRect().top;
      if (old == null) { li.animate([{ opacity: 0, transform: "translateY(12px)" }, { opacity: 1, transform: "none" }], { duration: 450, easing: "cubic-bezier(.22,1,.36,1)" }); return; }
      var dy = old - now;
      if (dy) li.animate([{ transform: "translateY(" + dy + "px)" }, { transform: "none" }], { duration: 600, easing: "cubic-bezier(.22,1,.36,1)" });
    });
  }
  document.querySelectorAll("#salFilter button").forEach(function (b) {
    b.addEventListener("click", function () {
      salArea = b.dataset.a;
      document.querySelectorAll("#salFilter button").forEach(function (x) { x.setAttribute("aria-pressed", String(x === b)); });
      renderSalarios();
    });
  });


  /* =================================================================
     Movimento (JavaScript puro, sem bibliotecas)
     ================================================================= */
  // Vídeo do modelo Velorah (MotionSites AI), servido pelo endereço indicado no próprio modelo.
  // Se ele sair do ar, o site mostra a ilustração da biblioteca no lugar.
  var VIDEO_SRCS = ["https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260314_131748_f2ca2a28-fed7-44c8-b9a9-bd9acdd5ec31.mp4"];
  var vh = function () { return window.innerHeight || 800; };
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  /* Vídeos: o da abertura e os dos cabeçalhos das páginas */
  function watchVideo(video, box) {
    var failed = function () { box.classList.add("no-video"); };
    video.addEventListener("error", failed, true);
    var srcs = video.querySelectorAll("source");
    if (srcs.length) srcs[srcs.length - 1].addEventListener("error", failed); // só falha quando nenhuma fonte funcionou
    setTimeout(function () { if (video.readyState === 0) failed(); }, 5000);
  }
  var heroVideo = $("heroVideo");
  watchVideo(heroVideo, $("heroMedia"));
  if (reduceMotion) { heroVideo.removeAttribute("autoplay"); heroVideo.pause(); }
  function playSafe(v) { if (reduceMotion) return; var p = v.play(); if (p && p.catch) p.catch(function () {}); }
  function syncVideos(view) {
    document.querySelectorAll("video").forEach(function (v) { if (!view.contains(v)) v.pause(); });
    if (view.id === "p-inicio") { playSafe(heroVideo); return; }
    var box = view.querySelector("[data-video]");
    if (!box) return;
    var v = box.querySelector("video");
    if (!v) {
      v = el("video", { muted: "", loop: "", playsinline: "", preload: "metadata", "aria-hidden": "true", tabindex: "-1" });
      v.muted = true;
      VIDEO_SRCS.forEach(function (u) { v.appendChild(el("source", { src: u, type: "video/mp4" })); });
      box.appendChild(v);
      watchVideo(v, box);
    }
    playSafe(v);
  }

  /* Navegação: fica translúcida ao rolar */
  var topbar = document.querySelector(".topbar");
  function navState() { topbar.classList.toggle("solid", window.scrollY > 30 || mobileNav.classList.contains("open")); }
  menuBtn.addEventListener("click", function () { setTimeout(navState, 0); });

  /* Título palavra por palavra (70 ms entre palavras) */
  function splitWords(node) {
    if (node.dataset.split) return;
    node.dataset.split = "1";
    var i = 0;
    (function walk(n) {
      Array.prototype.slice.call(n.childNodes).forEach(function (c) {
        if (c.nodeType === 3) {
          var frag = document.createDocumentFragment();
          c.textContent.split(/(\s+)/).forEach(function (part) {
            if (!part) return;
            if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(part)); return; }
            var w = el("span", { class: "w", text: part }); w.style.setProperty("--i", i++); frag.appendChild(w);
          });
          n.replaceChild(frag, c);
        } else if (c.nodeType === 1) walk(c);
      });
    })(node);
    node.classList.add("words");
  }
  function playWords(node) {
    if (reduceMotion) return;
    splitWords(node);
    node.classList.remove("in");
    void node.offsetWidth;
    requestAnimationFrame(function () { node.classList.add("in"); });
  }

  /* Letras embaralhadas, como um painel de aeroporto */
  var GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789·";
  function scramble(node) {
    if (reduceMotion) return;
    var final = node.dataset.final || node.textContent;
    node.dataset.final = final;
    var frame = 0, total = 22;
    clearInterval(node._sc);
    node._sc = setInterval(function () {
      frame++;
      var lock = Math.floor(frame / total * final.length);
      var out = "";
      for (var k = 0; k < final.length; k++) {
        var ch = final[k];
        out += (k < lock || ch === " ") ? ch : GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
      }
      node.textContent = out;
      if (frame >= total) { clearInterval(node._sc); node.textContent = final; }
    }, 32);
  }

  /* Odômetro: cada dígito é um rolo de 0 a 9 */
  function odometer(node) {
    var text = node.querySelector(".odo") ? node.getAttribute("aria-label") : node.textContent;
    if (reduceMotion || !text || !/\d/.test(text)) return;
    node.setAttribute("aria-label", text);
    clear(node);
    var wrap = el("span", { class: "odo", "aria-hidden": "true" }), di = 0, reels = [];
    text.split("").forEach(function (ch) {
      if (/\d/.test(ch)) {
        var reel = el("span", { class: "reel" });
        reel.style.setProperty("--i", di++);
        for (var d = 0; d <= 9; d++) reel.appendChild(el("span", { text: String(d) }));
        wrap.appendChild(reel); reels.push([reel, +ch]);
      } else wrap.appendChild(el("span", { class: "fixed", text: ch === " " ? "\u00a0" : ch }));
    });
    node.appendChild(wrap);
    requestAnimationFrame(function () { requestAnimationFrame(function () {
      reels.forEach(function (r) { r[0].style.transform = "translateY(-" + r[1] + "em)"; });
    }); });
  }

  /* Revelar ao rolar */
  var revealIO = "IntersectionObserver" in window ? new IntersectionObserver(function (entries) {
    entries.forEach(function (en) {
      if (!en.isIntersecting) return;
      en.target.classList.add("in");
      if (en.target.matches("[data-scramble]")) scramble(en.target);
      if (en.target.id === "salList") en.target.classList.add("grown");
      revealIO.unobserve(en.target);
    });
  }, { rootMargin: "0px 0px -8% 0px", threshold: .08 }) : null;
  function armReveals(scope) {
    scope.querySelectorAll(".sec, .card, .stat, .tile, .block-head, .inst, .doc-card, .poupa").forEach(function (n, i) {
      if (n.closest(".mobile-nav")) return;
      n.classList.add("reveal");
      n.style.transitionDelay = n.matches(".tile, .stat, .inst, .doc-card, .poupa") ? ((i % 6) * 60) + "ms" : "";
    });
    scope.querySelectorAll(".reveal, [data-scramble], #salList").forEach(function (n) {
      var r = n.getBoundingClientRect();
      if (!revealIO || reduceMotion || (r.top < vh() && r.bottom > 0 && r.height)) { n.classList.add("in"); if (n.id === "salList") n.classList.add("grown"); if (n.matches("[data-scramble]")) scramble(n); }
      else revealIO.observe(n);
    });
  }
  // Ao terminar a transição de entrada, tira o atraso para o hover responder na hora
  document.addEventListener("transitionend", function (e) { if (e.target.classList && e.target.classList.contains("reveal") && e.propertyName === "opacity") e.target.style.transitionDelay = ""; });

  /* Manifesto: as palavras se acendem com a rolagem */
  var manifesto = document.querySelector("[data-fill]");
  splitWords(manifesto); manifesto.classList.remove("words");
  var mWords = manifesto.querySelectorAll(".w");
  function paintManifesto() {
    var r = manifesto.getBoundingClientRect();
    var p = clamp((vh() * .82 - r.top) / (r.height + vh() * .35), 0, 1);
    var lit = Math.floor(p * mWords.length);
    mWords.forEach(function (w, k) { w.classList.toggle("on", k < lit); w.classList.toggle("near", k >= lit && k < lit + 3); });
  }

  /* Capítulos empilhados */
  var stackCards = Array.prototype.slice.call(document.querySelectorAll(".stack-card"));
  stackCards.forEach(function (c) { c.style.setProperty("--k", c.dataset.k); });
  function paintStack() {
    stackCards.forEach(function (c, i) {
      var next = stackCards[i + 1];
      if (!next) { c.style.setProperty("--s", 1); c.style.setProperty("--d", 0); return; }
      var r = c.getBoundingClientRect(), nr = next.getBoundingClientRect();
      var ratio = clamp(1 - (nr.top - r.top) / r.height, 0, 1);
      c.style.setProperty("--s", (1 - ratio * .06).toFixed(4));
      c.style.setProperty("--d", (ratio * .5).toFixed(3));
    });
  }

  /* Linha do tempo que se desenha com a rolagem */
  function paintSteps() {
    var view = document.querySelector("section.view:not([hidden])");
    if (!view) return;
    view.querySelectorAll(".steps").forEach(function (list) {
      var r = list.getBoundingClientRect();
      var p = clamp((vh() * .72 - r.top) / r.height, 0, 1);
      list.style.setProperty("--p", p.toFixed(3));
      list.querySelectorAll("li").forEach(function (li) { li.classList.toggle("lit", (li.offsetTop + 10) / list.offsetHeight <= p + .001); });
    });
  }

  var ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () {
      ticking = false;
      navState();
      if (reduceMotion) { mWords.forEach(function (w) { w.classList.add("on"); }); return; }
      if (currentView === "inicio") { paintManifesto(); paintStack(); }
      paintSteps();
    });
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll);

  /* Palavras que giram na abertura */
  var track = $("tickerTrack");
  function tickerFit(k) { var t = track.children[k]; if (t) track.parentNode.style.width = t.scrollWidth + "px"; }
  if (track) { track.querySelectorAll("span").forEach(function (sp) { sp.style.width = "max-content"; }); tickerFit(0); }
  if (track && !reduceMotion) {
    var ti = 0, tn = track.children.length;
    setInterval(function () {
      if (document.hidden || currentView !== "inicio") return;
      ti++;
      track.style.transition = "";
      track.style.transform = "translateY(-" + (ti * 1.5) + "em)";
      tickerFit(ti);
      if (ti === tn - 1) setTimeout(function () { track.style.transition = "none"; track.style.transform = "translateY(0)"; ti = 0; }, 750);
    }, 2400);
  }

  /* Cursor com ponto e anel, e luz que acompanha o mouse */
  var fine = window.matchMedia("(pointer: fine)").matches;
  if (fine && !reduceMotion) {
    var dot = el("div", { class: "cursor-dot", "aria-hidden": "true" }), ring = el("div", { class: "cursor-ring", "aria-hidden": "true" });
    document.body.appendChild(dot); document.body.appendChild(ring);
    var mx = -100, my = -100, rx = -100, ry = -100;
    document.addEventListener("pointermove", function (e) {
      if (e.pointerType !== "mouse") return;
      mx = e.clientX; my = e.clientY;
      // Na tela de login fica o cursor normal do sistema; a animação volta depois de entrar.
      if (!$("gate").hidden || document.querySelector("dialog[open]")) { document.body.classList.remove("has-cursor"); return; }
      document.body.classList.add("has-cursor");
      dot.style.transform = "translate(" + mx + "px," + my + "px)";
      var t = e.target.closest && e.target.closest("a, button, .day, label, summary, select");
      ring.classList.toggle("hover", !!t);
    });
    document.addEventListener("pointerleave", function () { document.body.classList.remove("has-cursor"); });
    (function follow() {
      rx += (mx - rx) * .18; ry += (my - ry) * .18;
      ring.style.transform = "translate(" + rx.toFixed(1) + "px," + ry.toFixed(1) + "px)";
      requestAnimationFrame(follow);
    })();
  }
  document.addEventListener("pointermove", function (e) {
    var s = e.target.closest && e.target.closest(".spot");
    if (!s) return;
    var r = s.getBoundingClientRect();
    s.style.setProperty("--mx", (e.clientX - r.left) + "px");
    s.style.setProperty("--my", (e.clientY - r.top) + "px");
  });

  /* Botão elástico: mola com rigidez e amortecimento */
  document.querySelectorAll("[data-magnetic]").forEach(function (btn) {
    if (!fine || reduceMotion) return;
    var x = 0, y = 0, vx = 0, vy = 0, tx = 0, ty = 0, running = false;
    function step() {
      vx = (vx + (tx - x) * .12) * .78; vy = (vy + (ty - y) * .12) * .78;
      x += vx; y += vy;
      btn.style.translate = x.toFixed(2) + "px " + y.toFixed(2) + "px";
      if (Math.abs(vx) + Math.abs(vy) + Math.abs(tx - x) + Math.abs(ty - y) > .05) requestAnimationFrame(step); else running = false;
    }
    function kick() { if (!running) { running = true; requestAnimationFrame(step); } }
    btn.addEventListener("pointermove", function (e) {
      var r = btn.getBoundingClientRect();
      tx = (e.clientX - (r.left + r.width / 2)) * .3; ty = (e.clientY - (r.top + r.height / 2)) * .4; kick();
    });
    btn.addEventListener("pointerleave", function () { tx = 0; ty = 0; kick(); });
  });

  /* Confete com gravidade, giro e resistência do ar */
  function confetti() {
    if (reduceMotion) return;
    var cv = $("confetti");
    if (!cv) { cv = el("canvas", { id: "confetti", "aria-hidden": "true" }); document.body.appendChild(cv); }
    var dpr = window.devicePixelRatio || 1, W = window.innerWidth, H = window.innerHeight;
    cv.width = W * dpr; cv.height = H * dpr; cv.style.width = W + "px"; cv.style.height = H + "px";
    var ctx = cv.getContext("2d"); ctx.scale(dpr, dpr);
    var colors = ["#E7A989", "#A9CCA6", "#E9C985", "#9DC6EA", "#DDAABB", "#ffffff"], parts = [];
    for (var k = 0; k < 140; k++) parts.push({ x: W / 2, y: H * .35, vx: (Math.random() - .5) * 16, vy: -Math.random() * 14 - 4, r: Math.random() * Math.PI, vr: (Math.random() - .5) * .3, w: 6 + Math.random() * 6, h: 4 + Math.random() * 4, c: colors[k % colors.length] });
    (function frame() {
      ctx.clearRect(0, 0, W, H);
      var alive = 0;
      parts.forEach(function (p) {
        p.vy += .35; p.vx *= .985; p.vy *= .985; p.x += p.vx; p.y += p.vy; p.r += p.vr;
        if (p.y < H + 20) alive++;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.fillStyle = p.c; ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); ctx.restore();
      });
      if (alive) requestAnimationFrame(frame); else ctx.clearRect(0, 0, W, H);
    })();
  }

  /* Ao entrar em uma página */
  function motionOnShow(v, view, animate) {
    syncVideos(view);
    navState();
    var h1 = view.querySelector(".page-head h1");
    if (h1 && animate) playWords(h1);
    var lbl = view.querySelector(".page-head .label");
    if (lbl && animate) scramble(lbl);
    if (v === "inicio" || v === "perfil") view.querySelectorAll(".stat .v").forEach(odometer);
    if (v === "campus") {
      if (!C3.built) { C3.built = true; loadThree(function () { buildCampus3D(); if (C3.ready && curZone) C3.focus(curZone.id, false); }); }
      else if (C3.kick) C3.kick();
    }
    requestAnimationFrame(function () { armReveals(view); onScroll(); });
  }

  /* ---------- Conta de demonstração (sem servidor) ----------
     Contas ficam no localStorage deste navegador. A senha nunca é guardada:
     só um hash PBKDF2-SHA-256 com sal aleatório. Quando houver banco de dados,
     trocar authStore/hashPass por chamadas ao serviço (por exemplo, Supabase Auth). */
  var AREAS = ["Exatas e engenharias", "Tecnologia", "Saúde", "Biológicas", "Humanas e sociais", "Direito", "Negócios", "Comunicação", "Artes e design", "Educação"];
  var INSTS = ["Unicamp", "PUC-Campinas", "Fatec", "IFSP", "Unip", "Unisal", "Anhanguera", "Outra instituição", "Ainda estou no ensino médio"];
  var CITIES = ["Campinas", "Sumaré", "Hortolândia", "Paulínia", "Valinhos", "Vinhedo", "Americana", "Outra cidade"];
  var AUTH_KEY = "portalFuturo.auth", SESS_KEY = "portalFuturo.session", SESS_DAYS = 7;
  var DEMO = { name: "Estudante Demo", email: "demo@portalfuturo.app", pass: "Demo2026!", inst: "Unicamp" };
  function readJSON(store, k) { try { var v = JSON.parse(store.getItem(k) || "null"); return v && typeof v === "object" ? v : null; } catch (e) { return null; } }
  function writeJSON(store, k, v) { try { store.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }
  function authStore() {
    var a = readJSON(localStorage, AUTH_KEY) || {};
    var users = Array.isArray(a.users) ? a.users.filter(function (u) {
      return u && typeof u.id === "string" && typeof u.email === "string" && typeof u.hash === "string" && typeof u.salt === "string";
    }).map(function (u) { return { id: str(u.id, 40), name: str(u.name, 60), email: str(u.email, 120).toLowerCase(), inst: str(u.inst || "", 60), city: str(u.city || "", 40), course: str(u.course || "", 60), areas: Array.isArray(u.areas) ? u.areas.filter(function (a, i, arr) { return AREAS.indexOf(a) >= 0 && arr.indexOf(a) === i; }).slice(0, 4) : [], salt: str(u.salt, 64), hash: str(u.hash, 128), iter: Number(u.iter) || 0, created: str(u.created || "", 40) }; }) : [];
    return { users: users };
  }
  function saveAuth(a) { return writeJSON(localStorage, AUTH_KEY, { users: a.users }); }
  function hex(buf) { return Array.prototype.map.call(new Uint8Array(buf), function (b) { return ("0" + b.toString(16)).slice(-2); }).join(""); }
  function randHex(n) { var a = new Uint8Array(n); (window.crypto || window.msCrypto).getRandomValues(a); return hex(a.buffer); }
  var ITER = 120000;
  function hashPass(pass, salt, iter) {
    var subtle = window.crypto && window.crypto.subtle;
    if (!subtle || !window.TextEncoder) {
      // contexto sem WebCrypto (raro): hash simples, apenas para a demonstração funcionar
      var h = 2166136261, s = salt + ":" + pass;
      for (var r = 0; r < 2000; r++) for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i) + r; h = Math.imul(h, 16777619) >>> 0; }
      return Promise.resolve({ hash: "f:" + h.toString(16), iter: 0 });
    }
    var enc = new TextEncoder();
    return subtle.importKey("raw", enc.encode(pass), { name: "PBKDF2" }, false, ["deriveBits"]).then(function (key) {
      return subtle.deriveBits({ name: "PBKDF2", salt: enc.encode(salt), iterations: iter || ITER, hash: "SHA-256" }, key, 256);
    }).then(function (bits) { return { hash: hex(bits), iter: iter || ITER }; });
  }
  function safeEq(a, b) { if (a.length !== b.length) return false; var d = 0; for (var i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; }
  /* ---------- Servidor (Supabase) ----------
     Conversa direto com a API do Supabase, sem biblioteca externa.
     Senhas são verificadas e guardadas pelo Supabase (nunca neste site).
     Cada aluno só lê e altera as próprias linhas: as regras (RLS) ficam no banco. */
  var CFG = window.PF_CONFIG || {};
  var SB_URL = typeof CFG.supabaseUrl === "string" ? CFG.supabaseUrl.replace(/\/+$/, "") : "";
  var SB_KEY = typeof CFG.supabaseKey === "string" ? CFG.supabaseKey.trim() : "";
  var CLOUD = /^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(SB_URL) && SB_KEY.length > 20 && typeof window.fetch === "function";
  var HTTP = /^https?:$/.test(location.protocol);
  var SB_SESS = "portalFuturo.sb", PKCE_KEY = "portalFuturo.pkce", CACHE = "portalFuturo.c.";
  var UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  var sbSess = null, refreshing = null;
  function siteUrl() { return location.origin + location.pathname; }
  function sbErr(status, code, msg) { var e = new Error(msg || code || "erro"); e.status = status; e.code = code || ""; return e; }
  function sbStore(s) {
    try { localStorage.removeItem(SB_SESS); sessionStorage.removeItem(SB_SESS); } catch (e) {}
    if (s) writeJSON(s.remember ? localStorage : sessionStorage, SB_SESS, s);
  }
  function sbRead() {
    var s = readJSON(sessionStorage, SB_SESS) || readJSON(localStorage, SB_SESS);
    return s && typeof s.at === "string" && typeof s.rt === "string" && UUID_RE.test(s.uid || "") ? s : null;
  }
  function jwtSub(t) {
    try { var b = t.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"); return JSON.parse(atob(b + "===".slice((b.length + 3) % 4))).sub || ""; } catch (e) { return ""; }
  }
  function sbSetSession(j, remember) {
    if (!j || typeof j.access_token !== "string" || typeof j.refresh_token !== "string") throw sbErr(0, "bad_session");
    var uid = j.user && j.user.id ? j.user.id : jwtSub(j.access_token);
    if (!UUID_RE.test(uid)) throw sbErr(0, "bad_session");
    sbSess = { at: j.access_token, rt: j.refresh_token, exp: Date.now() + (Number(j.expires_in) || 3600) * 1000, uid: uid, remember: remember !== false };
    sbStore(sbSess);
    return sbSess;
  }
  function sbReq(method, path, body, opt) {
    opt = opt || {};
    var h = { apikey: SB_KEY, "Content-Type": "application/json" };
    if (opt.token) h.Authorization = "Bearer " + opt.token; // a chave pública vai só em "apikey"
    if (opt.prefer) h.Prefer = opt.prefer;
    var ctrl = window.AbortController ? new AbortController() : null;
    var tm = ctrl ? setTimeout(function () { ctrl.abort(); }, 15000) : 0;
    return fetch(SB_URL + path, { method: method, headers: h, body: body == null ? undefined : JSON.stringify(body), signal: ctrl ? ctrl.signal : undefined, credentials: "omit", cache: "no-store", keepalive: !!opt.keepalive })
      .then(function (r) {
        clearTimeout(tm);
        return r.text().then(function (txt) {
          var j = null; try { j = txt ? JSON.parse(txt) : null; } catch (e) {}
          if (!r.ok) throw sbErr(r.status, (j && (j.error_code || j.code || j.error)) || "", (j && (j.msg || j.message || j.error_description)) || "");
          return j;
        });
      }, function () { clearTimeout(tm); throw sbErr(0, "network"); });
  }
  function sbToken() {
    if (!sbSess) return Promise.reject(sbErr(401, "no_session"));
    if (sbSess.exp - Date.now() > 60000) return Promise.resolve(sbSess.at);
    if (!refreshing) {
      var rem = sbSess.remember;
      refreshing = sbReq("POST", "/auth/v1/token?grant_type=refresh_token", { refresh_token: sbSess.rt })
        .then(function (j) { refreshing = null; sbSetSession(j, rem); return sbSess.at; },
              function (e) { refreshing = null; if (e.status >= 400 && e.status < 500) sessionLost(); throw e; });
    }
    return refreshing;
  }
  function sbAuthed(method, path, body, prefer, keepalive) {
    return sbToken().then(function (t) { return sbReq(method, path, body, { token: t, prefer: prefer, keepalive: keepalive }); })
      .catch(function (e) { if (e.status === 401 && e.code !== "no_session") sessionLost(); throw e; });
  }
  function cloudMsg(e, fallback) {
    var c = (e && e.code) || "", s = e && e.status;
    if (c === "network") return "Sem conexão com o servidor. Verifique a internet e tente de novo.";
    if (c === "invalid_credentials" || c === "invalid_grant") return "E-mail ou senha incorretos.";
    if (c === "email_not_confirmed") return "Confirme seu e-mail antes de entrar. Procure a mensagem do Portal Futuro na caixa de entrada e no spam.";
    if (c === "user_already_exists" || c === "email_exists") return "Já existe uma conta com esse e-mail. Use a aba Entrar.";
    if (c === "weak_password") return "Essa senha é fraca demais. Use 8 ou mais caracteres, com letras e números.";
    if (c === "same_password") return "A nova senha precisa ser diferente da atual.";
    if (c === "signup_disabled") return "A criação de contas está fechada no momento.";
    if (c.indexOf("rate_limit") >= 0 || s === 429) return "Muitas tentativas seguidas. Aguarde alguns minutos e tente de novo.";
    if (c === "otp_expired") return "Esse link expirou. Peça um novo.";
    return fallback || "Não foi possível falar com o servidor agora. Tente de novo.";
  }
  function normCloudUser(au, p) {
    p = p || {}; var md = au.user_metadata || {}, prov = (au.app_metadata && au.app_metadata.providers) || [];
    var areas = Array.isArray(p.areas) ? p.areas.filter(function (a, i, arr) { return AREAS.indexOf(a) >= 0 && arr.indexOf(a) === i; }).slice(0, 4) : [];
    var name = str(p.name || md.full_name || md.name || String(au.email || "").split("@")[0], 60).replace(/[<>]/g, "") || "Estudante";
    return { id: au.id, email: str(au.email || "", 120).toLowerCase(), name: name, inst: INSTS.indexOf(p.inst) >= 0 ? p.inst : "", city: CITIES.indexOf(p.city) >= 0 ? p.city : "",
      course: str(p.course || "", 60), areas: areas, created: str(p.created_at || au.created_at || "", 40), cloud: true,
      hasPassword: prov.indexOf("email") >= 0, google: prov.indexOf("google") >= 0, confirmed: !!(au.email_confirmed_at || au.confirmed_at) };
  }
  function sbLoadUser() {
    return sbAuthed("GET", "/auth/v1/user").then(function (au) {
      if (!au || !UUID_RE.test(au.id || "")) throw sbErr(0, "bad_user");
      return sbAuthed("GET", "/rest/v1/profiles?id=eq." + au.id + "&select=name,inst,city,course,areas,created_at").then(function (rows) {
        return normCloudUser(au, Array.isArray(rows) ? rows[0] : null);
      });
    });
  }
  function sbSignOut() {
    var t = sbSess && sbSess.at;
    var ask = $("pushAsk"); if (ask) { ask.classList.remove("in"); ask.hidden = true; }
    if (t && typeof pushStop === "function") pushStop(t); // este aparelho para de receber avisos da conta que saiu
    if (t) sbReq("POST", "/auth/v1/logout?scope=local", null, { token: t }).catch(function () {});
    if (sbSess) { try { localStorage.removeItem(CACHE + sbSess.uid); localStorage.removeItem(CACHE + sbSess.uid + ".dirty"); } catch (e) {} }
    sbSess = null; sbStore(null); clearTimeout(syncT); cloudReady = false;
  }
  function sessionLost() {
    if (!currentUser || !currentUser.cloud) return;
    sbSignOut(); applyUser(null); clearUserData(); $("heroHello").hidden = true; showGate();
    toast("Sua sessão terminou. Entre de novo para continuar.");
  }
  // Sincronização dos dados das ferramentas (provas, gastos, agenda, favoritos)
  var syncT = null, cloudReady = false, lastSync = 0, syncFlag = "ok";
  function setSync(s) {
    syncFlag = s; var n = $("pfSync"); if (!n) return;
    n.className = "pf-sync" + (s === "ok" ? "" : s === "wait" ? " wait" : " err");
    n.textContent = s === "ok" ? (lastSync ? "Salvos na nuvem às " + String(new Date(lastSync).getHours()).padStart(2, "0") + ":" + String(new Date(lastSync).getMinutes()).padStart(2, "0") : "Salvos na nuvem")
      : s === "wait" ? "Salvando…" : "Ainda não sincronizados. Vamos tentar de novo quando houver conexão.";
  }
  function pushNow(keepalive) {
    var u = currentUser; if (!u || !u.cloud || !cloudReady) return Promise.resolve();
    var snap = JSON.parse(JSON.stringify(state)), uid = u.id;
    return sbAuthed("POST", "/rest/v1/user_data?on_conflict=user_id", { user_id: uid, data: snap }, "resolution=merge-duplicates,return=minimal", keepalive)
      .then(function () { lastSync = Date.now(); try { localStorage.removeItem(CACHE + uid + ".dirty"); } catch (e) {} setSync("ok"); },
            function () { setSync("err"); clearTimeout(syncT); syncT = setTimeout(function () { pushNow(); }, 30000); });
  }
  function cloudSave() {
    if (!currentUser || !currentUser.cloud) return;
    try { localStorage.setItem(CACHE + currentUser.id + ".dirty", "1"); } catch (e) {}
    if (!cloudReady) { setSync("err"); return; }
    setSync("wait"); clearTimeout(syncT); syncT = setTimeout(function () { pushNow(); }, 800);
  }
  window.addEventListener("pagehide", function () { if (syncT && syncFlag === "wait") { clearTimeout(syncT); pushNow(true); } });
  window.addEventListener("online", function () { if (syncFlag === "err" && cloudReady) pushNow(); });
  function loadCloudData(u) {
    dataKey = CACHE + u.id; cloudReady = false;
    var cached = readState(dataKey), dirty = false;
    try { dirty = localStorage.getItem(CACHE + u.id + ".dirty") === "1"; } catch (e) {}
    state = cached || sanitize({}); refreshData();
    return sbAuthed("GET", "/rest/v1/user_data?user_id=eq." + u.id + "&select=data").then(function (rows) {
      var remote = Array.isArray(rows) && rows[0] && rows[0].data ? sanitize(rows[0].data) : null;
      cloudReady = true;
      if (dirty && cached) { state = cached; pushNow(); }        // alterações feitas sem internet sobem agora
      else if (remote) { state = remote; lastSync = Date.now(); setSync("ok"); }
      else {
        // conta nova na nuvem: traz os dados da conta antiga deste navegador com o mesmo e-mail (só com e-mail confirmado)
        var old = u.confirmed ? authStore().users.filter(function (x) { return x.email === u.email && x.email !== DEMO.email; })[0] : null;
        var imported = old ? readState(KEY + "." + old.id) : null;
        state = sanitize(imported || {}); // conta nova começa vazia
        if (old) { var a = authStore(); a.users = a.users.filter(function (x) { return x.id !== old.id; }); saveAuth(a); try { localStorage.removeItem(KEY + "." + old.id); } catch (e) {} }
        if (imported) setTimeout(function () { toast("Trouxemos para a nuvem os dados que você tinha salvado neste navegador."); }, 1500);
        pushNow();
      }
      try { localStorage.setItem(dataKey, JSON.stringify(state)); } catch (e) {}
      refreshData();
    }).catch(function (e) {
      if (e && e.status === 401) return;
      setSync("err");
      toast(cached ? "Sem conexão com o servidor. Mostrando a última cópia salva neste aparelho." : "Sem conexão com o servidor. Seus dados aparecem assim que a conexão voltar.");
      setTimeout(function () { if (currentUser && currentUser.id === u.id && !cloudReady) loadCloudData(u); }, 20000);
    });
  }
  // Volta do Google, do link de confirmação ou de "esqueci minha senha"
  function sbHandleReturn() {
    var h = location.hash.slice(1), qs = new URLSearchParams(location.search);
    var hp = new URLSearchParams(h.indexOf("=") >= 0 ? h : "");
    var clean = function () { try { history.replaceState(null, "", location.pathname); } catch (e) {} };
    var err = hp.get("error_description") || qs.get("error_description") || hp.get("error") || qs.get("error");
    if (err) { var ec = hp.get("error_code") || qs.get("error_code") || ""; clean(); return Promise.resolve({ error: ec === "otp_expired" ? "Esse link expirou ou já foi usado. Peça um novo." : "Não foi possível entrar por esse link. Tente de novo." }); }
    if (hp.get("access_token") && hp.get("refresh_token")) {
      var type = hp.get("type") || "login";
      var j = { access_token: hp.get("access_token"), refresh_token: hp.get("refresh_token"), expires_in: hp.get("expires_in") };
      clean();
      try { sbSetSession(j, true); } catch (e) { return Promise.resolve({ error: "Link inválido." }); }
      return Promise.resolve({ type: type });
    }
    if (qs.get("code")) {
      var code = qs.get("code"), ver = null;
      try { ver = sessionStorage.getItem(PKCE_KEY); sessionStorage.removeItem(PKCE_KEY); } catch (e) {}
      clean();
      if (!ver) return Promise.resolve({ error: "O login com Google foi aberto em outra janela. Tente de novo por aqui." });
      return sbReq("POST", "/auth/v1/token?grant_type=pkce", { auth_code: code, code_verifier: ver })
        .then(function (r) { sbSetSession(r, true); return { type: "oauth" }; }, function (e) { return { error: cloudMsg(e, "Não foi possível entrar com o Google. Tente de novo.") }; });
    }
    return Promise.resolve(null);
  }
  function b64url(bytes) { var s = ""; for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]); return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
  function googleLogin(btn) {
    if (!HTTP || !window.crypto || !crypto.subtle) { toast("O login com Google funciona só no site publicado."); return; }
    btn.disabled = true;
    var v = randHex(32);
    try { sessionStorage.setItem(PKCE_KEY, v); } catch (e) {}
    crypto.subtle.digest("SHA-256", new TextEncoder().encode(v)).then(function (hash) {
      location.href = SB_URL + "/auth/v1/authorize?provider=google&redirect_to=" + encodeURIComponent(siteUrl()) + "&code_challenge=" + b64url(new Uint8Array(hash)) + "&code_challenge_method=s256";
    }, function () { btn.disabled = false; toast("Não foi possível abrir o login com Google."); });
  }

  function getSession() {
    var s = readJSON(sessionStorage, SESS_KEY) || readJSON(localStorage, SESS_KEY);
    if (!s || typeof s.uid !== "string" || !(s.exp > Date.now())) return null;
    var u = authStore().users.filter(function (x) { return x.id === s.uid; })[0];
    return u || null;
  }
  function setSession(u, remember) {
    var s = { uid: u.id, exp: Date.now() + (remember ? SESS_DAYS * 864e5 : 12 * 36e5) };
    try { localStorage.removeItem(SESS_KEY); sessionStorage.removeItem(SESS_KEY); } catch (e) {}
    writeJSON(remember ? localStorage : sessionStorage, SESS_KEY, s);
  }
  function clearSession() { try { localStorage.removeItem(SESS_KEY); sessionStorage.removeItem(SESS_KEY); } catch (e) {} }
  var EMAIL_RE = /^[^\s@<>()[\]\\,;:"]{1,64}@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/i;
  function pwScore(p) {
    if (!p) return 0;
    var s = 0; if (p.length >= 8) s++; if (p.length >= 12) s++;
    if (/[a-z]/i.test(p) && /\d/.test(p)) s++; if (/[^a-z0-9]/i.test(p) || (/[a-z]/.test(p) && /[A-Z]/.test(p))) s++;
    return Math.min(4, Math.max(1, s));
  }
  var fails = 0, lockUntil = 0;
  try { var lk = readJSON(sessionStorage, "portalFuturo.lock"); if (lk) { fails = Number(lk.f) || 0; lockUntil = Number(lk.u) || 0; } } catch (e) {}
  function saveLock() { writeJSON(sessionStorage, "portalFuturo.lock", { f: fails, u: lockUntil }); }

  var gateEls = ["sampleBar", "mobileNav", "tabbar", "sheetGuia", "sheetFerr", "main"].map(function (id) { return $(id); }).concat([document.querySelector(".topbar"), document.querySelector("footer")]).filter(Boolean);
  function lockPage(on) {
    document.body.classList.toggle("locked", on);
    gateEls.forEach(function (n) { if (on) n.setAttribute("inert", ""); else n.removeAttribute("inert"); if (on) n.setAttribute("aria-hidden", "true"); else n.removeAttribute("aria-hidden"); });
    document.querySelectorAll("video").forEach(function (v) { try { if (on) v.pause(); } catch (e) {} });
  }
  function initials(n) { var p = n.trim().split(/\s+/); return ((p[0] || "?")[0] + (p.length > 1 ? p[p.length - 1][0] : "")).toUpperCase(); }
  function firstName(n) { return n.trim().split(/\s+/)[0] || n; }
  var currentUser = null;
  function applyUser(u) {
    currentUser = u;
    $("userMenu").hidden = !u;
    if (!u) return;
    $("userAv").textContent = initials(u.name); $("userName").textContent = firstName(u.name);
    var hh = $("heroHello"); hh.textContent = "Olá, " + firstName(u.name) + ". Bom te ver por aqui."; hh.hidden = false;
  }
  function showGate() {
    var g = $("gate"); g.hidden = false; g.classList.remove("leaving"); document.body.classList.remove("has-cursor");
    lockPage(true); setTab("login", false);
    ["formLogin", "formSignup"].forEach(function (f) { $(f).reset(); });
    ["liMsg", "suMsg"].forEach(function (m) { $(m).textContent = ""; });
    $("pwMeterS").dataset.s = "0";
    setTimeout(function () { try { $("liEmail").focus({ preventScroll: true }); } catch (e) {} g.scrollTop = 0; var gp = document.querySelector(".gate-panel"); if (gp) gp.scrollTop = 0; }, 60);
  }
  function enterSite(u, isNew, quiet) {
    loadUserData(u);
    applyUser(u);
    var g = $("gate");
    var done = function () { g.hidden = true; g.classList.remove("leaving"); lockPage(false); var cv = $("p-" + currentView); if (cv) syncVideos(cv); if (C3.kick) C3.kick(); setTimeout(maybeAskPush, 2500); Sfx.open(); };
    if (quiet) { done(); return; }
    if (reduceMotion) done(); else { g.classList.add("leaving"); setTimeout(done, 700); }
    setTimeout(function () {
      toast(isNew ? "Conta criada! Bem-vindo ao Portal Futuro, " + firstName(u.name) + "." : "Bem-vindo de volta, " + firstName(u.name) + ".");
      if (isNew && !reduceMotion && typeof confetti === "function") confetti();
      var b = $("userBtn"); if (b) b.focus({ preventScroll: true });
    }, reduceMotion ? 0 : 720);
  }
  function setTab(which, focus) {
    var login = which === "login";
    $("tabLogin").setAttribute("aria-selected", String(login)); $("tabSignup").setAttribute("aria-selected", String(!login));
    $("tabLogin").tabIndex = login ? 0 : -1; $("tabSignup").tabIndex = login ? -1 : 0;
    $("formLogin").hidden = !login; $("formSignup").hidden = login;
    $("formForgot").hidden = true; $("formReset").hidden = true; document.querySelector(".gate-tabs").hidden = false;
    document.querySelector(".gate-tabs").classList.toggle("signup", !login);
    if (focus) $(login ? "liEmail" : "suName").focus();
  }
  function showExtraForm(id) {
    ["formLogin", "formSignup", "formForgot", "formReset"].forEach(function (f) { $(f).hidden = f !== id; });
    document.querySelector(".gate-tabs").hidden = true;
    var first = $(id).querySelector("input"); if (first) setTimeout(function () { first.focus(); }, 30);
  }
  function okMsg(msgEl, text) { msgEl.className = "gate-msg ok"; msgEl.textContent = text; }
  function cloudLogin(email, pass, remember, btn, msg) {
    if (Date.now() < lockUntil) return fieldErr(null, msg, "Muitas tentativas. Aguarde " + Math.ceil((lockUntil - Date.now()) / 1000) + " segundos e tente de novo.");
    busy(btn, true, "Entrando…");
    return sbReq("POST", "/auth/v1/token?grant_type=password", { email: email, password: pass })
      .then(function (j) { sbSetSession(j, remember); return sbLoadUser(); })
      .then(function (u) { busy(btn, false, "Entrar"); fails = 0; lockUntil = 0; saveLock(); enterSite(u, false); })
      .catch(function (e) {
        busy(btn, false, "Entrar"); sbSess = null; sbStore(null);
        if (e.code === "invalid_credentials" || e.code === "invalid_grant") {
          fails++; if (fails >= 5) { lockUntil = Date.now() + 30000; fails = 0; } saveLock();
          var old = authStore().users.some(function (x) { return x.email === email; });
          return fieldErr($("liPass"), msg, Date.now() < lockUntil ? "Muitas tentativas. Aguarde 30 segundos e tente de novo." : old ? "Essa conta é da versão antiga, que guardava tudo só neste navegador. Crie a conta de novo na aba Criar conta, com o mesmo e-mail: seus dados vão junto." : "E-mail ou senha incorretos.");
        }
        fieldErr(null, msg, cloudMsg(e));
        if (e.code === "email_not_confirmed") addResend(msg, email);
      });
  }
  function addResend(msgEl, email) {
    var b = el("button", { type: "button", class: "link-btn", text: "Reenviar o e-mail de confirmação" });
    b.addEventListener("click", function () {
      b.disabled = true;
      sbReq("POST", "/auth/v1/resend?redirect_to=" + encodeURIComponent(siteUrl()), { type: "signup", email: email })
        .then(function () { okMsg(msgEl, "Enviamos de novo o link de confirmação para " + email + "."); }, function (e) { b.disabled = false; fieldErr(null, msgEl, cloudMsg(e)); });
    });
    msgEl.appendChild(document.createTextNode(" ")); msgEl.appendChild(b);
  }
  function setupCloudUI() {
    $("forgotBtn").hidden = false;
    var g = CFG.google === true && HTTP;
    $("googleBtn").hidden = !g; $("googleBtn2").hidden = !g; $("suOr").hidden = !g; $("gNote1").hidden = !g; $("gNote2").hidden = !g;
    $("suTermsTxt").textContent = "Li e concordo com a política de privacidade: o Portal Futuro guarda meu nome, meu e-mail e o que eu cadastrar, só para o portal funcionar. Posso apagar tudo quando quiser, no meu perfil.";
    $("footDataTxt").textContent = "Os dados da sua conta ficam guardados com segurança no servidor do portal, e só você tem acesso a eles. A conta de demonstração fica só neste navegador. O portal nunca pede CPF nem dados bancários.";
    $("suHeadTxt").textContent = "É gratuito e leva menos de um minuto. Você acessa de qualquer celular ou computador.";
    $("gateLead").textContent = "Crie seu perfil gratuito para organizar provas, gastos, agenda e documentos, e para guardar suas linhas de ônibus e lugares do campus. Tudo fica salvo com segurança e aparece em qualquer aparelho.";
    var note = $("gateNoteTxt"); clear(note);
    note.appendChild(el("strong", { text: "Conta protegida." }));
    note.appendChild(document.createTextNode(" A senha é conferida pelo servidor do portal e nunca fica salva neste aparelho. Só a conta de demonstração continua salva apenas neste navegador."));
    $("forgotBtn").addEventListener("click", function () { $("fgEmail").value = str($("liEmail").value, 120).trim(); $("fgMsg").textContent = ""; showExtraForm("formForgot"); });
    $("googleBtn").addEventListener("click", function () { googleLogin($("googleBtn")); });
    $("googleBtn2").addEventListener("click", function () { googleLogin($("googleBtn2")); });
    $("formForgot").addEventListener("submit", function (e) {
      e.preventDefault();
      var msg = $("fgMsg"), email = str($("fgEmail").value, 120).trim().toLowerCase(), btn = $("fgBtn");
      if (!EMAIL_RE.test(email)) return fieldErr($("fgEmail"), msg, "Digite um e-mail válido.");
      busy(btn, true, "Enviando…");
      sbReq("POST", "/auth/v1/recover?redirect_to=" + encodeURIComponent(siteUrl()), { email: email }).then(function () {
        busy(btn, false, "Enviar link");
        okMsg(msg, "Se existir uma conta com " + email + ", enviamos um link para criar uma senha nova. Confira também o spam.");
      }, function (er) { busy(btn, false, "Enviar link"); fieldErr(null, msg, cloudMsg(er)); });
    });
    $("formReset").addEventListener("submit", function (e) {
      e.preventDefault();
      var msg = $("rsMsg"), btn = $("rsBtn"), p1 = String($("rsPass").value || "").slice(0, 128), p2 = String($("rsPass2").value || "").slice(0, 128);
      if (p1.length < 8 || !/[a-z]/i.test(p1) || !/\d/.test(p1)) return fieldErr($("rsPass"), msg, "A senha precisa ter 8 ou mais caracteres, com letras e números.");
      if (p1 !== p2) return fieldErr($("rsPass2"), msg, "As senhas não são iguais.");
      busy(btn, true, "Salvando…");
      sbAuthed("PUT", "/auth/v1/user", { password: p1 }).then(function () { return sbLoadUser(); }).then(function (u) {
        busy(btn, false, "Salvar senha e entrar"); enterSite(u, false); setTimeout(function () { toast("Senha nova salva. Bem-vindo de volta!"); }, 900);
      }, function (er) { busy(btn, false, "Salvar senha e entrar"); fieldErr(null, msg, cloudMsg(er)); });
    });
  }
  function fieldErr(input, msgEl, text) {
    if (input) { input.setAttribute("aria-invalid", "true"); input.focus(); }
    msgEl.className = "gate-msg"; msgEl.textContent = text;
    var card = document.querySelector(".gate-card");
    if (!reduceMotion) { card.classList.remove("shake"); void card.offsetWidth; card.classList.add("shake"); }
    return false;
  }
  function busy(btn, on, label) { btn.setAttribute("aria-busy", String(on)); btn.disabled = on; if (label) btn.querySelector("span").textContent = label; }

  function doLogin(email, pass, remember, btn, msg) {
    if (Date.now() < lockUntil) return fieldErr(null, msg, "Muitas tentativas. Aguarde " + Math.ceil((lockUntil - Date.now()) / 1000) + " segundos e tente de novo.");
    var u = authStore().users.filter(function (x) { return x.email === email; })[0];
    busy(btn, true, "Entrando…");
    var salt = u ? u.salt : "x-no-user", iter = u ? u.iter : ITER;
    return hashPass(pass, salt, iter).then(function (r) {
      busy(btn, false, "Entrar");
      if (!u || !safeEq(r.hash, u.hash)) {
        fails++; if (fails >= 5) { lockUntil = Date.now() + 30000; fails = 0; } saveLock();
        return fieldErr($("liPass"), msg, Date.now() < lockUntil ? "Muitas tentativas. Aguarde 30 segundos e tente de novo." : "E-mail ou senha incorretos.");
      }
      fails = 0; lockUntil = 0; saveLock();
      setSession(u, remember); enterSite(u, false); return true;
    }).catch(function () { busy(btn, false, "Entrar"); fieldErr(null, msg, "Não foi possível entrar agora. Tente de novo."); });
  }
  function createUser(name, email, inst, pass) {
    var salt = randHex(16);
    return hashPass(pass, salt).then(function (r) {
      var a = authStore();
      if (a.users.some(function (x) { return x.email === email; })) throw new Error("exists");
      var u = { id: "u" + randHex(8), name: name, email: email, inst: inst, salt: salt, hash: r.hash, iter: r.iter, created: new Date().toISOString() };
      a.users.push(u); if (a.users.length > 50) a.users = a.users.slice(-50);
      if (!saveAuth(a)) throw new Error("storage");
      return u;
    });
  }

  function initGate() {
    $("gateYear").textContent = String(Math.max(2026, today.getFullYear()));
    // abas
    $("tabLogin").addEventListener("click", function () { setTab("login", true); });
    $("tabSignup").addEventListener("click", function () { setTab("signup", true); });
    document.querySelector(".gate-tabs").addEventListener("keydown", function (e) {
      if (e.key === "ArrowRight" || e.key === "ArrowLeft") { e.preventDefault(); var toSign = $("tabLogin").getAttribute("aria-selected") === "true"; setTab(toSign ? "signup" : "login", false); $(toSign ? "tabSignup" : "tabLogin").focus(); }
    });
    document.querySelectorAll("[data-go]").forEach(function (b) { b.addEventListener("click", function () { setTab(b.dataset.go, true); }); });
    document.querySelectorAll(".pass-eye").forEach(function (b) {
      b.addEventListener("click", function () { var i = $(b.dataset.for), show = i.type === "password"; i.type = show ? "text" : "password"; b.textContent = show ? "Ocultar" : "Mostrar"; b.setAttribute("aria-pressed", String(show)); b.setAttribute("aria-label", show ? "Ocultar senha" : "Mostrar senha"); });
    });
    document.querySelectorAll(".gate-form input").forEach(function (i) { i.addEventListener("input", function () { i.removeAttribute("aria-invalid"); }); });
    var meter = document.querySelector(".pw-meter"); meter.id = "pwMeterS";
    $("suPass").addEventListener("input", function () { meter.dataset.s = String(pwScore($("suPass").value)); });
    // entrar
    $("formLogin").addEventListener("submit", function (e) {
      e.preventDefault();
      var msg = $("liMsg"), email = str($("liEmail").value, 120).trim().toLowerCase(), pass = String($("liPass").value || "").slice(0, 128);
      if (!EMAIL_RE.test(email)) return fieldErr($("liEmail"), msg, "Digite um e-mail válido.");
      if (!pass) return fieldErr($("liPass"), msg, "Digite sua senha.");
      if (CLOUD && email !== DEMO.email) return cloudLogin(email, pass, $("liRemember").checked, $("liBtn"), msg);
      doLogin(email, pass, $("liRemember").checked, $("liBtn"), msg);
    });
    // criar conta
    $("formSignup").addEventListener("submit", function (e) {
      e.preventDefault();
      var msg = $("suMsg");
      var name = str($("suName").value, 60).replace(/[<>]/g, "").replace(/\s+/g, " ").trim();
      var email = str($("suEmail").value, 120).trim().toLowerCase();
      var inst = str($("suInst").value, 60), p1 = String($("suPass").value || "").slice(0, 128), p2 = String($("suPass2").value || "").slice(0, 128);
      if (name.length < 2) return fieldErr($("suName"), msg, "Digite seu nome (pelo menos 2 letras).");
      if (!EMAIL_RE.test(email)) return fieldErr($("suEmail"), msg, "Digite um e-mail válido, como voce@email.com.");
      if (p1.length < 8 || !/[a-z]/i.test(p1) || !/\d/.test(p1)) return fieldErr($("suPass"), msg, "A senha precisa ter 8 ou mais caracteres, com letras e números.");
      if (p1.toLowerCase().indexOf(email.split("@")[0]) >= 0 && email.split("@")[0].length > 3) return fieldErr($("suPass"), msg, "Evite usar seu e-mail dentro da senha.");
      if (p1 !== p2) return fieldErr($("suPass2"), msg, "As senhas não são iguais.");
      if (!$("suTerms").checked) return fieldErr($("suTerms"), msg, "Marque a confirmação para continuar.");
      if (email === DEMO.email) return fieldErr($("suEmail"), msg, "Esse e-mail é da conta de demonstração. Use outro.");
      if (CLOUD) {
        var cb = $("suBtn"); busy(cb, true, "Criando sua conta…");
        sbReq("POST", "/auth/v1/signup?redirect_to=" + encodeURIComponent(siteUrl()), { email: email, password: p1, data: { name: name, inst: inst, privacy_accepted: new Date().toISOString(), privacy_version: "2026-10-20" } }).then(function (j) {
          busy(cb, false, "Criar conta e entrar");
          if (j && j.access_token) { sbSetSession(j, true); return sbLoadUser().then(function (u) { enterSite(u, true); }); }
          var usr = (j && j.user) || j || {};
          if (Array.isArray(usr.identities) && usr.identities.length === 0) return fieldErr($("suEmail"), msg, "Já existe uma conta com esse e-mail. Use a aba Entrar ou \u201cEsqueci minha senha\u201d.");
          $("formSignup").reset(); $("pwMeterS").dataset.s = "0";
          okMsg(msg, "Quase lá! Enviamos um link de confirmação para " + email + ". Abra o e-mail e toque no link para entrar. Confira também o spam.");
        }).catch(function (er) { busy(cb, false, "Criar conta e entrar"); fieldErr(null, msg, cloudMsg(er)); });
        return;
      }
      if (authStore().users.some(function (x) { return x.email === email; })) return fieldErr($("suEmail"), msg, "Já existe uma conta com esse e-mail neste navegador. Use a aba Entrar.");
      var btn = $("suBtn"); busy(btn, true, "Criando sua conta…");
      createUser(name, email, inst, p1).then(function (u) {
        busy(btn, false, "Criar conta e entrar");
        setSession(u, true); enterSite(u, true);
      }).catch(function (err) {
        busy(btn, false, "Criar conta e entrar");
        fieldErr(null, msg, err && err.message === "exists" ? "Já existe uma conta com esse e-mail." : "Não foi possível salvar a conta. Verifique se o navegador permite armazenamento local.");
      });
    });
    // conta de demonstração
    $("demoBtn").addEventListener("click", function () {
      var msg = $("liMsg"), btn = $("demoBtn");
      var have = authStore().users.some(function (x) { return x.email === DEMO.email; });
      btn.disabled = true;
      (have ? Promise.resolve() : createUser(DEMO.name, DEMO.email, DEMO.inst, DEMO.pass)).then(function () {
        $("liEmail").value = DEMO.email; $("liPass").value = DEMO.pass;
        return doLogin(DEMO.email, DEMO.pass, false, $("liBtn"), msg);
      }).then(function () { btn.disabled = false; }, function () { btn.disabled = false; fieldErr(null, msg, "Não foi possível abrir a demonstração."); });
    });
    // menu da conta
    initProfile();
    // sessão existente? Com conta conectada, o portal abre direto (só a tela rápida de carregamento aparece)
    var splash = $("splash"), splashDone = false;
    function hideSplash() {
      if (splashDone) return; splashDone = true;
      if (reduceMotion) { splash.hidden = true; return; }
      splash.classList.add("out"); setTimeout(function () { splash.hidden = true; }, 380);
    }
    setTimeout(function () { if (!splashDone) { if (!currentUser) showGate(); hideSplash(); } }, 12000); // nunca fica preso no carregamento
    function localStart() {
      var u = getSession();
      if (u) { loadUserData(u); applyUser(u); $("gate").hidden = true; lockPage(false); }
      else showGate();
      hideSplash();
    }
    if (CLOUD) {
      setupCloudUI();
      sbSess = sbRead();
      sbHandleReturn().then(function (ret) {
        if (ret && ret.error) { localStart(); if (!currentUser) fieldErr(null, $("liMsg"), ret.error); return; }
        if (!sbSess) { localStart(); return; }
        if (ret && ret.type === "recovery") { showGate(); showExtraForm("formReset"); hideSplash(); return; }
        return sbLoadUser().then(function (u) {
          enterSite(u, !!(ret && ret.type === "signup"), !ret);
          hideSplash();
        }, function (e) {
          if (e.status === 401 || e.status === 403) { sbSess = null; sbStore(null); }
          showGate();
          fieldErr(null, $("liMsg"), e.code === "network" ? cloudMsg(e) : "Entre de novo para continuar.");
          hideSplash();
        });
      }).catch(function () { if (!currentUser) showGate(); hideSplash(); });
    } else localStart();
    // outra aba saiu da conta
    window.addEventListener("storage", function (e) {
      if (e.key === SESS_KEY && !getSession() && currentUser && !currentUser.cloud) { applyUser(null); clearUserData(); showGate(); }
      if (e.key === SB_SESS && currentUser && currentUser.cloud && !sbRead()) { sbSess = null; applyUser(null); clearUserData(); $("heroHello").hidden = true; showGate(); }
    });
  }

  /* ---------- Dados de cada conta ---------- */
  function refreshData() {
    loadingData = true;
    try {
      calc = state.calc || [{ n: "6.5", p: "1" }, { n: "", p: "1" }, { n: "", p: "2" }];
      finYM = iso(today).slice(0, 7); sampleHidden = false;
      renderAll(); renderDocs(); renderCalc(); renderBus(); renderBusFav(); renderFavs(); renderWeek();
      if (curZone) showZone(curZone.id, false);
      updateSampleBar();
      if (currentView === "perfil") renderProfile();
    } finally { loadingData = false; }
  }
  function loadUserData(u) {
    if (u.cloud) { currentUser = u; return loadCloudData(u); }
    dataKey = KEY + "." + u.id;
    var s = readState(dataKey);
    if (!s) {
      // Dados da versão antiga (de antes das contas separadas): só passam para a conta
      // se ela for a única deste navegador, para não entregar os dados de alguém a outra pessoa.
      if (legacy && authStore().users.length === 1) { s = legacy; try { localStorage.removeItem(KEY); } catch (e) {} legacy = null; }
      else s = u.email === DEMO.email ? seed() : sanitize({}); // exemplos só na conta de demonstração
    }
    state = sanitize(s); save(); refreshData(); // sanitize garante todos os campos (favoritos, semana do campus)
  }
  function clearUserData() { dataKey = null; state = sanitize({}); refreshData(); }

  /* ---------- Perfil ---------- */
  function sessionExp() { var s = readJSON(sessionStorage, SESS_KEY) || readJSON(localStorage, SESS_KEY); return s && s.exp > Date.now() ? s.exp : 0; }
  function updateUser(id, fn) {
    var a = authStore(), u = a.users.filter(function (x) { return x.id === id; })[0];
    if (!u) return null;
    fn(u);
    return saveAuth(a) ? u : null;
  }
  var fmtFull = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
  var fmtStamp = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  var fmtSince = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" });
  var pfAreas = [];
  function profileChecks(u) {
    return [
      { ok: u.name.length >= 2, t: "Nome", f: "pfName" },
      { ok: !!u.inst, t: "Onde estuda", f: "pfInst" },
      { ok: !!u.city, t: "Cidade", f: "pfCity" },
      { ok: !!u.course, t: "Curso", f: "pfCourse" },
      { ok: u.areas.length > 0, t: "Áreas de interesse", f: "pfAreas" }
    ];
  }
  /* Números do portal: o servidor só responde para a conta do dono (tabela portal_owners); para os outros, a seção nem aparece */
  var numLoaded = 0, numUid = null;
  function loadPortalNumbers(force) {
    var box = $("pf-numeros");
    if (!currentUser || !currentUser.cloud) { box.hidden = true; numUid = null; return; }
    if (numUid !== currentUser.id) { box.hidden = true; numUid = currentUser.id; force = true; }
    if (!force && Date.now() - numLoaded < 60000) return;
    numLoaded = Date.now();
    var uid = currentUser.id;
    sbAuthed("POST", "/rest/v1/rpc/portal_stats", {}).then(function (s) {
      if (!currentUser || currentUser.id !== uid) return;
      if (!s || typeof s !== "object") { box.hidden = true; return; }
      var n = function (k) { var v = Number(s[k]); return isFinite(v) ? v : 0; };
      var grid = $("pfNumGrid"); clear(grid);
      [["Contas criadas", n("contas"), n("confirmadas") + " com e-mail confirmado"],
       ["Com Google", n("google"), "entraram pela conta Google"],
       ["Novas na semana", n("novas7"), n("novas30") + " nos últimos 30 dias"],
       ["Ativas na semana", n("ativas7"), "salvaram algo nos últimos 7 dias"],
       ["Usando as ferramentas", n("comDados"), "contas com dados salvos"],
       ["Sugestões", n("sugestoes"), "enviadas pelo botão do site"]].forEach(function (c) {
        var d = el("div", { class: "stat" });
        var top = el("span", { class: "top" }); top.appendChild(el("span", { class: "label", text: c[0] }));
        d.appendChild(top); d.appendChild(el("span", { class: "v", text: String(c[1]) })); d.appendChild(el("span", { class: "s", text: c[2] }));
        grid.appendChild(d);
      });
      var weeks = Array.isArray(s.semanas) ? s.semanas.slice(-8) : [], max = 1, bars = $("pfNumBars"); clear(bars);
      weeks.forEach(function (w) { max = Math.max(max, Number(w.contas) || 0); });
      weeks.forEach(function (w) {
        var v = Number(w.contas) || 0, b = el("div", { class: "pf-bar" }), bar = el("i");
        bar.style.height = Math.round(v / max * 100) + "%";
        b.appendChild(el("b", { text: String(v) })); b.appendChild(bar); b.appendChild(el("span", { text: String(w.semana || "") }));
        bars.appendChild(b);
      });
      bars.setAttribute("aria-label", "Contas novas por semana: " + weeks.map(function (w) { return "semana de " + w.semana + ", " + (Number(w.contas) || 0); }).join("; "));
      var when = s.geradoEm ? new Date(s.geradoEm) : new Date();
      $("pfNumWhen").textContent = "Atualizado em " + fmtStamp.format(isNaN(when) ? new Date() : when).replace(",", " às") + ".";
      box.hidden = false;
    }).catch(function () { box.hidden = true; numLoaded = 0; });
  }

  function renderProfile() {
    if (!currentUser) return;
    loadPortalNumbers(false);
    renderPush();
    // conta local: relê do armazenamento, assim os campos novos do perfil sempre existem e estão validados
    var u = currentUser.cloud ? currentUser : authStore().users.filter(function (x) { return x.id === currentUser.id; })[0];
    if (!u) return;
    currentUser = u;
    $("pfAv").textContent = initials(u.name); $("pfCardIni").textContent = initials(u.name);
    $("h-perfil").textContent = u.name;
    var since = u.created && !isNaN(new Date(u.created)) ? new Date(u.created) : null;
    $("pfLead").textContent = (since ? "No Portal Futuro desde " + fmtSince.format(since) + ". " : "") + "Aqui ficam seus dados, sua segurança e um resumo do que você organiza no portal.";
    var chips = $("pfChips"); clear(chips);
    [u.inst === "Ainda estou no ensino médio" ? "Ensino médio" : u.inst, u.city, u.course].filter(Boolean).forEach(function (c) { chips.appendChild(el("span", { class: "tag", text: c })); });
    // perfil completo
    var checks = profileChecks(u), done = checks.filter(function (c) { return c.ok; }).length, C = 2 * Math.PI * 36;
    $("pfRing").style.strokeDasharray = C.toFixed(2); $("pfRing").style.strokeDashoffset = (C * (1 - done / checks.length)).toFixed(2);
    $("pfPct").textContent = Math.round(done / checks.length * 100) + "%";
    var todo = $("pfTodo"); clear(todo);
    checks.forEach(function (c) {
      var li = el("li", { class: c.ok ? "ok" : "" });
      if (c.ok) li.textContent = c.t;
      else li.appendChild(el("button", { type: "button", text: "Adicionar " + c.t.toLowerCase(), onclick: function () { var f = $(c.f); f.scrollIntoView({ block: "center", behavior: reduceMotion ? "auto" : "smooth" }); var tgt = c.f === "pfAreas" ? f.querySelector("button") : f; if (tgt) setTimeout(function () { tgt.focus({ preventScroll: true }); }, reduceMotion ? 0 : 400); } }));
      todo.appendChild(li);
    });
    // resumo das ferramentas
    var up = state.provas.filter(function (p) { var d = daysUntil(p.data); return d >= 0 && d <= 30; }).sort(function (a, b) { return a.data < b.data ? -1 : 1; });
    $("pfProvas").textContent = String(up.length);
    $("pfProvasSub").textContent = up.length ? "nos próximos 30 dias · a próxima " + rel(daysUntil(up[0].data)) : "nenhuma nos próximos 30 dias";
    var pend = state.ativ.filter(function (a) { return !a.done; }), late = pend.filter(function (a) { return daysUntil(a.data) < 0; }).length;
    $("pfAtiv").textContent = String(pend.length); $("pfAtivSub").textContent = late ? late + " atrasada(s)" : "nenhuma atrasada";
    var t = monthTotals(iso(today).slice(0, 7));
    $("pfSaldo").textContent = BRL.format(t.bal); $("pfSaldo").className = "v " + (t.bal >= 0 ? "pos" : "neg");
    $("pfSaldoSub").textContent = (t.inn ? "de " + BRL.format(t.inn) + " recebidos" : "lance suas entradas") + " em " + fmtMonth.format(today).split(" ")[0];
    $("pfDocs").textContent = Object.keys(state.docs).length + " de " + DOCS.length;
    var bus = state.busFav || [];
    $("pfBus").textContent = String(bus.length); $("pfBusSub").textContent = bus.length ? "linhas " + bus.slice(0, 4).join(", ") + (bus.length > 4 ? "…" : "") : "salve linhas na página Ônibus";
    $("pfCampus").textContent = String((state.campusFav || []).length);
    // formulário
    $("pfName").value = u.name; $("pfEmail").value = u.email;
    $("pfInst").value = INSTS.indexOf(u.inst) >= 0 ? u.inst : ""; $("pfCity").value = CITIES.indexOf(u.city) >= 0 ? u.city : "";
    $("pfCourse").value = u.course || ""; pfAreas = u.areas.slice(); renderAreas();
    $("pfErr").textContent = "";
    // sessão
    $("pfCreated").textContent = since ? fmtFull.format(since) : "–";
    var exp = sessionExp(); $("pfExp").textContent = u.cloud ? (sbSess && sbSess.remember ? "Renovada sozinha enquanto você usa o portal" : "Até você fechar o navegador") : exp ? fmtStamp.format(new Date(exp)).replace(",", " às") : "–";
    $("pfPassKind").textContent = u.cloud ? (u.hasPassword ? "Protegida no servidor (bcrypt)" : "Login pela conta Google") : "Código protegido (PBKDF2-SHA-256)";
    $("pfSyncRow").hidden = !u.cloud; if (u.cloud) setSync(syncFlag);
    $("pfPrivNote").textContent = u.cloud ? "Sua conta e o que você cadastra ficam guardados no servidor do Portal Futuro (Supabase), protegidos por regras que só deixam você acessar os seus dados." : "Nesta versão, sua conta e tudo o que você cadastra ficam só neste navegador, separados das outras contas. Nada é enviado para servidores.";
    var googleOnly = u.cloud && !u.hasPassword;
    $("pfDelLbl").textContent = googleOnly ? "Digite APAGAR para confirmar" : "Digite sua senha para confirmar";
    $("pfDelPass").type = googleOnly ? "text" : "password"; $("pfDelPass").autocomplete = googleOnly ? "off" : "current-password";
    var demo = u.email === DEMO.email, noPass = demo || googleOnly;
    $("pfPassForm").classList.toggle("is-demo", noPass);
    ["pfOld", "pfNew", "pfNew2", "pfPassBtn"].forEach(function (id) { $(id).disabled = noPass; });
    $("pfPassErr").className = noPass ? "small muted" : "form-error";
    $("pfPassErr").textContent = demo ? "A conta de demonstração não pode trocar de senha. Crie sua própria conta para usar esta opção." : googleOnly ? "Você entra com o Google, então não há senha do Portal Futuro para trocar." : "";
  }
  function renderAreas() {
    var box = $("pfAreas"); clear(box);
    AREAS.forEach(function (a) {
      var on = pfAreas.indexOf(a) >= 0;
      box.appendChild(el("button", { type: "button", "aria-pressed": String(on), text: a, onclick: function () {
        var i = pfAreas.indexOf(a);
        if (i >= 0) pfAreas.splice(i, 1);
        else if (pfAreas.length >= 4) { toast("Escolha até 4 áreas. Desmarque uma para trocar."); return; }
        else pfAreas.push(a);
        renderAreas(); var b = box.querySelectorAll("button")[AREAS.indexOf(a)]; if (b) b.focus();
      } }));
    });
  }
  function initProfile() {
    $("userBtn").addEventListener("click", function () { if (location.hash === "#perfil") route("perfil", false); else location.hash = "perfil"; });
    $("pfForm").addEventListener("submit", function (e) {
      e.preventDefault();
      var err = $("pfErr"), name = str($("pfName").value, 60).replace(/[<>]/g, "").replace(/\s+/g, " ").trim();
      $("pfName").removeAttribute("aria-invalid");
      if (name.length < 2) { err.textContent = "Digite seu nome (pelo menos 2 letras)."; $("pfName").setAttribute("aria-invalid", "true"); $("pfName").focus(); return; }
      var inst = INSTS.indexOf($("pfInst").value) >= 0 ? $("pfInst").value : "", city = CITIES.indexOf($("pfCity").value) >= 0 ? $("pfCity").value : "";
      var course = str($("pfCourse").value, 60).replace(/[<>]/g, "").replace(/\s+/g, " ").trim();
      if (currentUser.cloud) {
        var btnS = $("pfSave"); btnS.disabled = true;
        var patch = { name: name, inst: inst || null, city: city || null, course: course || null, areas: pfAreas.slice(0, 4) };
        sbAuthed("PATCH", "/rest/v1/profiles?id=eq." + currentUser.id, patch, "return=minimal").then(function () {
          btnS.disabled = false; err.textContent = "";
          currentUser.name = name; currentUser.inst = inst; currentUser.city = city; currentUser.course = course; currentUser.areas = pfAreas.slice(0, 4);
          applyUser(currentUser); renderProfile(); toast("Perfil atualizado.");
        }, function (e) { btnS.disabled = false; err.textContent = cloudMsg(e, "Não foi possível salvar agora. Tente de novo."); });
        return;
      }
      var u = updateUser(currentUser.id, function (x) { x.name = name; x.inst = inst; x.city = city; x.course = course; x.areas = pfAreas.slice(0, 4); });
      if (!u) { err.textContent = "Não foi possível salvar. Verifique se o navegador permite armazenamento local."; return; }
      err.textContent = ""; applyUser(authStore().users.filter(function (x) { return x.id === u.id; })[0]); renderProfile();
      toast("Perfil atualizado.");
    });
    $("pfNew").addEventListener("input", function () { $("pfMeter").dataset.s = String(pwScore($("pfNew").value)); });
    $("pfPassForm").addEventListener("submit", function (e) {
      e.preventDefault();
      var msg = $("pfPassErr"), u = currentUser, btn = $("pfPassBtn");
      var o = String($("pfOld").value || "").slice(0, 128), n1 = String($("pfNew").value || "").slice(0, 128), n2 = String($("pfNew2").value || "").slice(0, 128);
      var fail = function (input, text) { msg.className = "form-error"; msg.textContent = text; if (input) { input.setAttribute("aria-invalid", "true"); input.focus(); } };
      ["pfOld", "pfNew", "pfNew2"].forEach(function (id) { $(id).removeAttribute("aria-invalid"); });
      if (!u || u.email === DEMO.email) return;
      if (Date.now() < lockUntil) return fail(null, "Muitas tentativas. Aguarde " + Math.ceil((lockUntil - Date.now()) / 1000) + " segundos e tente de novo.");
      if (!o) return fail($("pfOld"), "Digite sua senha atual.");
      if (n1.length < 8 || !/[a-z]/i.test(n1) || !/\d/.test(n1)) return fail($("pfNew"), "A nova senha precisa ter 8 ou mais caracteres, com letras e números.");
      if (n1 === o) return fail($("pfNew"), "A nova senha precisa ser diferente da atual.");
      if (n1 !== n2) return fail($("pfNew2"), "As senhas novas não são iguais.");
      busy(btn, true, "Trocando…");
      if (u.cloud) {
        if (!u.hasPassword) { busy(btn, false, "Trocar senha"); return; }
        var rem = sbSess ? sbSess.remember : true;
        sbReq("POST", "/auth/v1/token?grant_type=password", { email: u.email, password: o })
          .then(function (j) { fails = 0; lockUntil = 0; saveLock(); sbSetSession(j, rem); return sbAuthed("PUT", "/auth/v1/user", { password: n1 }); })
          .then(function () { busy(btn, false, "Trocar senha"); $("pfPassForm").reset(); $("pfMeter").dataset.s = "0"; msg.textContent = ""; toast("Senha trocada. Use a nova senha no próximo login."); })
          .catch(function (er) {
            busy(btn, false, "Trocar senha");
            if (er.code === "invalid_credentials" || er.code === "invalid_grant") { fails++; if (fails >= 5) { lockUntil = Date.now() + 30000; fails = 0; } saveLock(); return fail($("pfOld"), Date.now() < lockUntil ? "Muitas tentativas. Aguarde 30 segundos e tente de novo." : "A senha atual está incorreta."); }
            fail(null, cloudMsg(er));
          });
        return;
      }
      hashPass(o, u.salt, u.iter).then(function (r) {
        if (!safeEq(r.hash, u.hash)) {
          fails++; if (fails >= 5) { lockUntil = Date.now() + 30000; fails = 0; } saveLock();
          throw new Error("wrong");
        }
        fails = 0; lockUntil = 0; saveLock();
        var salt = randHex(16);
        return hashPass(n1, salt).then(function (h) {
          var nu = updateUser(u.id, function (x) { x.salt = salt; x.hash = h.hash; x.iter = h.iter; });
          if (!nu) throw new Error("storage");
          currentUser = authStore().users.filter(function (x) { return x.id === u.id; })[0];
        });
      }).then(function () {
        busy(btn, false, "Trocar senha"); $("pfPassForm").reset(); $("pfMeter").dataset.s = "0";
        msg.className = "form-error ok-msg"; msg.textContent = ""; toast("Senha trocada. Use a nova senha no próximo login.");
      }).catch(function (er) {
        busy(btn, false, "Trocar senha");
        fail(er && er.message === "wrong" ? $("pfOld") : null, er && er.message === "wrong" ? (Date.now() < lockUntil ? "Muitas tentativas. Aguarde 30 segundos e tente de novo." : "A senha atual está incorreta.") : "Não foi possível trocar a senha agora.");
      });
    });
    $("pfLogout").addEventListener("click", function () { if (currentUser && currentUser.cloud) sbSignOut(); clearSession(); applyUser(null); clearUserData(); $("heroHello").hidden = true; location.hash = "inicio"; showGate(); toast("Você saiu da sua conta."); });
    $("pfExport").addEventListener("click", function () {
      var u = currentUser; if (!u) return;
      var data = { app: "Portal Futuro", exportado: new Date().toISOString(),
        perfil: { nome: u.name, email: u.email, instituicao: u.inst, cidade: u.city, curso: u.course, areas: u.areas, criado: u.created },
        financas: state.fin, provas: state.provas, agenda: state.ativ, documentos: Object.keys(state.docs).map(function (i) { return DOCS[i]; }),
        linhasSalvas: state.busFav, lugaresFavoritos: state.campusFav };
      var blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      var a = el("a", { href: URL.createObjectURL(blob), download: "portal-futuro-" + firstName(u.name).toLowerCase().replace(/[^a-z0-9]+/gi, "") + "-" + iso(today) + ".json" });
      document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
      toast("Cópia dos seus dados baixada.");
    });
    $("pfDelAsk").addEventListener("click", function () { $("pfDelForm").hidden = false; $("pfDelAsk").hidden = true; $("pfDelPass").focus(); });
    $("pfDelNo").addEventListener("click", function () { $("pfDelForm").reset(); $("pfDelForm").hidden = true; $("pfDelAsk").hidden = false; $("pfDelErr").textContent = ""; $("pfDelAsk").focus(); });
    $("pfDelForm").addEventListener("submit", function (e) {
      e.preventDefault();
      var u = currentUser, msg = $("pfDelErr"), pass = String($("pfDelPass").value || "").slice(0, 128), btn = $("pfDelYes");
      if (!u) return;
      if (Date.now() < lockUntil) { msg.textContent = "Muitas tentativas. Aguarde " + Math.ceil((lockUntil - Date.now()) / 1000) + " segundos."; return; }
      if (!pass) { msg.textContent = u.cloud && !u.hasPassword ? "Digite APAGAR para confirmar." : "Digite sua senha para confirmar."; $("pfDelPass").focus(); return; }
      busy(btn, true, "Apagando…");
      if (u.cloud) {
        var check = u.hasPassword
          ? sbReq("POST", "/auth/v1/token?grant_type=password", { email: u.email, password: pass }).then(function (j) { sbSetSession(j, sbSess ? sbSess.remember : true); })
          : (pass.trim().toUpperCase() === "APAGAR" ? Promise.resolve() : Promise.reject(sbErr(0, "confirm")));
        check.then(function () { return sbAuthed("POST", "/rest/v1/rpc/delete_my_account", {}); }).then(function () {
          busy(btn, false, "Apagar definitivamente");
          $("pfDelForm").reset(); $("pfDelForm").hidden = true; $("pfDelAsk").hidden = false; msg.textContent = "";
          sbSignOut(); clearSession(); applyUser(null); clearUserData(); $("heroHello").hidden = true; location.hash = "inicio"; showGate();
          toast("Sua conta e todos os seus dados foram apagados do servidor.");
        }).catch(function (er) {
          busy(btn, false, "Apagar definitivamente");
          if (er.code === "invalid_credentials" || er.code === "invalid_grant") { fails++; if (fails >= 5) { lockUntil = Date.now() + 30000; fails = 0; } saveLock(); msg.textContent = "Senha incorreta."; }
          else msg.textContent = er.code === "confirm" ? "Digite APAGAR para confirmar." : cloudMsg(er, "Não foi possível apagar agora. Tente de novo.");
          $("pfDelPass").focus();
        });
        return;
      }
      hashPass(pass, u.salt, u.iter).then(function (r) {
        busy(btn, false, "Apagar definitivamente");
        if (!safeEq(r.hash, u.hash)) { fails++; if (fails >= 5) { lockUntil = Date.now() + 30000; fails = 0; } saveLock(); msg.textContent = "Senha incorreta."; $("pfDelPass").focus(); return; }
        var a = authStore(); a.users = a.users.filter(function (x) { return x.id !== u.id; }); saveAuth(a);
        try { localStorage.removeItem(KEY + "." + u.id); } catch (e) {}
        dataKey = null;
        $("pfDelForm").reset(); $("pfDelForm").hidden = true; $("pfDelAsk").hidden = false; msg.textContent = "";
        clearSession(); applyUser(null); clearUserData(); $("heroHello").hidden = true; location.hash = "inicio"; showGate();
        toast("Sua conta e os dados dela foram apagados deste navegador.");
      }).catch(function () { busy(btn, false, "Apagar definitivamente"); msg.textContent = "Não foi possível apagar agora. Tente de novo."; });
    });
  }

  /* ---------- Política de privacidade ---------- */
  var openPrivacy = function () {};
  (function () {
    var d = $("privDialog"), opener = null;
    function close() { if (d.open) d.close(); if (location.hash === "#privacidade") { try { history.replaceState(null, "", location.pathname + (currentView ? "#" + currentView : "")); } catch (e) {} } }
    openPrivacy = function () {
      document.body.classList.remove("has-cursor");
      if (!d.open) { if (typeof d.showModal === "function") d.showModal(); else d.setAttribute("open", ""); }
      d.querySelector(".priv-body").scrollTop = 0; $("privOk").focus();
    };
    document.querySelectorAll("[data-priv]").forEach(function (b) {
      b.addEventListener("click", function () {
        opener = b; openPrivacy();
      });
    });
    $("privClose").addEventListener("click", close); $("privOk").addEventListener("click", close);
    d.addEventListener("click", function (e) { if (e.target === d) close(); });
    d.addEventListener("close", function () { if (opener) opener.focus(); });
  })();

  /* ---------- Dar opinião (sugestões e problemas) ---------- */
  (function () {
    var d = $("fbDialog"), fab = $("fbOpen"), form = $("fbForm"), FB_KEY = "portalFuturo.fb";
    if (!CLOUD) { fab.hidden = true; return; }
    function sentLog() { var a = readJSON(localStorage, FB_KEY); return Array.isArray(a && a.t) ? a.t.filter(function (x) { return typeof x === "number" && Date.now() - x < 36e5; }) : []; }
    function resetForm() {
      form.reset(); $("fbErr").textContent = ""; $("fbCount").textContent = "0 de 1000";
      var logged = currentUser && currentUser.cloud && currentUser.email;
      $("fbReplyTxt").textContent = logged ? "Pode me responder no e-mail " + currentUser.email : "Quero receber resposta por e-mail";
      $("fbMailWrap").hidden = true;
      var done = d.querySelector(".fb-done"); if (done) done.remove();
      d.querySelector(".fb-body").hidden = false; d.querySelector(".priv-foot").hidden = false;
    }
    function open() {
      resetForm(); document.body.classList.remove("has-cursor");
      if (typeof d.showModal === "function") d.showModal(); else d.setAttribute("open", "");
      setTimeout(function () { $("fbMsg").focus(); }, 30);
    }
    function close() { if (d.open) d.close(); }
    fab.addEventListener("click", open);
    $("fbClose").addEventListener("click", close); $("fbCancel").addEventListener("click", close);
    d.addEventListener("click", function (e) { if (e.target === d) close(); });
    d.addEventListener("close", function () { fab.focus(); });
    $("fbMsg").addEventListener("input", function () { $("fbCount").textContent = $("fbMsg").value.length + " de 1000"; if ($("fbMsg").value.length >= 5) $("fbErr").textContent = ""; });
    $("fbMail").addEventListener("input", function () { $("fbErr").textContent = ""; });
    $("fbReply").addEventListener("change", function () {
      var logged = currentUser && currentUser.cloud && currentUser.email;
      $("fbMailWrap").hidden = !$("fbReply").checked || !!logged;
      if (!$("fbMailWrap").hidden) $("fbMail").focus();
    });
    d.querySelectorAll('input[name="fbKind"]').forEach(function (r) {
      r.addEventListener("change", function () {
        $("fbMsgLbl").textContent = r.value === "problema" ? "O que aconteceu? Conte o que você fez antes do problema" : r.value === "elogio" ? "O que você gostou?" : "Sua mensagem";
      });
    });
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var err = $("fbErr"), btn = $("fbSend");
      var kind = (d.querySelector('input[name="fbKind"]:checked') || {}).value || "sugestao";
      var msg = str($("fbMsg").value, 1000).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");
      if (msg.length < 5) { err.textContent = "Escreva pelo menos algumas palavras."; $("fbMsg").focus(); return; }
      var contact = null, logged = currentUser && currentUser.cloud && currentUser.email;
      if ($("fbReply").checked) {
        contact = logged ? currentUser.email : str($("fbMail").value, 120).trim().toLowerCase();
        if (!EMAIL_RE.test(contact)) { err.textContent = "Digite um e-mail válido para a resposta, ou desmarque a opção."; $("fbMail").focus(); return; }
      }
      var log = sentLog();
      if (log.length && Date.now() - log[log.length - 1] < 60000) { err.textContent = "Você acabou de enviar uma mensagem. Aguarde um minuto para mandar outra."; return; }
      if (log.length >= 5) { err.textContent = "Você já enviou várias mensagens nesta hora. Obrigado! Tente de novo mais tarde."; return; }
      var finish = function () {
        log.push(Date.now()); writeJSON(localStorage, FB_KEY, { t: log });
        d.querySelector(".fb-body").hidden = true; d.querySelector(".priv-foot").hidden = true;
        var box = el("div", { class: "fb-done", role: "status" }, [
          el("span", { class: "ib" }, []),
          el("h3", { text: "Mensagem enviada. Obrigado!" }),
          el("p", { class: "muted", text: contact ? "Sua opinião chegou ao criador do portal. Se precisar, a resposta vai para " + contact + "." : "Sua opinião chegou ao criador do portal e ajuda a deixar tudo melhor." }),
          el("button", { class: "btn", type: "button", text: "Fechar", onclick: close })
        ]);
        var ns = "http://www.w3.org/2000/svg", sv = document.createElementNS(ns, "svg"), u = document.createElementNS(ns, "path");
        sv.setAttribute("class", "ico"); sv.setAttribute("viewBox", "0 0 24 24"); u.setAttribute("d", "M5 12l5 5 9-10"); sv.appendChild(u); box.firstChild.appendChild(sv);
        form.appendChild(box); box.querySelector("button").focus();
      };
      if (str($("fbSite").value, 50)) { finish(); return; } // campo-armadilha preenchido: provável robô
      var body = { kind: kind, message: msg, page: /^[a-z-]{1,30}$/.test(currentView || "") ? currentView : null, contact: contact };
      busy(btn, true, "Enviando…"); err.textContent = "";
      var req = logged && sbSess ? sbAuthed("POST", "/rest/v1/feedback", body, "return=minimal") : sbReq("POST", "/rest/v1/feedback", body, { prefer: "return=minimal" });
      req.then(function () { busy(btn, false, "Enviar"); finish(); }, function (er) { busy(btn, false, "Enviar"); err.textContent = cloudMsg(er, "Não foi possível enviar agora. Tente de novo em instantes."); });
    });
  })();

  $("pfNumRefresh").addEventListener("click", function () { loadPortalNumbers(true); });

  /* Pular para o conteúdo: leva o foco para o título da página aberta (sem trocar o endereço) */
  $("skipLink").addEventListener("click", function (e) {
    e.preventDefault();
    var v = document.querySelector("section.view:not([hidden])"), h = v && v.querySelector("h1");
    if (h) { h.setAttribute("tabindex", "-1"); h.focus(); }
  });

  /* ---------- Cronômetro de estudo (Pomodoro) ---------- */
  (function () {
    var MODES = { foco: { min: 25, label: "Foco" }, curta: { min: 5, label: "Pausa curta" }, longa: { min: 15, label: "Pausa longa" } };
    var POMO_KEY = "portalFuturo.pomo", mode = "foco", total = 25 * 60, left = total, endAt = 0, timer = null, baseTitle = document.title;
    var ring = $("pmRing"), C = 2 * Math.PI * 52, box = document.querySelector(".pomo");
    if (!ring) return;
    ring.style.strokeDasharray = C.toFixed(2);
    function todayCount() { var s = readJSON(localStorage, POMO_KEY); return s && s.d === iso(today) ? Number(s.n) || 0 : 0; }
    function addCount() { var n = todayCount() + 1; writeJSON(localStorage, POMO_KEY, { d: iso(today), n: n }); return n; }
    function fmt(s) { return String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0"); }
    function paint() {
      $("pmTime").textContent = fmt(left); $("pmLabel").textContent = MODES[mode].label;
      ring.style.strokeDashoffset = (C * (1 - left / total)).toFixed(2);
      box.classList.toggle("pause", mode !== "foco");
      var n = todayCount(); $("pmCount").textContent = n ? n + (n === 1 ? " bloco de foco concluído hoje." : " blocos de foco concluídos hoje.") + (n % 4 === 0 ? " Hora de uma pausa longa!" : "") : "Nenhum bloco de foco concluído hoje.";
      document.title = timer ? fmt(left) + " · " + MODES[mode].label + " · Portal Futuro" : baseTitle;
    }
    function setBtn() { $("pmStart").querySelector("span").textContent = timer ? "Pausar" : left < total ? "Continuar" : "Começar"; }
    function setMode(m) {
      stop(); mode = m; total = MODES[m].min * 60; left = total;
      document.querySelectorAll("[data-pm]").forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.pm === m)); });
      paint(); setBtn();
    }
    function beep() {
      try {
        var A = window.AudioContext || window.webkitAudioContext; if (!A) return;
        var ctx = new A(); [0, .35, .7].forEach(function (t0) {
          var o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.value = mode === "foco" ? 660 : 880; o.connect(g); g.connect(ctx.destination);
          g.gain.setValueAtTime(.0001, ctx.currentTime + t0); g.gain.exponentialRampToValueAtTime(.25, ctx.currentTime + t0 + .02); g.gain.exponentialRampToValueAtTime(.0001, ctx.currentTime + t0 + .28);
          o.start(ctx.currentTime + t0); o.stop(ctx.currentTime + t0 + .3);
        });
        setTimeout(function () { ctx.close(); }, 1500);
      } catch (e) {}
    }
    function finish() {
      stop(); beep();
      var next;
      if (mode === "foco") { var n = addCount(); next = n % 4 === 0 ? "longa" : "curta"; $("pmLive").textContent = "Bloco de foco concluído. Hora da pausa."; toast("Bloco de foco concluído. Hora da pausa!"); }
      else { next = "foco"; $("pmLive").textContent = "Pausa terminada. Vamos para o próximo bloco de foco."; toast("Pausa terminada. Bora para o próximo bloco!"); }
      setMode(next);
    }
    function tick() { left = Math.max(0, Math.round((endAt - Date.now()) / 1000)); paint(); if (left <= 0) finish(); }
    function start() { if (timer) return; endAt = Date.now() + left * 1000; timer = setInterval(tick, 250); setBtn(); paint(); }
    function stop() { if (timer) { clearInterval(timer); timer = null; } setBtn(); paint(); }
    $("pmStart").addEventListener("click", function () { if (timer) stop(); else start(); });
    $("pmReset").addEventListener("click", function () { setMode(mode); });
    $("pmSkip").addEventListener("click", function () { if (mode === "foco") setMode("curta"); else setMode("foco"); });
    document.querySelectorAll("[data-pm]").forEach(function (b) { b.addEventListener("click", function () { setMode(b.dataset.pm); }); });
    paint();
  })();

  /* ---------- Levar provas e agenda para a agenda do celular (.ics) ---------- */
  function icsEsc(s) { return String(s).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n"); }
  function icsFold(line) { var out = [], s = line; while (s.length > 72) { out.push(s.slice(0, 72)); s = " " + s.slice(72); } out.push(s); return out.join("\r\n"); }
  function icsDay(d) { return d.replace(/-/g, ""); }
  function icsNextDay(d) { var x = parseD(d); x.setDate(x.getDate() + 1); return icsDay(iso(x)); }
  function buildIcs(kind) {
    var items = [];
    if (kind === "provas") state.provas.forEach(function (p) { if (daysUntil(p.data) >= 0) items.push({ id: p.id, d: p.data, t: p.tipo + ": " + p.disc, desc: p.cont || "" }); });
    else state.ativ.forEach(function (a) { if (!a.done && daysUntil(a.data) >= 0) items.push({ id: a.id, d: a.data, t: a.tit, desc: a.tipo }); });
    var stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
    var L = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Portal Futuro//Agenda//PT-BR", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
      "X-WR-CALNAME:" + icsEsc(kind === "provas" ? "Portal Futuro · Provas" : "Portal Futuro · Agenda")];
    items.forEach(function (it) {
      L.push("BEGIN:VEVENT", "UID:" + icsEsc(it.id) + "-" + kind + "@portal-futuro.netlify.app", "DTSTAMP:" + stamp,
        "DTSTART;VALUE=DATE:" + icsDay(it.d), "DTEND;VALUE=DATE:" + icsNextDay(it.d), "SUMMARY:" + icsEsc(it.t));
      if (it.desc) L.push("DESCRIPTION:" + icsEsc(it.desc + " · Portal Futuro"));
      L.push("BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:" + icsEsc("Amanhã: " + it.t), "TRIGGER:-PT15H", "END:VALARM", "END:VEVENT");
    });
    L.push("END:VCALENDAR");
    return { text: L.map(icsFold).join("\r\n") + "\r\n", count: items.length };
  }
  document.querySelectorAll("[data-ics]").forEach(function (b) {
    b.addEventListener("click", function () {
      var kind = b.dataset.ics, r = buildIcs(kind);
      if (!r.count) { toast(kind === "provas" ? "Não há avaliações futuras para levar à agenda." : "Não há atividades pendentes com data futura."); return; }
      var blob = new Blob([r.text], { type: "text/calendar;charset=utf-8" });
      var a = el("a", { href: URL.createObjectURL(blob), download: "portal-futuro-" + kind + ".ics" });
      document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
      toast(r.count + (r.count === 1 ? " data enviada" : " datas enviadas") + " para a agenda. Abra o arquivo baixado para adicionar.");
    });
  });

  /* ---------- Sons suaves (criados na hora pelo navegador, sem arquivos de áudio) ---------- */
  var Sfx = (function () {
    var ctx = null;
    function ac() {
      if (!ctx) { var C = window.AudioContext || window.webkitAudioContext; if (!C) return null; try { ctx = new C(); } catch (e) { return null; } }
      if (ctx.state === "suspended") { try { ctx.resume(); } catch (e) {} }
      return ctx;
    }
    function tone(f1, f2, dur, vol, delay) {
      var c = ac(); if (!c || c.state !== "running") return false;
      var t = c.currentTime + (delay || 0), o = c.createOscillator(), g = c.createGain();
      o.type = "sine"; o.frequency.setValueAtTime(f1, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(c.destination); o.start(t); o.stop(t + dur + 0.03);
      return true;
    }
    return {
      tap: function () { if (prefs.sound) tone(880, 620, 0.07, 0.03); },
      toggle: function (on) { if (prefs.sound) { tone(on ? 660 : 880, on ? 990 : 590, 0.09, 0.03); } },
      open: function () {
        if (!prefs.sound) return;
        var go = function () { tone(523.25, 0, 0.55, 0.035, 0); tone(783.99, 0, 0.6, 0.03, 0.11); tone(1046.5, 0, 0.75, 0.022, 0.22); };
        var c = ac(); if (!c) return;
        if (c.state === "running") go();
        else if (c.resume) c.resume().then(function () { if (c.state === "running") go(); }).catch(function () {});
      }
    };
  })();
  // Toque nos ícones: som, vibração curta e uma marcação leve
  var TAP_SEL = ".tabbar a, .tabbar button, .round-btn, .btn, .glass-btn, .tile, .sheet-item, .set-row, .set-acc, .stat, .stack-card, .mainnav a, .mainnav button, .drop-panel a, .m-row, .m-back, .m-chap, .seg button, .user-chip, .fb-fab, .plan-go, .bus-head, .pa-act button";
  document.addEventListener("click", function (e) {
    var t = e.target.closest ? e.target.closest(TAP_SEL) : null;
    if (!t || t.disabled) return;
    Sfx.tap();
    if (prefs.vib && navigator.vibrate) { try { navigator.vibrate(8); } catch (er) {} }
    if (!reduceMotion) {
      var ic = t.querySelector(".ico, .ib") || t;
      ic.classList.remove("pop"); void ic.offsetWidth; ic.classList.add("pop");
      setTimeout(function () { ic.classList.remove("pop"); }, 400);
    }
  }, true);
  document.addEventListener("change", function (e) { if (e.target && e.target.matches && e.target.matches('input[type=checkbox][role=switch]')) { Sfx.toggle(e.target.checked); if (prefs.vib && navigator.vibrate) { try { navigator.vibrate(8); } catch (er) {} } } }, true);

  /* ---------- Configurações ---------- */
  var setEl = $("settings"), setBtn = $("setBtn"), setOpen = false, clearArm = 0;
  function themeMode() { return root.getAttribute("data-theme") || "auto"; }
  function paintSeg(id, val) { document.querySelectorAll("#" + id + " button").forEach(function (b) { var on = b.dataset.v === val; b.setAttribute("aria-checked", String(on)); b.classList.toggle("on", on); b.tabIndex = on ? 0 : -1; }); }
  function setPushStatus() {
    var st = $("setPushSt");
    if (!(typeof PUSH_OK !== "undefined" && PUSH_OK)) { st.textContent = "Este aparelho não recebe notificações"; return; }
    if (!isStandalone()) { st.textContent = "Funcionam no aplicativo instalado"; return; }
    if (!currentUser || !currentUser.cloud) { st.textContent = "Entre com uma conta para receber"; return; }
    if (Notification.permission === "denied") { st.textContent = "Bloqueadas nas configurações do celular"; return; }
    navigator.serviceWorker.ready.then(function (r) { return r.pushManager.getSubscription(); }).then(function (sub) { st.textContent = sub && Notification.permission === "granted" ? "Ligadas neste aparelho" : "Desligadas"; }).catch(function () { st.textContent = "Desligadas"; });
  }
  function fillSettings() {
    var u = currentUser;
    $("setAv").textContent = u ? initials(u.name) : "?";
    $("setName").textContent = u ? u.name : "Visitante";
    $("setMail").textContent = u ? (u.email === DEMO.email ? "Conta de demonstração" : u.email) : "";
    paintSeg("setTheme", themeMode()); paintSeg("setText", prefs.text);
    $("setCalm").checked = prefs.calm; $("setSound").checked = prefs.sound; $("setVib").checked = prefs.vib;
    $("setVibRow").hidden = !navigator.vibrate;
    $("setInstall").hidden = !!(isStandalone() || $("installWrap").hidden);
    $("setLogout").hidden = !u;
    var cloud = !!(u && u.cloud);
    $("setClearD").textContent = cloud ? "Apaga a cópia guardada aqui e baixa tudo de novo da nuvem." : "Disponível para contas na nuvem. A demonstração guarda tudo só neste aparelho.";
    $("setClear").disabled = !cloud;
    $("setClearT").textContent = "Limpar dados do aparelho"; clearArm = 0;
    setPushStatus();
  }
  function openSettings() {
    $("setCredits").hidden = true; setEl.querySelector(".set-body").hidden = false;
    fillSettings(); setOpen = true; setEl.hidden = false; setBtn.setAttribute("aria-expanded", "true");
    document.body.classList.add("sheet-open");
    requestAnimationFrame(function () { setEl.classList.add("open"); var f = setEl.querySelector(".set-head .round-btn"); if (f) f.focus({ preventScroll: true }); });
  }
  function closeSettings(keepFocus) {
    if (!setOpen) return; setOpen = false; setEl.classList.remove("open"); setBtn.setAttribute("aria-expanded", "false");
    document.body.classList.remove("sheet-open");
    if (!keepFocus) setBtn.focus({ preventScroll: true });
    setTimeout(function () { if (!setOpen) setEl.hidden = true; }, reduceMotion ? 0 : 300);
  }
  setBtn.addEventListener("click", function () { if (setOpen) closeSettings(); else { closeSheet(true); openSettings(); } });
  setEl.querySelectorAll("[data-set-close]").forEach(function (b) { b.addEventListener("click", function () { closeSettings(); }); });
  setEl.querySelectorAll("[data-set-nav], [data-priv]").forEach(function (a) { a.addEventListener("click", function () { closeSettings(true); }); });
  setEl.addEventListener("keydown", function (e) {
    if (e.key === "Escape") { e.preventDefault(); closeSettings(); return; }
    if (e.key !== "Tab") return;
    var f = Array.prototype.filter.call(setEl.querySelectorAll("a[href],button:not([disabled]),input"), function (x) { return x.offsetParent !== null; });
    if (!f.length) return; var first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });
  (function () { // arrastar para baixo fecha (celular)
    var panel = setEl.querySelector(".set-panel"), y0 = null, dy = 0;
    panel.addEventListener("touchstart", function (e) { if (panel.scrollTop > 0) { y0 = null; return; } y0 = e.touches[0].clientY; dy = 0; }, { passive: true });
    panel.addEventListener("touchmove", function (e) { if (y0 === null) return; dy = Math.max(0, e.touches[0].clientY - y0); panel.style.transform = dy ? "translateY(" + dy + "px)" : ""; }, { passive: true });
    panel.addEventListener("touchend", function () { if (y0 === null) return; panel.style.transform = ""; if (dy > 100) closeSettings(); y0 = null; });
  })();
  function segKeys(id, onPick) {
    var g = $(id);
    g.addEventListener("click", function (e) { var b = e.target.closest("button[data-v]"); if (b) onPick(b.dataset.v); });
    g.addEventListener("keydown", function (e) {
      if (["ArrowLeft", "ArrowRight"].indexOf(e.key) < 0) return; e.preventDefault();
      var bs = Array.prototype.slice.call(g.querySelectorAll("button")), i = bs.indexOf(document.activeElement); if (i < 0) i = 0;
      var n = bs[(i + (e.key === "ArrowRight" ? 1 : bs.length - 1)) % bs.length]; onPick(n.dataset.v); n.focus();
    });
  }
  segKeys("setTheme", function (v) {
    var apply = function () {
      if (v === "auto") { root.removeAttribute("data-theme"); try { localStorage.removeItem(THEME_KEY); } catch (e) {} }
      else { root.setAttribute("data-theme", v); try { localStorage.setItem(THEME_KEY, v); } catch (e) {} }
      themeLabel(); if (C3.repaint) C3.repaint(); paintSeg("setTheme", v);
    };
    if (document.startViewTransition && !reduceMotion) document.startViewTransition(apply); else apply();
  });
  segKeys("setText", function (v) { prefs.text = v; savePrefs(); root.setAttribute("data-text", v); paintSeg("setText", v); });
  $("setCalm").addEventListener("change", function () {
    prefs.calm = this.checked; savePrefs(); reduceMotion = motionMQ.matches || prefs.calm; root.classList.toggle("calm", prefs.calm);
    document.querySelectorAll("video").forEach(function (v) { try { if (reduceMotion) v.pause(); } catch (e) {} });
    if (!reduceMotion) { var cv = $("p-" + currentView); if (cv) syncVideos(cv); }
  });
  $("setSound").addEventListener("change", function () { prefs.sound = this.checked; savePrefs(); if (prefs.sound) Sfx.tap(); });
  $("setVib").addEventListener("change", function () { prefs.vib = this.checked; savePrefs(); if (prefs.vib && navigator.vibrate) { try { navigator.vibrate(12); } catch (e) {} } });
  $("setLogout").addEventListener("click", function () { closeSettings(true); $("pfLogout").click(); });
  // Créditos (celular): uma tela dentro das Configurações
  function credits(open) {
    $("setCredits").hidden = !open; setEl.querySelector(".set-body").hidden = open;
    if (open) { $("setCredData").textContent = $("footDataTxt").textContent; setEl.querySelectorAll(".copy-y").forEach(function (n) { n.textContent = $("copyYear").textContent; }); $("setCredBack").focus({ preventScroll: true }); }
    else $("setCred").focus({ preventScroll: true });
  }
  $("setCred").addEventListener("click", function () { credits(true); });
  $("setCredBack").addEventListener("click", function () { credits(false); });
  $("setFb").addEventListener("click", function () { closeSettings(true); setTimeout(function () { $("fbOpen").click(); }, 50); });
  $("setInstall").addEventListener("click", function () { closeSettings(true); $("installBtn").click(); });
  $("setClear").addEventListener("click", function () {
    var u = currentUser; if (!u || !u.cloud) return;
    var dirty = false; try { dirty = localStorage.getItem(CACHE + u.id + ".dirty") === "1"; } catch (e) {}
    if (dirty) { toast("Ainda há alterações sendo salvas na nuvem. Tente de novo em alguns segundos."); pushNow(); return; }
    if (Date.now() - clearArm > 5000) { clearArm = Date.now(); $("setClearT").textContent = "Toque de novo para confirmar"; return; }
    try { localStorage.removeItem(CACHE + u.id); } catch (e) {}
    var done = function () { location.reload(); };
    if (window.caches && caches.keys) caches.keys().then(function (ks) { return Promise.all(ks.map(function (k) { return caches.delete(k); })); }).then(done, done); else done();
  });

  /* ---------- Celular: telas com menos rolagem ----------
     Cada página mostra só o essencial e uma lista dos assuntos; tocando num assunto, ele abre numa tela própria com "voltar". */
  var phoneMQ = window.matchMedia("(max-width: 760px)");
  (function () {
    var card = document.querySelector("#p-inicio .live-home > .card.live");
    if (!card) return;
    function sync() {
      if (phoneMQ.matches) { card.setAttribute("role", "link"); card.tabIndex = 0; card.setAttribute("aria-label", "Abrir o calendário"); card.classList.add("tap-card"); }
      else { card.removeAttribute("role"); card.removeAttribute("tabindex"); card.removeAttribute("aria-label"); card.classList.remove("tap-card"); }
    }
    card.addEventListener("click", function () { if (phoneMQ.matches) { Sfx.tap(); location.hash = "calendario"; } });
    card.addEventListener("keydown", function (e) { if (phoneMQ.matches && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); location.hash = "calendario"; } });
    if (phoneMQ.addEventListener) phoneMQ.addEventListener("change", sync);
    setTimeout(sync, 0);
  })();

  var INLINE = { financas: ["lancar", "resumo"], provas: ["avaliacoes"], agenda: ["nova-atividade", "atividades"], calendario: ["agora", "mes", "dia"], onibus: ["planejar"], campus: ["mapa"], perfil: ["pf-resumo"] };
  function svgUse(id, cls) { var s = document.createElementNS("http://www.w3.org/2000/svg", "svg"), u = document.createElementNS("http://www.w3.org/2000/svg", "use"); s.setAttribute("class", "ico " + (cls || "")); s.setAttribute("aria-hidden", "true"); u.setAttribute("href", "#" + id); s.appendChild(u); return s; }
  document.querySelectorAll("section.view").forEach(function (view) {
    var v = view.dataset.view, toc = view.querySelector(".toc"), body = view.querySelector(".page-body");
    if (!toc || !body) return;
    var inl = INLINE[v] || [], rows = [];
    toc.querySelectorAll("li a").forEach(function (a) {
      var id = a.getAttribute("href").slice(1), sec = document.getElementById(id);
      if (!sec || sec.parentNode !== body || inl.indexOf(id) >= 0) return;
      sec.classList.add("m-sub");
      var n = a.querySelector(".n"), t = a.querySelector(".t"), d = a.querySelector(".d");
      rows.push(el("li", null, [el("a", { class: "m-row", href: "#" + id }, [el("span", { class: "n", text: n ? n.textContent : "" }), el("span", { class: "t" }, [el("b", { text: t ? t.textContent : "" }), d ? el("span", { class: "d", text: d.textContent }) : null]), svgUse("i-chev", "chev")])]));
    });
    if (!rows.length) return;
    var nav = el("nav", { class: "m-index", "aria-label": "Assuntos desta página" }, [el("h2", { class: "m-index-h", text: inl.length ? "Mais nesta página" : "Assuntos" }), el("ol", null, rows)]);
    var last = null; inl.forEach(function (id) { var s2 = $(id); if (s2 && s2.parentNode === body) last = s2; });
    if (last) body.insertBefore(nav, last.nextSibling); else body.insertBefore(nav, body.firstChild);
    var h1 = view.querySelector(".page-head h1");
    var inner = view.querySelector(".view-inner");
    if (inner) inner.insertBefore(el("a", { class: "m-back", href: "#" + v }, [svgUse("i-left"), el("span", { text: h1 ? h1.textContent : "Voltar" })]), inner.firstChild);
  });
  function setDetail(id) {
    document.querySelectorAll(".view.m-detail").forEach(function (x) { x.classList.remove("m-detail"); });
    document.querySelectorAll(".sec.m-open").forEach(function (x) { x.classList.remove("m-open"); });
    document.body.classList.remove("m-detail-on");
    if (!id) return false;
    var s = $(id); if (!s || !s.classList.contains("m-sub")) return false;
    s.classList.add("m-open"); s.closest(".view").classList.add("m-detail"); document.body.classList.add("m-detail-on");
    return true;
  }

  /* ---------- Notificações (só no aplicativo instalado e com conta na nuvem) ----------
     O navegador cria uma "inscrição" (endereço do serviço de push + chaves públicas). Ela vai para o
     servidor pela função push_subscribe; o envio diário é feito pela função "push" na Supabase. */
  var PUSH_OK = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  function isStandalone() { return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true; }
  function b64uToBytes(str) {
    var s = str.replace(/-/g, "+").replace(/_/g, "/"); s += "===".slice((s.length + 3) % 4);
    var bin = atob(s), out = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out;
  }
  function pushReg() { return navigator.serviceWorker.ready; }
  function pushPrefs() { var p = {}; document.querySelectorAll("#pushList [data-pref]").forEach(function (c) { p[c.dataset.pref] = c.checked; }); return p; }
  function pushUI(state, prefs) {
    var lead = $("pushLead"), list = $("pushList"), on = $("pushOn"), off = $("pushOff"), inst = $("pushInstall");
    list.hidden = state !== "active"; on.hidden = state !== "ready"; off.hidden = state !== "active";
    inst.hidden = !(state === "install" && !$("installWrap").hidden);
    var msg = {
      unsupported: "Este aparelho não recebe notificações do portal.",
      install: "As notificações funcionam no aplicativo instalado. Instale o Portal Futuro na tela inicial, abra por lá e ative aqui no perfil.",
      local: "Para receber lembretes, entre com uma conta (a conta de demonstração não recebe notificações).",
      denied: "As notificações estão bloqueadas para o Portal Futuro. Libere nas configurações do celular (Notificações) e volte aqui.",
      ready: "Receba lembretes no celular: finanças todo dia 5, datas importantes com 7 dias e 1 dia de antecedência e novidades do portal.",
      active: "Notificações ligadas neste aparelho. Escolha o que você quer receber:",
      loading: "Conferindo as notificações deste aparelho…"
    }[state];
    lead.textContent = msg || "";
    if (prefs) document.querySelectorAll("#pushList [data-pref]").forEach(function (c) { c.checked = prefs[c.dataset.pref] !== false; });
  }
  function renderPush() {
    $("pushErr").textContent = "";
    if (!PUSH_OK) return pushUI("unsupported");
    if (!isStandalone()) return pushUI("install");
    if (!currentUser || !currentUser.cloud) return pushUI("local");
    if (Notification.permission === "denied") return pushUI("denied");
    pushUI("loading");
    pushReg().then(function (reg) { return reg.pushManager.getSubscription(); }).then(function (sub) {
      if (!sub || Notification.permission !== "granted") return pushUI("ready");
      return sbAuthed("POST", "/rest/v1/rpc/push_status", { p_endpoint: sub.endpoint }).then(function (st) {
        if (st && st.active) pushUI("active", st.prefs); else pushUI("ready");
      });
    }).catch(function () { pushUI("ready"); });
  }
  $("pushInstall").addEventListener("click", function () { $("installBtn").click(); });
  // Pergunta no próprio app (só no aplicativo instalado, com conta, se ainda não decidiu). "Agora não" volta a perguntar em 7 dias.
  var ASK_KEY = "portalFuturo.pushAsk";
  function maybeAskPush() {
    var card = $("pushAsk");
    if (!PUSH_OK || !isStandalone() || !currentUser || !currentUser.cloud || Notification.permission === "denied") return;
    try { var t = Number(localStorage.getItem(ASK_KEY + "." + currentUser.id)) || 0; if (Date.now() - t < 7 * 864e5) return; } catch (e) {}
    pushReg().then(function (reg) { return reg.pushManager.getSubscription(); }).then(function (sub) {
      if (sub && Notification.permission === "granted") return; // já ativado neste aparelho
      if (!currentUser || document.body.classList.contains("locked")) return;
      card.hidden = false; requestAnimationFrame(function () { card.classList.add("in"); });
    }).catch(function () {});
  }
  function closeAsk(remember) {
    var card = $("pushAsk"); card.classList.remove("in");
    setTimeout(function () { card.hidden = true; }, reduceMotion ? 0 : 300);
    if (remember && currentUser) { try { localStorage.setItem(ASK_KEY + "." + currentUser.id, String(Date.now())); } catch (e) {} }
  }
  $("pushAskNo").addEventListener("click", function () { closeAsk(true); });
  $("pushAskYes").addEventListener("click", function () {
    var b = this; b.disabled = true;
    pushActivate().then(function (on) { b.disabled = false; closeAsk(!on); if (on && currentView === "perfil") renderPush(); },
      function (msg) { b.disabled = false; closeAsk(false); toast(msg); });
  });
  // Ativa as notificações neste aparelho. Resolve true se ligou, false se a pessoa negou; rejeita com a mensagem de erro.
  function pushActivate() {
    return Notification.requestPermission().then(function (perm) {
      if (perm !== "granted") return false;
      return Promise.all([pushReg(), fetch(SB_URL + "/functions/v1/push", { credentials: "omit", cache: "no-store" }).then(function (r) { if (!r.ok) throw new Error("key"); return r.json(); })]).then(function (res) {
        var reg = res[0], key = res[1] && res[1].publicKey;
        if (typeof key !== "string" || !/^[A-Za-z0-9_-]{80,100}$/.test(key)) throw new Error("key");
        return reg.pushManager.getSubscription().then(function (old) { return old ? old.unsubscribe() : null; })
          .then(function () { return reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64uToBytes(key) }); });
      }).then(function (sub) {
        var j = sub.toJSON();
        return sbAuthed("POST", "/rest/v1/rpc/push_subscribe", { p_endpoint: j.endpoint, p_p256dh: j.keys.p256dh, p_auth: j.keys.auth, p_prefs: { fin: true, datas: true, novidades: true } });
      }).then(function () { toast("Notificações ativadas. Você escolhe o que receber em Perfil › Notificações."); return true; });
    }).catch(function (e) {
      if (e === false) return false;
      throw e && /too many/.test(e.message || "") ? "Sua conta já recebe notificações em 5 aparelhos. Desative em algum deles primeiro." : "Não foi possível ativar agora. Verifique a internet e tente de novo.";
    });
  }
  $("pushOn").addEventListener("click", function () {
    var btn = this, err = $("pushErr"); err.textContent = ""; btn.disabled = true;
    pushActivate().then(function (on) { btn.disabled = false; if (on) pushUI("active", { fin: true, datas: true, novidades: true }); else renderPush(); },
      function (msg) { btn.disabled = false; err.textContent = msg; });
  });
  document.querySelectorAll("#pushList [data-pref]").forEach(function (c) {
    c.addEventListener("change", function () {
      var err = $("pushErr"); err.textContent = "";
      pushReg().then(function (reg) { return reg.pushManager.getSubscription(); }).then(function (sub) {
        if (!sub) { renderPush(); return; }
        return sbAuthed("POST", "/rest/v1/rpc/push_set_prefs", { p_endpoint: sub.endpoint, p_prefs: pushPrefs() });
      }).catch(function () { c.checked = !c.checked; err.textContent = "Não foi possível salvar agora. Tente de novo."; });
    });
  });
  function pushStop(token) {
    if (!PUSH_OK) return Promise.resolve();
    return pushReg().then(function (reg) { return reg.pushManager.getSubscription(); }).then(function (sub) {
      if (!sub) return;
      var ep = sub.endpoint;
      var server = token ? sbReq("POST", "/rest/v1/rpc/push_unsubscribe", { p_endpoint: ep }, { token: token }) : sbAuthed("POST", "/rest/v1/rpc/push_unsubscribe", { p_endpoint: ep });
      return server.catch(function () {}).then(function () { return sub.unsubscribe(); });
    }).catch(function () {});
  }
  $("pushOff").addEventListener("click", function () {
    var btn = this; btn.disabled = true;
    pushStop().then(function () { btn.disabled = false; renderPush(); toast("Notificações desativadas neste aparelho."); });
  });

  /* ---------- Aplicativo (instalar na tela inicial) ---------- */
  (function () {
    if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
      window.addEventListener("load", function () { navigator.serviceWorker.register("/sw.js").catch(function () {}); });
    }
    var wrap = $("installWrap"), btn = $("installBtn"), ios = $("iosDialog"), deferred = null;
    var standalone = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
    var isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    if (standalone) return;
    if (isIOS) wrap.hidden = false;
    window.addEventListener("beforeinstallprompt", function (e) { e.preventDefault(); deferred = e; wrap.hidden = false; });
    window.addEventListener("appinstalled", function () { wrap.hidden = true; deferred = null; toast("Portal Futuro instalado. Procure o ícone na tela do celular."); });
    btn.addEventListener("click", function () {
      if (deferred) { deferred.prompt(); deferred.userChoice.then(function () { deferred = null; }); return; }
      if (isIOS) { document.body.classList.remove("has-cursor"); if (typeof ios.showModal === "function") ios.showModal(); else ios.setAttribute("open", ""); }
    });
    ios.querySelectorAll("[data-close]").forEach(function (b) { b.addEventListener("click", function () { ios.close(); }); });
    ios.addEventListener("click", function (e) { if (e.target === ios) ios.close(); });
  })();

  /* ---------- Inicialização ---------- */
  function renderAll() { renderHome(); renderFin(); renderProvas(); renderAtiv(); renderCalendar(); renderMini(); renderDay(); renderFixed(); }
  $("copyYear").textContent = String(Math.max(2026, today.getFullYear()));
  renderDocs(); renderCalc(); buildBus(); buildZoneUI(); renderWeek(); showZone("biblioteca", false); renderSalarios(); renderCal("calFull"); renderCal("calHome", 3); renderAll();
  window._pfReady = true;
  route(location.hash.slice(1), false);
  initGate();
  tick();
  setInterval(tick, 1000);
})();
