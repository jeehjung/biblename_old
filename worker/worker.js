// 속초교회 아동부 초성 성경 퀴즈 — 앱 화면 + 이름별 기록 동기화 API (Cloudflare Worker + KV)
// GET  /                   앱 화면 (저장소 루트의 index.html 을 함께 올려서 제공 → 깃허브가 막혀도 열림)
// GET  /players            모든 친구의 요약 (xp 높은 순)
// GET  /player?name=이름     한 명의 전체 기록
// POST /player             { name, xp, plays, score, combo, addWrong:[], removeWrong:[] } 를 누적 반영

import APP_HTML from "./index.html";

const BOOKS = ["창세기","출애굽기","레위기","민수기","신명기","여호수아","사사기","룻기","사무엘상","사무엘하",
  "열왕기상","열왕기하","역대상","역대하","에스라","느헤미야","에스더","욥기","시편","잠언","전도서","아가"];

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};
const json = (d, s = 200) => new Response(JSON.stringify(d), {
  status: s,
  headers: { ...CORS, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
});
const clean = n => String(n || "").normalize("NFC").replace(/\s+/g, " ").trim();
const valid = n => /^[가-힣a-zA-Z0-9 ]{1,10}$/.test(n);
const key = n => "p:" + n.toLowerCase();
const blank = n => ({ name: n, xp: 0, best: 0, bestCombo: 0, plays: 0, wrong: [], updated: 0 });
const num = (v, max) => Math.max(0, Math.min(max, Math.floor(Number(v) || 0)));
const books = a => (Array.isArray(a) ? a : []).filter(b => BOOKS.includes(b));

export default {
  async fetch(req, env) {
    if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
    const url = new URL(req.url);
    try {
      if (url.pathname === "/players" && req.method === "GET") {
        const players = [];
        let cursor;
        do {
          const r = await env.PLAYERS.list({ prefix: "p:", cursor });
          for (const k of r.keys) if (k.metadata) players.push(k.metadata);
          cursor = r.list_complete ? null : r.cursor;
        } while (cursor);
        players.sort((a, b) => b.xp - a.xp || a.name.localeCompare(b.name, "ko"));
        return json({ players });
      }

      if (url.pathname === "/player" && req.method === "GET") {
        const n = clean(url.searchParams.get("name"));
        if (!valid(n)) return json({ error: "이름은 한글·영문·숫자 1~10자" }, 400);
        const p = await env.PLAYERS.get(key(n), "json");
        return json({ player: p || blank(n), exists: !!p });
      }

      if (url.pathname === "/player" && req.method === "POST") {
        const b = await req.json();
        const n = clean(b.name);
        if (!valid(n)) return json({ error: "이름은 한글·영문·숫자 1~10자" }, 400);
        const p = (await env.PLAYERS.get(key(n), "json")) || blank(n);
        p.xp += num(b.xp, 3000);
        p.plays += num(b.plays, 20);
        p.best = Math.max(p.best, num(b.score, 400));
        p.bestCombo = Math.max(p.bestCombo, num(b.combo, 22));
        const remove = books(b.removeWrong);
        const set = new Set(p.wrong.filter(w => !remove.includes(w)));
        books(b.addWrong).forEach(w => set.add(w));
        p.wrong = BOOKS.filter(w => set.has(w));
        p.updated = Date.now();
        await env.PLAYERS.put(key(n), JSON.stringify(p), {
          metadata: { name: p.name, xp: p.xp, plays: p.plays, best: p.best }
        });
        return json({ player: p });
      }

      if ((url.pathname === "/" || url.pathname === "/index.html") && req.method === "GET") {
        return new Response(APP_HTML, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache" } });
      }
      if (url.pathname === "/health") return json({ ok: true, app: "bible-quiz-api" });
      return json({ error: "not found" }, 404);
    } catch (e) {
      return json({ error: "server error" }, 500);
    }
  }
};
