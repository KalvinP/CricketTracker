import { getStore } from "@netlify/blobs";
import crypto from "node:crypto";

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

const secret = () => process.env.APP_SECRET || "";
const TOKEN_DAYS = 30;

function sign(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", secret()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

function verify(token) {
  if (!token || !secret()) return false;
  const [body, sig] = token.split(".");
  if (!body || !sig) return false;
  const expected = crypto.createHmac("sha256", secret()).update(body).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString());
    return payload.exp > Date.now();
  } catch {
    return false;
  }
}

function passwordOk(input) {
  const real = process.env.APP_PASSWORD || "";
  if (!real) return false;
  const h = (s) => crypto.createHash("sha256").update(String(s)).digest();
  return crypto.timingSafeEqual(h(input), h(real));
}

const num = (v, max = 100000) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.min(n, max) : 0;
};
const str = (v, max = 120) => String(v ?? "").trim().slice(0, max);

function clean(m) {
  const out = {
    id: str(m.id, 60) || crypto.randomUUID(),
    date: str(m.date, 10),
    venue: str(m.venue),
    team: str(m.team),
    opposition: str(m.opposition),
    result: str(m.result, 40),
    notes: str(m.notes, 500),
    batting: null,
    bowling: null,
  };
  if (m.batting) {
    out.batting = {
      position: num(m.batting.position, 11),
      runs: num(m.batting.runs),
      balls: num(m.batting.balls),
      fours: num(m.batting.fours),
      sixes: num(m.batting.sixes),
      howOut: str(m.batting.howOut, 40),
    };
  }
  if (m.bowling) {
    const w = m.bowling.wicketTypes || {};
    const wt = {};
    for (const k of ["Bowled", "Caught", "LBW", "Stumped", "Hit wicket", "Other"]) {
      wt[k] = num(w[k], 10);
    }
    out.bowling = {
      overs: str(m.bowling.overs, 6),
      runs: num(m.bowling.runs),
      wicketTypes: wt,
      wides: num(m.bowling.wides),
      noBalls: num(m.bowling.noBalls),
    };
  }
  return out;
}

export default async (req) => {
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/api\/?/, "");
  const method = req.method;

  if (!process.env.APP_PASSWORD || !process.env.APP_SECRET) {
    return json({ error: "Server not configured. Set APP_PASSWORD and APP_SECRET." }, 500);
  }

  if (path === "login" && method === "POST") {
    let body = {};
    try { body = await req.json(); } catch {}
    if (!passwordOk(body.password ?? "")) {
      await new Promise((r) => setTimeout(r, 600));
      return json({ error: "Wrong password" }, 401);
    }
    return json({ token: sign({ exp: Date.now() + TOKEN_DAYS * 86400000 }) });
  }

  const auth = req.headers.get("authorization") || "";
  if (!verify(auth.replace(/^Bearer /, ""))) return json({ error: "Unauthorized" }, 401);

  const store = getStore("cricket");
  const load = async () => (await store.get("matches", { type: "json" })) || [];

  if (path === "matches" && method === "GET") {
    return json(await load());
  }

  if (path === "matches" && method === "POST") {
    let body;
    try { body = await req.json(); } catch { return json({ error: "Bad JSON" }, 400); }
    const match = clean(body);
    if (!match.date || !match.opposition) return json({ error: "Date and opposition are required" }, 400);
    const all = await load();
    const i = all.findIndex((x) => x.id === match.id);
    if (i >= 0) all[i] = match; else all.push(match);
    await store.setJSON("matches", all);
    return json(match);
  }

  const del = path.match(/^matches\/(.+)$/);
  if (del && method === "DELETE") {
    const all = await load();
    await store.setJSON("matches", all.filter((x) => x.id !== del[1]));
    return json({ ok: true });
  }

  return json({ error: "Not found" }, 404);
};

export const config = { path: "/api/*" };
