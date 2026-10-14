/* Roads to Terra: interactive Horus Heresy reading map */
(function () {
  "use strict";

  const ARCS = window.ARCS;
  const BOOKS = window.BOOKS.slice().sort((a, b) => a.order - b.order);
  const PRESETS = window.PRESETS;
  const byId = Object.fromEntries(BOOKS.map(b => [b.id, b]));
  const arcById = Object.fromEntries(ARCS.map(a => [a.id, a]));
  const laneIndex = Object.fromEntries(ARCS.map((a, i) => [a.id, i]));
  const LINE_ARCS = ARCS.filter(a => !a.noLine);
  const CONVERGE = "the-solar-war";

  const ACTS = [
    { id: "prologue", name: "Prologue · The Great Crusade", sub: "The Primarchs series: prequels you can read at any time", test: b => b.order < 0 },
    { id: "b1", name: "Book I · The Fall of Horus", sub: "The opening. Read these first, in order", test: b => b.order >= 1 && b.order <= 5 },
    { id: "b2", name: "Book II · The War Spreads", sub: "From Isstvan to the birth of Imperium Secundus", test: b => b.order >= 6 && b.order <= 28 },
    { id: "b3", name: "Book III · The Road to Terra", sub: "The traitors close on the Sol System", test: b => b.order >= 29 && b.order < 100 },
    { id: "siege", name: "Book IV · The Siege of Terra", sub: "The end of the Horus Heresy", test: b => b.order > 100 }
  ];
  const KIND_LABEL = { novel: "Novel", anthology: "Anthology", novella: "Siege novella", primarchs: "Primarchs prequel", siege: "Siege of Terra" };
  const TIER_LABEL = { core: "Essential", rec: "Recommended", opt: "Optional" };

  /* ------------------------------------------------------------------ state */
  const STATE_KEY = "rtt-state-v1";
  const READ_KEY = "rtt-read-v1";
  const S = { preset: "express", arcs: new Set(), anth: false, prim: false, showAll: false, view: "map", selected: null };
  let READ = new Set();

  function safeGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function safeSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* ignore */ } }

  function loadState() {
    try { READ = new Set(JSON.parse(safeGet(READ_KEY) || "[]").filter(id => byId[id])); } catch (e) { READ = new Set(); }
    const fromHash = parseHash();
    let src = fromHash;
    if (!src) { try { src = JSON.parse(safeGet(STATE_KEY) || "null"); } catch (e) { src = null; } }
    if (src) {
      if (PRESETS.some(p => p.id === src.preset)) S.preset = src.preset;
      S.arcs = new Set((src.arcs || []).filter(a => arcById[a] && !arcById[a].noLine));
      S.anth = !!src.anth; S.prim = !!src.prim;
    }
  }
  function parseHash() {
    const h = location.hash.replace(/^#/, "");
    if (!h) return null;
    const p = new URLSearchParams(h);
    if (!p.has("r")) return null;
    return { preset: p.get("r"), arcs: (p.get("a") || "").split(",").filter(Boolean), anth: p.get("an") === "1", prim: p.get("pr") === "1" };
  }
  function saveState() {
    const o = { preset: S.preset, arcs: [...S.arcs], anth: S.anth, prim: S.prim };
    safeSet(STATE_KEY, JSON.stringify(o));
    const p = new URLSearchParams();
    p.set("r", o.preset);
    if (o.arcs.length) p.set("a", o.arcs.join(","));
    if (o.anth) p.set("an", "1");
    if (o.prim) p.set("pr", "1");
    try { history.replaceState(null, "", "#" + p.toString()); } catch (e) { /* ignore */ }
  }
  function saveRead() { safeSet(READ_KEY, JSON.stringify([...READ])); }

  /* ------------------------------------------------------------------ route */
  function inPreset(b, preset) {
    switch (preset) {
      case "express": return b.tier === "core";
      case "main": return b.tier === "core" || b.tier === "rec";
      case "complete": return true;
      case "custom": return b.kind === "siege";
    }
    return false;
  }
  function inRoute(b) {
    if (b.kind === "primarchs") return S.prim;
    if (b.kind === "anthology") return S.anth;
    return inPreset(b, S.preset) || b.arcs.some(a => S.arcs.has(a));
  }
  let ROUTE = [], ROUTE_POS = {};
  function computeRoute() {
    ROUTE = BOOKS.filter(inRoute);
    ROUTE_POS = {};
    ROUTE.forEach((b, i) => { ROUTE_POS[b.id] = i + 1; });
  }
  function presetCount(pid) {
    if (pid === "complete") return BOOKS.filter(b => b.kind !== "primarchs").length;
    return BOOKS.filter(b => b.kind !== "primarchs" && b.kind !== "anthology" && inPreset(b, pid)).length;
  }

  /* ------------------------------------------------------------------ helpers */
  const $ = s => document.querySelector(s);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const arcBooks = aid => BOOKS.filter(b => b.arcs.includes(aid));
  const dotsHtml = b => `<span class="dots">${b.arcs.map(a => `<i style="--c:${arcById[a].color}" title="${esc(arcById[a].name)}"></i>`).join("")}</span>`;

  /* ------------------------------------------------------------------ UI: bars */
  function renderPresets() {
    $("#presets").innerHTML = PRESETS.map(p => {
      const n = p.id === "custom" ? "10 + yours" : presetCount(p.id) + " books";
      return `<button class="preset" data-preset="${p.id}" aria-pressed="${S.preset === p.id}" title="${esc(p.desc)}">
        <b>${esc(p.name)}</b><span>${esc(p.sub)} · <span class="cnt">${n}</span></span></button>`;
    }).join("");
    $("#presets").querySelectorAll(".preset").forEach(btn => btn.addEventListener("click", () => {
      S.preset = btn.dataset.preset;
      S.anth = S.preset === "complete";
      update();
    }));
  }
  function renderArcChips() {
    $("#arcChips").innerHTML = LINE_ARCS.filter(a => a.id !== "horus").map(a =>
      `<button class="arc-chip" data-arc="${a.id}" style="--c:${a.color}" aria-pressed="${S.arcs.has(a.id)}" title="${esc(a.name)}"><i></i>${esc(a.short)}</button>`
    ).join("");
    $("#arcChips").querySelectorAll(".arc-chip").forEach(btn => btn.addEventListener("click", () => toggleArc(btn.dataset.arc)));
  }
  function toggleArc(aid) {
    if (S.arcs.has(aid)) S.arcs.delete(aid); else S.arcs.add(aid);
    update();
  }
  function syncBars() {
    document.querySelectorAll(".preset").forEach(b => b.setAttribute("aria-pressed", b.dataset.preset === S.preset));
    document.querySelectorAll(".arc-chip").forEach(b => b.setAttribute("aria-pressed", S.arcs.has(b.dataset.arc)));
    $("#tglAnth").checked = S.anth;
    $("#tglPrim").checked = S.prim;
    const k = { novel: 0, siege: 0, anthology: 0, primarchs: 0 };
    ROUTE.forEach(b => { k[b.kind === "novella" ? "siege" : b.kind]++; });
    const parts = [];
    if (k.primarchs) parts.push(`${k.primarchs} prequels`);
    parts.push(`${k.novel} Heresy novels`);
    if (k.anthology) parts.push(`${k.anthology} anthologies`);
    parts.push(`${k.siege} Siege books`);
    const readN = ROUTE.filter(b => READ.has(b.id)).length;
    $("#routeSummary").innerHTML = `Your route: <strong>${ROUTE.length} of ${BOOKS.length} books</strong><br>${parts.join(" · ")}${readN ? ` · <span style="color:var(--read)">${readN} read</span>` : ""}`;
  }

  /* ------------------------------------------------------------------ MAP layout */
  const LANE_H = 58, TOP = 118, PRO_X0 = 250, PRO_COL = 70, COL = 60, SCOL = 112, GAP = 4.6;
  const POS = {};
  (function layout() {
    // prologue: primarchs share up to two columns per lane
    const proCount = {};
    BOOKS.filter(b => b.order < 0).forEach(b => {
      const lane = b.arcs[0];
      const c = proCount[lane] = (proCount[lane] || 0);
      proCount[lane]++;
      POS[b.id] = { x: PRO_X0 + c * PRO_COL, y: TOP + laneIndex[lane] * LANE_H };
    });
    const MAIN_X0 = PRO_X0 + PRO_COL + 150;
    const main = BOOKS.filter(b => b.order > 0 && b.order < 100);
    main.forEach((b, i) => { POS[b.id] = { x: MAIN_X0 + i * COL, y: TOP + laneIndex[b.arcs[0]] * LANE_H }; });
    const SIEGE_X0 = MAIN_X0 + (main.length - 1) * COL + 190;
    const siege = BOOKS.filter(b => b.order > 100);
    siege.forEach((b, i) => { POS[b.id] = { x: SIEGE_X0 + i * SCOL, y: TOP + laneIndex[b.arcs[0]] * LANE_H }; });
    layout.terraX = SIEGE_X0 + (siege.length - 1) * SCOL + 260;
    layout.mainX0 = MAIN_X0; layout.siegeX0 = SIEGE_X0;
    window.__layout = layout;
  })();
  const L = window.__layout;
  const TERRA = { x: L.terraX, y: TOP + laneIndex[window.SIEGE_LANE] * LANE_H };
  const CONTENT_W = TERRA.x + 220;
  const CONTENT_H = TOP + ARCS.length * LANE_H + 30;

  // Which line-arcs pass through each station (ordered top→bottom by lane)
  const ARC_PATHS = {};
  LINE_ARCS.forEach(a => {
    // anthologies only sit on their own lane's line, so they never drag other lines across the map
    const members = arcBooks(a.id).filter(b => b.kind !== "anthology" || b.arcs[0] === a.id);
    const pre = members.filter(b => b.order < 100);
    const post = members.filter(b => b.order > 100 && b.id !== CONVERGE);
    ARC_PATHS[a.id] = [...pre, byId[CONVERGE], ...post];
  });
  const THROUGH = {};
  BOOKS.forEach(b => { THROUGH[b.id] = []; });
  LINE_ARCS.forEach(a => ARC_PATHS[a.id].forEach(b => { if (!THROUGH[b.id].includes(a.id)) THROUGH[b.id].push(a.id); }));
  Object.values(THROUGH).forEach(list => list.sort((x, y) => laneIndex[x] - laneIndex[y]));
  function offset(bid, aid) {
    const list = THROUGH[bid];
    const k = list.indexOf(aid);
    if (k < 0) return 0;
    return (k - (list.length - 1) / 2) * GAP;
  }
  function stationH(bid) {
    const n = Math.max(1, THROUGH[bid].length);
    const r = byId[bid].tier === "core" ? 9 : byId[bid].tier === "rec" ? 8 : 6.5;
    return { r, h: Math.max(r * 2, (n - 1) * GAP + r * 2) };
  }
  const curve = (x1, y1, x2, y2) => {
    if (Math.abs(y1 - y2) < 0.5) return `M${x1},${y1}L${x2},${y2}`;
    const dx = Math.max(24, Math.min((x2 - x1) * 0.5, 160));
    return `M${x1},${y1}C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`;
  };

  /* ------------------------------------------------------------------ MAP render */
  let svg, root, zoom, gRoute, gStations, gLines;
  function buildMap() {
    svg = d3.select("#map");
    const defs = svg.append("defs");
    const glow = defs.append("filter").attr("id", "glow").attr("x", "-20%").attr("y", "-20%").attr("width", "140%").attr("height", "140%");
    glow.append("feGaussianBlur").attr("stdDeviation", 5);
    const tg = defs.append("radialGradient").attr("id", "terraGrad").attr("cx", "38%").attr("cy", "35%");
    tg.append("stop").attr("offset", "0%").attr("stop-color", "#8fc3ff");
    tg.append("stop").attr("offset", "45%").attr("stop-color", "#2a5aa8");
    tg.append("stop").attr("offset", "80%").attr("stop-color", "#0f2550");
    tg.append("stop").attr("offset", "100%").attr("stop-color", "#081430");
    const ta = defs.append("radialGradient").attr("id", "terraAura");
    ta.append("stop").attr("offset", "55%").attr("stop-color", "rgba(233,196,106,0.45)");
    ta.append("stop").attr("offset", "100%").attr("stop-color", "rgba(233,196,106,0)");

    root = svg.append("g").attr("class", "root");

    // starfield
    const stars = root.append("g").attr("class", "stars");
    const rnd = mulberry(7);
    for (let i = 0; i < 420; i++) {
      stars.append("circle").attr("cx", rnd() * CONTENT_W).attr("cy", rnd() * CONTENT_H)
        .attr("r", rnd() < 0.92 ? rnd() * 0.9 + 0.2 : rnd() * 1.4 + 0.8)
        .attr("fill", "#fff").attr("opacity", rnd() * 0.5 + 0.1);
    }

    // zones
    const zones = [
      { name: "The Great Crusade", sub: "Primarchs prequels", x1: PRO_X0 - 45, x2: PRO_X0 + PRO_COL + 45 },
      { name: "I · The Fall", sub: "Books 1–5", x1: xOf("horus-rising") - COL / 2, x2: xOf("fulgrim") + COL / 2, alt: true },
      { name: "II · The War Spreads", sub: "Books 6–28", x1: xOf("descent-of-angels") - COL / 2, x2: xOf("scars") + COL / 2 },
      { name: "III · The Road to Terra", sub: "Books 29–54", x1: xOf("vengeful-spirit") - COL / 2, x2: xOf("the-buried-dagger") + COL / 2, alt: true },
      { name: "The Siege of Terra", sub: "The end of the Heresy", x1: L.siegeX0 - 70, x2: CONTENT_W, siege: true }
    ];
    const gz = root.append("g");
    zones.forEach(z => {
      gz.append("rect").attr("class", "zone-bg" + (z.alt ? " alt" : "") + (z.siege ? " siege" : ""))
        .attr("x", z.x1).attr("y", 0).attr("width", z.x2 - z.x1).attr("height", CONTENT_H);
      gz.append("text").attr("class", "zone-title").attr("x", z.x1 + 14).attr("y", 34).text(z.name);
      gz.append("text").attr("class", "zone-sub").attr("x", z.x1 + 14).attr("y", 52).text(z.sub);
    });
    // lane guides
    ARCS.forEach((a, i) => {
      root.append("line").attr("class", "lane-guide").attr("x1", 0).attr("x2", CONTENT_W)
        .attr("y1", TOP + i * LANE_H).attr("y2", TOP + i * LANE_H);
    });

    // Terra
    const gt = root.append("g").attr("class", "terra").attr("transform", `translate(${TERRA.x},${TERRA.y})`);
    gt.append("circle").attr("r", 150).attr("fill", "url(#terraAura)");
    gt.append("circle").attr("r", 74).attr("fill", "url(#terraGrad)").attr("stroke", "#e9c46a").attr("stroke-width", 3);
    gt.append("path").attr("d", "M-74,0 A74,22 0 0,0 74,0").attr("fill", "none").attr("stroke", "rgba(233,196,106,.35)").attr("stroke-width", 1.5);
    gt.append("path").attr("d", "M0,-74 A22,74 0 0,0 0,74").attr("fill", "none").attr("stroke", "rgba(233,196,106,.25)").attr("stroke-width", 1.5);
    gt.append("text").attr("class", "terra-label").attr("y", 118).text("TERRA");
    gt.append("text").attr("class", "terra-sub").attr("y", 140).text("ALL ROADS LEAD HERE");

    // arc lines
    gLines = root.append("g").attr("class", "lines");
    LINE_ARCS.forEach(a => {
      const pts = ARC_PATHS[a.id];
      for (let i = 0; i < pts.length - 1; i++) {
        const A = pts[i], B = pts[i + 1];
        const cls = A.order < 0 ? "prequel" : (B.id === CONVERGE && !B.arcs.includes(a.id) ? "conv" : "");
        gLines.append("path").attr("class", `arc-line ${cls}`).attr("data-arc", a.id)
          .attr("d", curve(POS[A.id].x, POS[A.id].y + offset(A.id, a.id), POS[B.id].x, POS[B.id].y + offset(B.id, a.id)))
          .attr("stroke", a.color).attr("stroke-width", a.id === "horus" ? 4.5 : 3.2);
      }
    });
    // main line into Terra
    const last = BOOKS[BOOKS.length - 1];
    gLines.append("path").attr("class", "arc-line").attr("data-arc", "horus")
      .attr("d", curve(POS[last.id].x, POS[last.id].y, TERRA.x - 74, TERRA.y)).attr("stroke", arcById.horus.color).attr("stroke-width", 4.5);

    gRoute = root.append("g").attr("class", "route");
    gStations = root.append("g").attr("class", "stations");

    // stations
    BOOKS.forEach(b => {
      const p = POS[b.id], st = stationH(b.id);
      const g = gStations.append("g")
        .attr("class", `station ${b.tier} ${b.kind}${b.order > 100 ? " siegebook" : ""}`)
        .attr("data-id", b.id).attr("transform", `translate(${p.x},${p.y})`)
        .attr("tabindex", 0).attr("role", "button").attr("aria-label", `${b.title} by ${b.author}`);
      g.append("rect").attr("class", "halo").attr("x", -st.r - 7).attr("y", -st.h / 2 - 7).attr("width", st.r * 2 + 14).attr("height", st.h + 14).attr("rx", st.r + 7);
      g.append("rect").attr("class", "pill").attr("x", -st.r).attr("y", -st.h / 2).attr("width", st.r * 2).attr("height", st.h).attr("rx", st.r);
      if (b.tier === "core") g.append("circle").attr("class", "core-dot").attr("r", 3.2);
      g.append("path").attr("class", "check").attr("d", "M-4,0.5 L-1,3.5 L4.5,-3").style("display", "none");
      const lx = st.r + 3, ly = -st.h / 2 - 3;
      g.append("text").attr("class", "label").attr("transform", `translate(${lx},${ly}) rotate(-34)`).text(b.kind === "primarchs" ? b.title.split(":")[0] : b.title);
      g.append("text").attr("class", "num").attr("x", 0).attr("y", st.h / 2 + 12).attr("text-anchor", "middle").text(b.num.replace("SoT novella", "Novella").replace("Primarchs", ""));
      const badge = g.append("g").attr("class", "route-badge").attr("transform", `translate(${-st.r - 7},${-st.h / 2 - 5})`).style("display", "none");
      badge.append("circle").attr("r", 8);
      badge.append("text");

      g.on("click", (ev) => { ev.stopPropagation(); openDrawer(b.id); })
        .on("keydown", (ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); openDrawer(b.id); } })
        .on("mouseenter", (ev) => showTip(b, ev))
        .on("mousemove", (ev) => moveTip(ev))
        .on("mouseleave", hideTip);
    });

    // lane labels (HTML overlay)
    $("#laneLabels").innerHTML = ARCS.map((a, i) => `<div class="lane-label" data-arc="${a.id}" style="--c:${a.color}"><span class="ln-full">${esc(a.name)}</span><span class="ln-short">${esc(a.short)}</span></div>`).join("");

    // zoom
    zoom = d3.zoom().scaleExtent([0.18, 2.6]).on("zoom", (ev) => {
      root.attr("transform", ev.transform);
      positionLaneLabels(ev.transform);
      svg.classed("hide-labels", ev.transform.k < 0.5);
      const hint = $("#mapHint");
      if (ev.sourceEvent && !hint.classList.contains("gone")) hint.classList.add("gone");
    });
    svg.call(zoom).on("dblclick.zoom", null);
    svg.on("click", () => { if (S.selected) closeDrawer(); });
    goStart(false);
    window.addEventListener("resize", () => positionLaneLabels(d3.zoomTransform(svg.node())));
  }
  function xOf(id) { return POS[id].x; }
  function positionLaneLabels(t) {
    const labels = document.querySelectorAll(".lane-label");
    labels.forEach((el, i) => {
      el.style.top = t.applyY(TOP + i * LANE_H) + "px";
      el.style.fontSize = Math.max(9, Math.min(12, 11 * Math.sqrt(t.k))) + "px";
    });
  }
  function mapSize() { const r = $("#mapWrap").getBoundingClientRect(); return { w: r.width || 800, h: r.height || 600 }; }
  function fitK() { const { h } = mapSize(); return Math.max(0.42, Math.min(1.05, (h - 10) / CONTENT_H)); }
  function goStart(anim = true) {
    const k = fitK();
    const x0 = mapSize().w < 640 ? L.mainX0 - 100 : 10; // phones skip the prequel column
    const t = d3.zoomIdentity.translate(-x0 * k, 0).scale(k);
    (anim ? svg.transition().duration(700) : svg).call(zoom.transform, t);
  }
  function goTerra() {
    const k = fitK(); const { w } = mapSize();
    const t = d3.zoomIdentity.translate(w - (TERRA.x + 200) * k, 0).scale(k);
    svg.transition().duration(900).call(zoom.transform, t);
  }
  function goFit() {
    const { w, h } = mapSize();
    const k = Math.min(w / CONTENT_W, h / CONTENT_H);
    svg.transition().duration(700).call(zoom.transform, d3.zoomIdentity.translate((w - CONTENT_W * k) / 2, (h - CONTENT_H * k) / 2).scale(k));
  }
  function focusBook(id) {
    const p = POS[id]; const { w, h } = mapSize();
    const k = Math.max(d3.zoomTransform(svg.node()).k, 0.85);
    svg.transition().duration(800).call(zoom.transform, d3.zoomIdentity.translate(w / 2 - p.x * k - (S.selected ? 160 : 0), h / 2 - p.y * k).scale(k));
  }

  function updateMap() {
    if (!svg) return;
    const anySel = S.arcs.size > 0;
    gLines.selectAll(".arc-line").each(function () {
      const aid = this.getAttribute("data-arc");
      const sel = S.arcs.has(aid);
      this.classList.toggle("hl", sel);
      this.classList.toggle("dim", anySel && !sel && aid !== "horus");
    });
    document.querySelectorAll(".lane-label").forEach(el => {
      const aid = el.dataset.arc;
      el.classList.toggle("dim", anySel && !S.arcs.has(aid) && aid !== "horus");
    });
    gStations.selectAll(".station").each(function () {
      const id = this.getAttribute("data-id");
      const pos = ROUTE_POS[id];
      this.classList.toggle("dim", !pos);
      this.classList.toggle("read", READ.has(id));
      this.classList.toggle("sel", S.selected === id);
      const badge = this.querySelector(".route-badge");
      badge.style.display = pos ? "" : "none";
      if (pos) badge.querySelector("text").textContent = pos;
      this.querySelector(".check").style.display = READ.has(id) ? "" : "none";
      const cd = this.querySelector(".core-dot");
      if (cd) cd.style.display = READ.has(id) ? "none" : "";
    });
    // route overlay
    let d = "";
    for (let i = 0; i < ROUTE.length; i++) {
      const p = POS[ROUTE[i].id];
      if (i === 0) d += `M${p.x},${p.y}`;
      else { const q = POS[ROUTE[i - 1].id]; d += curve(q.x, q.y, p.x, p.y).replace(/^M[^CL]+/, ""); }
    }
    if (ROUTE.length) d += curve(POS[ROUTE[ROUTE.length - 1].id].x, POS[ROUTE[ROUTE.length - 1].id].y, TERRA.x - 74, TERRA.y).replace(/^M[^CL]+/, "");
    gRoute.selectAll("*").remove();
    gRoute.append("path").attr("class", "route-glow").attr("d", d);
    gRoute.append("path").attr("class", "route-line").attr("d", d);
  }

  /* ------------------------------------------------------------------ tooltip */
  const tip = $("#tooltip");
  function showTip(b, ev) {
    const pos = ROUTE_POS[b.id];
    tip.innerHTML = `<div class="tt-num">${esc(b.num)} · ${TIER_LABEL[b.tier]}${pos ? ` · route #${pos}` : ""}</div>
      <div class="tt-title">${esc(b.title)}</div><div class="tt-auth">${esc(b.author)}${READ.has(b.id) ? ' · <span style="color:var(--read)">✓ read</span>' : ""}</div>
      <div class="tt-dots">${b.arcs.map(a => `<i style="--c:${arcById[a].color}"></i>`).join("")}</div>`;
    tip.classList.add("show"); moveTip(ev);
  }
  function moveTip(ev) {
    const pad = 14, r = tip.getBoundingClientRect();
    let x = ev.clientX + pad, y = ev.clientY + pad;
    if (x + r.width > innerWidth - 8) x = ev.clientX - r.width - pad;
    if (y + r.height > innerHeight - 8) y = ev.clientY - r.height - pad;
    tip.style.left = x + "px"; tip.style.top = y + "px";
  }
  function hideTip() { tip.classList.remove("show"); }

  /* ------------------------------------------------------------------ drawer */
  function openDrawer(id) {
    const b = byId[id]; if (!b) return;
    S.selected = id; hideTip();
    const c1 = arcById[b.arcs[0]].color, c2 = b.arcs[1] ? arcById[b.arcs[1]].color : "#0b0d14";
    const pos = ROUTE_POS[id];
    const arcsHtml = b.arcs.map(aid => {
      const a = arcById[aid];
      const list = arcBooks(aid);
      const i = list.findIndex(x => x.id === id);
      const prev = list[i - 1], next = list[i + 1];
      return `<div class="d-arc" style="--c:${a.color}">
        <div class="d-arc-name"><i></i>${esc(a.name)}</div>
        <div class="d-arc-nav">
          ${prev ? `<button data-go="${prev.id}">← ${esc(prev.title)}</button>` : `<span class="muted" style="font-size:12px">Start of storyline</span>`}
          ${next ? `<button class="next" data-go="${next.id}">${esc(next.title)} →</button>` : `<span class="muted" style="font-size:12px;margin-left:auto">${aid === "side" ? "" : "→ Terra"}</span>`}
        </div></div>`;
    }).join("");
    $("#drawerBody").innerHTML = `
      <div class="d-kicker">${KIND_LABEL[b.kind]}</div>
      <div class="d-cover" style="--c1:${c1};--c2:${c2}"><div class="d-num">${esc(b.num)}</div></div>
      <h2 class="d-title" id="dTitle">${esc(b.title)}</h2>
      <div class="d-author">${esc(b.author)}</div>
      <div class="badges">
        <span class="badge ${b.tier}">${TIER_LABEL[b.tier]}</span>
        ${pos ? `<span class="badge inroute">Route #${pos}</span>` : `<span class="badge">Not on your route</span>`}
      </div>
      <p class="d-blurb">${esc(b.blurb)}</p>
      ${b.why ? `<div class="d-why"><b>Why read it</b>${esc(b.why)}</div>` : ""}
      <div class="d-actions">
        <button class="btn ${READ.has(id) ? "read-on" : "primary"}" id="dRead">${READ.has(id) ? "✓ Read" : "Mark as read"}</button>
        <button class="btn" id="dMap">Show on map</button>
      </div>
      <div class="d-section"><h3>Storylines</h3>${arcsHtml}</div>`;
    $("#drawerBody").querySelectorAll("[data-go]").forEach(btn => btn.addEventListener("click", () => {
      openDrawer(btn.dataset.go);
      if (S.view === "map") focusBook(btn.dataset.go);
    }));
    $("#dRead").addEventListener("click", () => { toggleRead(id); openDrawer(id); });
    $("#dMap").addEventListener("click", () => { setView("map"); requestAnimationFrame(() => focusBook(id)); });
    $("#drawer").classList.add("open");
    $("#drawer").setAttribute("aria-hidden", "false");
    if (innerWidth < 900) $("#scrim").classList.add("show");
    updateMap();
  }
  function closeDrawer() {
    S.selected = null;
    $("#drawer").classList.remove("open");
    $("#drawer").setAttribute("aria-hidden", "true");
    $("#scrim").classList.remove("show");
    updateMap();
  }
  function toggleRead(id) {
    if (READ.has(id)) READ.delete(id); else READ.add(id);
    saveRead();
    syncBars(); updateMap();
    if (S.view === "list") renderList();
  }

  /* ------------------------------------------------------------------ list view */
  function renderList() {
    const preset = PRESETS.find(p => p.id === S.preset);
    const extra = [...S.arcs].map(a => arcById[a].short);
    $("#listTitle").textContent = `${preset.name} route` + (extra.length ? ` + ${extra.join(", ")}` : "");
    $("#listDesc").textContent = preset.desc;
    const items = S.showAll ? BOOKS : ROUTE;
    const readN = ROUTE.filter(b => READ.has(b.id)).length;
    $("#progRead").textContent = readN; $("#progTotal").textContent = ROUTE.length;
    $("#progFill").style.width = (ROUTE.length ? readN / ROUTE.length * 100 : 0) + "%";
    $("#listBody").innerHTML = ACTS.map(act => {
      const rows = items.filter(act.test);
      if (!rows.length) return "";
      return `<div class="act"><div class="act-head"><h3>${esc(act.name)}</h3><span>${esc(act.sub)}</span></div>
        ${rows.map(b => {
          const pos = ROUTE_POS[b.id], done = READ.has(b.id);
          const kindTag = b.kind === "anthology" ? '<span class="tag">Anthology</span>' : b.kind === "novella" ? '<span class="tag">Novella</span>' : b.kind === "primarchs" ? '<span class="tag">Prequel</span>' : "";
          return `<div class="row${pos ? "" : " off"}${done ? " done" : ""}">
            <button class="chk${done ? " on" : ""}" data-read="${b.id}" aria-label="${done ? "Mark unread" : "Mark read"}: ${esc(b.title)}" aria-pressed="${done}">✓</button>
            <div class="idx">${pos || "·"}</div>
            <div class="t"><button data-open="${b.id}">${esc(b.title)}</button><div class="meta">${esc(b.num)} · ${esc(b.author)}</div></div>
            <div class="tags">${dotsHtml(b)}${kindTag}<span class="tag ${b.tier}">${TIER_LABEL[b.tier]}</span></div>
          </div>`;
        }).join("")}</div>`;
    }).join("") + `<div class="act"><div class="act-head"><h3 class="gold">Terra</h3><span>Ave Imperator.</span></div></div>`;
    $("#listBody").querySelectorAll("[data-read]").forEach(btn => btn.addEventListener("click", () => toggleRead(btn.dataset.read)));
    $("#listBody").querySelectorAll("[data-open]").forEach(btn => btn.addEventListener("click", () => openDrawer(btn.dataset.open)));
  }

  /* ------------------------------------------------------------------ storylines view */
  function renderArcs() {
    $("#arcGrid").innerHTML = ARCS.map(a => {
      const list = arcBooks(a.id).filter(b => b.kind !== "primarchs");
      const core = list.filter(b => b.tier === "core").length;
      const on = S.arcs.has(a.id);
      const isMain = a.id === "horus";
      const track = list.map((b, i) => `${i ? '<span class="sep"></span>' : ""}<button class="${b.tier}" data-open="${b.id}">${esc(b.title)}</button>`).join("");
      return `<article class="arc-card" style="--c:${a.color}">
        <div class="legions">${esc(a.legions)}</div>
        <h3>${esc(a.name)}</h3>
        <p>${esc(a.desc)}</p>
        <div class="arc-track">${track}${a.noLine ? "" : '<span class="sep"></span><span class="gold" style="font-size:12px;font-weight:700">TERRA</span>'}</div>
        <div class="dest">${esc(a.dest)}</div>
        <div class="muted" style="font-size:12px">${list.length} books${core ? ` · ${core} essential` : ""}</div>
        ${isMain ? `<span class="badge core" style="align-self:flex-start">Always on your route</span>`
          : a.noLine ? `<button class="btn" data-anth="1">${S.anth ? "✓ Anthologies on route" : "Add anthologies"}</button>`
          : `<button class="btn ${on ? "read-on" : "primary"}" data-arc="${a.id}">${on ? "✓ On your route" : "Add to my route"}</button>`}
      </article>`;
    }).join("");
    $("#arcGrid").querySelectorAll("[data-open]").forEach(btn => btn.addEventListener("click", () => openDrawer(btn.dataset.open)));
    $("#arcGrid").querySelectorAll("[data-arc]").forEach(btn => btn.addEventListener("click", () => toggleArc(btn.dataset.arc)));
    $("#arcGrid").querySelectorAll("[data-anth]").forEach(btn => btn.addEventListener("click", () => { S.anth = !S.anth; update(); }));
  }

  /* ------------------------------------------------------------------ views */
  function setView(v) {
    S.view = v;
    document.querySelectorAll(".tabs button").forEach(b => b.setAttribute("aria-selected", b.dataset.view === v));
    document.querySelectorAll(".view").forEach(el => el.classList.toggle("active", el.id === "view-" + v));
    if (v === "list") renderList();
    if (v === "arcs") renderArcs();
    if (v === "map") requestAnimationFrame(() => positionLaneLabels(d3.zoomTransform(svg.node())));
  }

  function update() {
    computeRoute();
    saveState();
    syncBars();
    updateMap();
    if (S.view === "list") renderList();
    if (S.view === "arcs") renderArcs();
    if (S.selected) openDrawer(S.selected);
  }

  function mulberry(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

  /* ------------------------------------------------------------------ init */
  function init() {
    loadState();
    computeRoute();
    renderPresets();
    renderArcChips();
    $("#tglAnth").addEventListener("change", e => { S.anth = e.target.checked; update(); });
    $("#tglPrim").addEventListener("change", e => { S.prim = e.target.checked; update(); });
    $("#tglAll").addEventListener("change", e => { S.showAll = e.target.checked; renderList(); });
    document.querySelectorAll(".tabs button").forEach(b => b.addEventListener("click", () => setView(b.dataset.view)));
    $("#drawerClose").addEventListener("click", closeDrawer);
    $("#scrim").addEventListener("click", closeDrawer);
    document.addEventListener("keydown", e => { if (e.key === "Escape" && S.selected) closeDrawer(); });
    $("#btnStart").addEventListener("click", () => goStart(true));
    $("#btnTerra").addEventListener("click", goTerra);
    $("#btnFit").addEventListener("click", goFit);
    $("#btnZoomIn").addEventListener("click", () => svg.transition().duration(300).call(zoom.scaleBy, 1.3));
    $("#btnZoomOut").addEventListener("click", () => svg.transition().duration(300).call(zoom.scaleBy, 1 / 1.3));
    window.addEventListener("hashchange", () => {
      const h = parseHash(); if (!h) return;
      S.preset = h.preset; S.arcs = new Set(h.arcs.filter(a => arcById[a])); S.anth = h.anth; S.prim = h.prim;
      update();
    });
    buildMap();
    update();
    setTimeout(() => $("#mapHint").classList.add("gone"), 7000);
  }
  if (typeof d3 === "undefined") {
    document.body.insertAdjacentHTML("afterbegin", '<p style="padding:12px;background:#3b1111">Could not load the map library. Please check your connection and reload.</p>');
  } else init();
})();
