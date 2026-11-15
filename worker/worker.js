// 속초교회 아동부 초성 성경 퀴즈 — 앱 화면 + 이름별 기록 동기화 API (Cloudflare Worker + KV)
// GET  /                   앱 화면 (저장소 루트의 index.html 을 함께 올려서 제공 → 깃허브가 막혀도 열림)
// GET  /players            모든 친구의 요약 (xp 높은 순)
// GET  /player?name=이름     한 명의 전체 기록
// POST /player             { name, xp, plays, score, combo, addWrong:[], removeWrong:[] } 를 누적 반영

import APP_HTML from "./index.html";

// 다윗(창세기~아가): 이제 복습용 — 경험치는 더 쌓이지 않고 틀린 카드만 기록
const BOOKS = ["창세기","출애굽기","레위기","민수기","신명기","여호수아","사사기","룻기","사무엘상","사무엘하",
  "열왕기상","열왕기하","역대상","역대하","에스라","느헤미야","에스더","욥기","시편","잠언","전도서","아가"];
// 다니엘(이사야~말라기): 지금 도전하는 문제 — dxp, dwrong 등 d로 시작하는 필드에 기록
const PROPHETS = ["이사야","예레미야","예레미야애가","에스겔","다니엘","호세아","요엘","아모스","오바댜","요나",
  "미가","나훔","하박국","스바냐","학개","스가랴","말라기"];

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
const blank = n => ({ name: n, xp: 0, best: 0, bestCombo: 0, plays: 0, wrong: [], dxp: 0, dbest: 0, dcombo: 0, dplays: 0, dwrong: [], updated: 0 });
const load = async (env, n) => { const p = await env.PLAYERS.get(key(n), "json"); return p ? { ...blank(n), ...p } : null; };
const meta = p => ({ name: p.name, xp: p.xp, plays: p.plays, best: p.best, dxp: p.dxp, dplays: p.dplays });
const num = (v, max) => Math.max(0, Math.min(max, Math.floor(Number(v) || 0)));
const pick = (a, list) => (Array.isArray(a) ? a : []).filter(b => list.includes(b));
const nextWrong = (cur, add, remove, list) => { const set = new Set(cur.filter(w => !remove.includes(w))); add.forEach(w => set.add(w)); return list.filter(w => set.has(w)); };

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
          for (const k of r.keys) if (k.metadata) players.push({ dxp: 0, dplays: 0, ...k.metadata });
          cursor = r.list_complete ? null : r.cursor;
        } while (cursor);
        players.sort((a, b) => b.dxp - a.dxp || b.xp - a.xp || a.name.localeCompare(b.name, "ko"));
        return json({ players });
      }

      if (url.pathname === "/player" && req.method === "GET") {
        const n = clean(url.searchParams.get("name"));
        if (!valid(n)) return json({ error: "이름은 한글·영문·숫자 1~10자" }, 400);
        const p = await load(env, n);
        return json({ player: p || blank(n), exists: !!p });
      }

      if (url.pathname === "/player" && req.method === "POST") {
        const b = await req.json();
        const n = clean(b.name);
        if (!valid(n)) return json({ error: "이름은 한글·영문·숫자 1~10자" }, 400);
        const p = (await load(env, n)) || blank(n);
        if (b.quiz === "prophets") {
          p.dxp += num(b.xp, 3000); p.dplays += num(b.plays, 20);
          p.dbest = Math.max(p.dbest, num(b.score, 400)); p.dcombo = Math.max(p.dcombo, num(b.combo, 17));
          p.dwrong = nextWrong(p.dwrong, pick(b.addWrong, PROPHETS), pick(b.removeWrong, PROPHETS), PROPHETS);
        } else {
          // 예전 문제(복습): 다윗은 더 성장하지 않음 — 틀린 카드 목록만 갱신
          p.wrong = nextWrong(p.wrong, pick(b.addWrong, BOOKS), pick(b.removeWrong, BOOKS), BOOKS);
        }
        p.updated = Date.now();
        await env.PLAYERS.put(key(n), JSON.stringify(p), { metadata: meta(p) });
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
