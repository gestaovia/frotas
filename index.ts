// gestaovia · admin-users
// Cria, altera, ativa/inativa usuários e redefine senha.
// A chave de serviço (SUPABASE_SERVICE_ROLE_KEY) existe só aqui, no servidor.
//   admin  : gerencia qualquer usuário
//   gestor : gerencia somente condutores
import { createClient } from "npm:@supabase/supabase-js@2";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const ROLES = ["admin", "gestor", "supervisor", "condutor"];

const cors = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") ?? "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const fail = (msg: string, status = 400) => json({ error: msg }, status);
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return fail("Método não permitido.", 405);

  // quem está chamando (token do login, validado pelo Supabase Auth)
  const auth = req.headers.get("Authorization") ?? "";
  const asUser = createClient(SB_URL, ANON_KEY, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
  const { data: { user } } = await asUser.auth.getUser();
  if (!user) return fail("Sessão expirada. Entre novamente.", 401);

  const db = createClient(SB_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const { data: me } = await db.from("profiles").select("id, role, active").eq("id", user.id).maybeSingle();
  if (!me?.active || !["admin", "gestor"].includes(me.role)) return fail("Sem permissão para gerenciar usuários.", 403);
  const isAdmin = me.role === "admin";

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return fail("Requisição inválida."); }
  const action = String(body.action ?? "");

  if (action === "create") {
    const email = String(body.email ?? "").trim().toLowerCase();
    const name = String(body.name ?? "").trim();
    const role = String(body.role ?? "condutor");
    const password = String(body.password ?? "");
    const driverId = body.driverId ? String(body.driverId) : null;
    if (!EMAIL.test(email)) return fail("Informe um e-mail válido.");
    if (name.length < 3) return fail("Informe o nome.");
    if (!ROLES.includes(role)) return fail("Perfil inválido.");
    if (!isAdmin && role !== "condutor") return fail("O gestor cadastra apenas condutores.", 403);
    if (password.length < 8) return fail("A senha inicial precisa ter ao menos 8 caracteres.");
    if (driverId) {
      if (!UUID.test(driverId)) return fail("Condutor inválido.");
      const { data: d } = await db.from("drivers").select("id").eq("id", driverId).maybeSingle();
      if (!d) return fail("Cadastro do condutor não encontrado.");
    }
    const { data: created, error } = await db.auth.admin.createUser({
      email, password, email_confirm: true,
      user_metadata: { name },
      app_metadata: { vialink_role: role, vialink_name: name, vialink_driver_id: driverId, vialink_must_change: true },
    });
    if (error || !created.user) {
      const dup = /already|registered|exists/i.test(error?.message ?? "");
      return fail(dup ? "Este e-mail já tem acesso ao sistema." : `Não foi possível criar o acesso: ${error?.message}`);
    }
    const profile = { id: created.user.id, email, name, role, driver_id: driverId, active: true, must_change_password: true };
    const { error: pErr } = await db.from("profiles").upsert(profile);
    if (pErr) return fail(`Acesso criado, mas o perfil falhou: ${pErr.message}`, 500);
    return json({ profile });
  }

  if (action === "update" || action === "reset_password") {
    const id = String(body.id ?? "");
    if (!UUID.test(id)) return fail("Usuário inválido.");
    const { data: target } = await db.from("profiles").select("*").eq("id", id).maybeSingle();
    if (!target) return fail("Usuário não encontrado.", 404);
    if (!isAdmin && target.role !== "condutor") return fail("O gestor gerencia apenas condutores.", 403);

    if (action === "reset_password") {
      const password = String(body.password ?? "");
      if (password.length < 8) return fail("A senha precisa ter ao menos 8 caracteres.");
      const { error } = await db.auth.admin.updateUserById(id, { password });
      if (error) return fail(error.message);
      await db.from("profiles").update({ must_change_password: true }).eq("id", id);
      return json({ ok: true });
    }

    const patch: Record<string, unknown> = {};
    if (body.name !== undefined) { const n = String(body.name).trim(); if (n.length < 3) return fail("Informe o nome."); patch.name = n; }
    if (body.role !== undefined) {
      const r = String(body.role);
      if (!ROLES.includes(r)) return fail("Perfil inválido.");
      if (!isAdmin && r !== "condutor") return fail("O gestor não altera perfis de acesso.", 403);
      patch.role = r;
    }
    if (body.driverId !== undefined) {
      const d = body.driverId ? String(body.driverId) : null;
      if (d && !UUID.test(d)) return fail("Condutor inválido.");
      patch.driver_id = d;
    }
    if (body.active !== undefined) patch.active = !!body.active;
    if (body.email !== undefined) {
      const e = String(body.email).trim().toLowerCase();
      if (!EMAIL.test(e)) return fail("Informe um e-mail válido.");
      if (e !== target.email) {
        const { error } = await db.auth.admin.updateUserById(id, { email: e, email_confirm: true });
        if (error) return fail(/already|registered|exists/i.test(error.message) ? "Este e-mail já tem acesso ao sistema." : error.message);
        patch.email = e;
      }
    }
    // proteções: ninguém se desativa ou se rebaixa, e sempre sobra um administrador ativo
    if (id === me.id && (patch.active === false || (patch.role && patch.role !== me.role))) return fail("Você não pode desativar ou trocar o próprio perfil.");
    if (target.role === "admin" && (patch.active === false || (patch.role && patch.role !== "admin"))) {
      const { count } = await db.from("profiles").select("id", { count: "exact", head: true }).eq("role", "admin").eq("active", true);
      if ((count ?? 0) <= 1) return fail("É preciso manter ao menos um administrador ativo.");
    }
    if (patch.active !== undefined && patch.active !== target.active) {
      // inativo: bloqueia novos logins e a renovação da sessão
      const { error } = await db.auth.admin.updateUserById(id, { ban_duration: patch.active ? "none" : "876000h" });
      if (error) return fail(error.message);
    }
    const { data: updated, error } = await db.from("profiles").update(patch).eq("id", id).select().single();
    if (error) return fail(error.message);
    return json({ profile: updated });
  }

  return fail("Ação desconhecida.");
});
