// gestaovia · traccar-webhook
// Recebe posições (forward.type=json) e alertas (event.forward) do Traccar.
// Autenticação: cabeçalho "Authorization: Bearer <segredo do webhook>".
// O segredo é gerado no banco e aparece para o administrador em
// Configurações › Rastreamento. Publicada sem verificação de JWT (o Traccar
// não tem login do Supabase), por isso o segredo é conferido aqui.
import { createClient } from "npm:@supabase/supabase-js@2";

const KNOT = 1.852;
const ALARMS = new Set(["overspeed", "hardBraking", "hardAcceleration", "hardCornering", "sos", "powerCut", "tampering"]);
const LABEL: Record<string, string> = { overspeed: "Excesso de velocidade", sos: "Botão de pânico", powerCut: "Rastreador desligado da bateria", tampering: "Violação do rastreador" };
const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

let secret: { value: string; at: number } | null = null;
async function webhookSecret() {
  if (secret && Date.now() - secret.at < 60000) return secret.value;
  const { data } = await db.rpc("traccar_config_internal");
  secret = { value: data?.[0]?.webhook_secret ?? "", at: Date.now() };
  return secret.value;
}
function sameText(a: string, b: string) {
  if (a.length !== b.length) return false;
  let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("método não permitido", { status: 405 });
  const expected = await webhookSecret();
  const got = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!expected || !sameText(got, expected)) return new Response("não autorizado", { status: 401 });

  let body: any;
  try { body = await req.json(); } catch { return new Response("json inválido", { status: 400 }); }
  const device = body.device ?? {};
  const pos = body.position ?? null;

  // veículo vinculado pelo id do dispositivo ou pelo IMEI (uniqueId)
  let vehicle: any = null;
  if (Number.isFinite(Number(device.id))) {
    ({ data: vehicle } = await db.from("vehicles").select("id, plate, odometer").eq("traccar_id", Number(device.id)).maybeSingle());
  }
  if (!vehicle && device.uniqueId) {
    ({ data: vehicle } = await db.from("vehicles").select("id, plate, odometer").eq("traccar_unique_id", String(device.uniqueId)).maybeSingle());
  }
  if (!vehicle) return new Response("dispositivo sem veículo vinculado", { status: 202 });

  // ---- alerta (event.forward) ----
  if (body.event) {
    const e = body.event;
    const type = e.type === "alarm" ? e.attributes?.alarm : e.type === "deviceOverspeed" ? "overspeed" : e.type;
    if (!ALARMS.has(type)) return new Response("ignorado", { status: 202 });
    const at = e.eventTime ?? new Date().toISOString();
    const { data: who } = await db.rpc("custody_at", { p_vehicle: vehicle.id, p_at: at });
    const driverId = who?.[0]?.driver_id ?? null;
    const speed = pos ? Math.round((pos.speed ?? 0) * KNOT) : null;
    const { error } = await db.from("tracker_events").upsert({
      ext_id: e.id ?? null, vehicle_id: vehicle.id, driver_id: driverId, type, at,
      speed, lat: pos?.latitude ?? null, lng: pos?.longitude ?? null,
    }, { onConflict: "ext_id", ignoreDuplicates: true });
    if (!error && LABEL[type]) {
      await db.from("notifications").insert({
        to_target: "gestao", level: type === "overspeed" ? "warn" : "bad",
        text: `${vehicle.plate}: ${LABEL[type]}${speed ? ` a ${speed} km/h` : ""}.`,
        link: { page: "veiculo", id: vehicle.id },
      });
    }
    await db.from("audit_logs").insert({ type: "telemetria", text: `${LABEL[type] ?? type}${speed ? ` (${speed} km/h)` : ""} registrado pelo rastreador`, vehicle_id: vehicle.id, driver_id: driverId, user_id: "sistema", at });
    return new Response("ok");
  }

  // ---- posição (forward) ----
  if (!pos || pos.valid === false) return new Response("sem posição válida", { status: 202 });
  const a = pos.attributes ?? {};
  const odo = a.odometer ? a.odometer / 1000 : a.totalDistance ? a.totalDistance / 1000 : null;
  const at = pos.fixTime ?? pos.deviceTime ?? new Date().toISOString();
  const speed = Math.round((pos.speed ?? 0) * KNOT);
  await db.from("vehicle_positions").upsert({
    traccar_position_id: pos.id ?? null, vehicle_id: vehicle.id, lat: pos.latitude, lng: pos.longitude,
    speed, course: pos.course ?? null, ignition: a.ignition ?? null, km: odo ? Math.round(odo) : null,
    address: pos.address ?? null, at,
  }, { onConflict: "traccar_position_id", ignoreDuplicates: true });
  await db.from("vehicle_last_location").upsert({
    id: vehicle.id, lat: pos.latitude, lng: pos.longitude, speed, ignition: a.ignition ?? speed > 1,
    km: odo ? Math.round(odo) : vehicle.odometer, at, source: "traccar",
    extra: { course: pos.course ?? null, address: pos.address ?? "", positionId: pos.id ?? null, motion: a.motion ?? null },
  });
  // hodômetro só avança (ignora saltos acima de 5.000 km, típicos de troca de rastreador)
  if (odo && odo > Number(vehicle.odometer) && odo - Number(vehicle.odometer) < 5000) {
    await db.from("vehicles").update({ odometer: Math.round(odo) }).eq("id", vehicle.id);
  }
  return new Response("ok");
});
