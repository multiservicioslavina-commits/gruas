import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// RIDERA — registrar-taller
// Setup + recuperación de clave por WhatsApp para cuentas de taller.

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type, authorization",
};

function normalizePhone(raw: string): string {
  let d = (raw || "").replace(/\D/g, "");
  if (!d) return "";
  d = d.replace(/^0+/, "");
  if (d.startsWith("57") && d.length >= 12) return d;
  if (d.length === 10) return "57" + d;
  return d;
}

const GRAPH = "https://graph.facebook.com/v25.0";
const waToken = Deno.env.get("WHATSAPP_TOKEN") || "";
const waPhoneId = Deno.env.get("RITA_PHONE_ID") || Deno.env.get("WHATSAPP_PHONE_ID") || "1260857797114684";
const wabaId = Deno.env.get("WHATSAPP_BUSINESS_ACCOUNT_ID") || "1406061330395268";

async function sendWATemplate(to: string, name: string, language: string, bodyParams: string[]): Promise<{ ok: boolean; error?: string }> {
  if (!waToken || !waPhoneId) return { ok: false, error: "Faltan credenciales WhatsApp" };
  try {
    const components = bodyParams.length
      ? [{ type: "body", parameters: bodyParams.map((t) => ({ type: "text", text: t })) }]
      : [];
    const res = await fetch(`${GRAPH}/${waPhoneId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${waToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "template",
        template: { name, language: { code: language }, ...(components.length ? { components } : {}) },
      }),
    });
    if (res.ok) return { ok: true };
    let msg = `HTTP ${res.status}`;
    try {
      const d = await res.json();
      msg = d?.error?.message || msg;
      if (d?.error?.error_data?.details) msg += " | " + d.error.error_data.details;
    } catch { /* ignore */ }
    return { ok: false, error: msg };
  } catch (error) {
    return { ok: false, error: String(error) };
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: cors });

  const json = (body: any, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

  try {
    const data = await req.json().catch(() => ({}));
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // ── SETUP: crear la plantilla de autenticación en Meta (uso único) ──────
    if (data.action === "crear_plantilla_recuperar" && data.setup_key === "ridera_setup_2026") {
      const res = await fetch(`${GRAPH}/${wabaId}/message_templates`, {
        method: "POST",
        headers: { Authorization: `Bearer ${waToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "codigo_clave_taller",
          category: "AUTHENTICATION",
          language: "es_CO",
          components: [
            { type: "BODY", add_security_recommendation: true },
            { type: "FOOTER", code_expiration_minutes: 15 },
            { type: "BUTTONS", buttons: [{ type: "OTP", otp_type: "COPY_CODE" }] },
          ],
        }),
      });
      const result = await res.json();
      return json({ ok: res.ok, status: res.status, result });
    }

    // ── SETUP: consultar estado de la plantilla ──────────────────────────────
    if (data.action === "estado_plantilla_recuperar" && data.setup_key === "ridera_setup_2026") {
      const res = await fetch(`${GRAPH}/${wabaId}/message_templates?fields=name,status,category,language,rejected_reason&name=codigo_clave_taller`, {
        headers: { Authorization: `Bearer ${waToken}` },
      });
      const result = await res.json();
      return json({ ok: res.ok, status: res.status, result });
    }

    // ── SETUP: crear la plantilla de aprobación en Meta (uso único) ─────────
    if (data.action === "crear_plantilla_aprobado" && data.setup_key === "ridera_setup_2026") {
      const res = await fetch(`${GRAPH}/${wabaId}/message_templates`, {
        method: "POST",
        headers: { Authorization: `Bearer ${waToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "taller_aprobado",
          category: "UTILITY",
          language: "es_CO",
          components: [
            {
              type: "BODY",
              text: "Hola {{1}}, tu taller ya está aprobado en Ridera. Ya puedes entrar a tu portal y completar tu perfil: https://gruas.ridera.com.co/mi-cuenta-taller.html",
              example: { body_text: [["Carlos"]] },
            },
          ],
        }),
      });
      const result = await res.json();
      return json({ ok: res.ok, status: res.status, result });
    }

    // ── SETUP: consultar estado de la plantilla de aprobación ───────────────
    if (data.action === "estado_plantilla_aprobado" && data.setup_key === "ridera_setup_2026") {
      const res = await fetch(`${GRAPH}/${wabaId}/message_templates?fields=name,status,category,language,rejected_reason&name=taller_aprobado`, {
        headers: { Authorization: `Bearer ${waToken}` },
      });
      const result = await res.json();
      return json({ ok: res.ok, status: res.status, result });
    }

    // ── RECUPERAR CLAVE POR WHATSAPP, paso 1: enviar código ──────────────────
    if (data.action === "recuperar_clave_telefono") {
      const telefono = normalizePhone(String(data.telefono ?? ""));
      if (!telefono) return json({ ok: false, error: "Falta el número de WhatsApp" }, 400);

      const { data: taller } = await supabase.from("talleres")
        .select("id, nombre, telefono, auth_id").eq("telefono", telefono).maybeSingle();

      if (taller?.auth_id) {
        const code = String(Math.floor(100000 + Math.random() * 900000));
        await supabase.from("taller_reset_codes").insert({
          telefono,
          code,
          expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
        });
        await sendWATemplate(taller.telefono, "codigo_clave_taller", "es_CO", [code]);
      }

      return json({ ok: true });
    }

    // ── RECUPERAR CLAVE POR WHATSAPP, paso 2: confirmar código + nueva clave ──
    if (data.action === "confirmar_reset_telefono") {
      const telefono = normalizePhone(String(data.telefono ?? ""));
      const code = String(data.code ?? "").trim();
      const newPassword = String(data.new_password ?? "");
      if (!telefono || !code || newPassword.length < 8) {
        return json({ ok: false, error: "Faltan datos o la contraseña es muy corta" }, 400);
      }

      const { data: reset } = await supabase.from("taller_reset_codes")
        .select("id, expires_at, used")
        .eq("telefono", telefono).eq("code", code)
        .order("created_at", { ascending: false }).limit(1).maybeSingle();

      if (!reset || reset.used || new Date(reset.expires_at) < new Date()) {
        return json({ ok: false, error: "Código inválido o vencido. Pide uno nuevo." }, 400);
      }

      const { data: taller } = await supabase.from("talleres")
        .select("id, auth_id").eq("telefono", telefono).maybeSingle();
      if (!taller?.auth_id) return json({ ok: false, error: "Cuenta no encontrada" }, 404);

      const { error: updErr } = await supabase.auth.admin.updateUserById(taller.auth_id, { password: newPassword });
      if (updErr) return json({ ok: false, error: updErr.message }, 500);

      await supabase.from("taller_reset_codes").update({ used: true }).eq("id", reset.id);
      return json({ ok: true });
    }

    return json({ ok: false, error: "Acción no reconocida" }, 400);

  } catch (e) {
    return json({ ok: false, error: String(e) }, 500);
  }
});
