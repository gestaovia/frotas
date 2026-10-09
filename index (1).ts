// gestaovia · traccar-proxy
// O navegador nunca recebe o token do Traccar: ele chama esta função com o
// login do gestaovia, e a função consulta o Traccar com o token guardado no
// schema privado do banco (lido com a chave de serviço, só no servidor).
import { createClient } from "npm:@supabase/supabase-js@2";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const cors = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") ?? "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const fail = (msg: string, status = 400) => json({ error: msg }, status);

async function traccar(base: string, token: string, path: string, params?: Record<string, string>) {
  const q = params && Object.keys(params).length ? "?" + new URLSearchParams(params).toString() : "";
  const r = await fetch(`${base.replace(/\/+$/, "")}/api${path}${q}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    signal: AbortSignal.timeout(15000),
  });
  if (r.status === 401) throw new Error("Token recusado pelo Traccar (401). Gere um novo token em Preferências › Token.");
  if (!r.ok) throw new Error(`Traccar respondeu ${r.status}.`);
  return r.json();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return fail("Método não permitido.", 405);

  const asUser = createClient(SB_URL, ANON_KEY, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } }, auth: { persistSession: false } });
  const { data: { user } } = await asUser.auth.getUser();
  if (!user) return fail("Sessão expirada. Entre novamente.", 401);
  const db = createClient(SB_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const { data: me } = await db.from("profiles").select("role, active").eq("id", user.id).maybeSingle();
  if (!me?.active || !["admin", "gestor", "supervisor"].includes(me.role)) return fail("Sem permissão.", 403);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return fail("Requisição inválida."); }
  const action = String(body.action ?? "");

  try {
    // teste antes de salvar: só o administrador, com endereço e token digitados na tela
    if (action === "test") {
      if (me.role !== "admin") return fail("Somente o administrador testa a conexão.", 403);
      let url = String(body.url ?? ""); let token = String(body.token ?? "");
      if (!token) { const { data } = await db.rpc("traccar_config_internal"); token = data?.[0]?.token ?? ""; if (!url) url = data?.[0]?.url ?? ""; }
      if (!/^https?:\/\//.test(url) || !token) return fail("Informe o endereço (https://…) e o token.");
      const session = await fetch(`${url.replace(/\/+$/, "")}/api/session?token=${encodeURIComponent(token)}`, { signal: AbortSignal.timeout(15000) });
      if (!session.ok) return fail(session.status === 401 || session.status === 404 ? "Token inválido para este servidor." : `Traccar respondeu ${session.status}.`);
      const u = await session.json();
      const devices = await traccar(url, token, "/devices");
      return json({ user: u.name || u.email, devices });
    }

    const { data: cfg } = await db.rpc("traccar_config_internal");
    const c = cfg?.[0];
    if (!c?.url || !c?.token) return fail("Rastreamento não configurado. O administrador informa o servidor e o token em Configurações.", 409);

    if (action === "devices") return json(await traccar(c.url, c.token, "/devices"));
    if (action === "positions") {
      const p: Record<string, string> = {};
      if (body.deviceId) p.deviceId = String(Number(body.deviceId));
      if (body.from) p.from = new Date(String(body.from)).toISOString();
      if (body.to) p.to = new Date(String(body.to)).toISOString();
      return json(await traccar(c.url, c.token, "/positions", p));
    }
    return fail("Ação desconhecida.");
  } catch (e) {
    return fail(e instanceof Error ? (e.name === "TimeoutError" ? "O servidor Traccar não respondeu a tempo." : e.message) : "Falha ao consultar o Traccar.", 502);
  }
});
