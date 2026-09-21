import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// RIDERA — registrar-gruero
// POST normal  → registra nuevo gruero (pendiente aprobación)
// POST { action: 'aprobar', nombre } → busca en DB, crea cuenta Auth, envía email

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

function toSlug(s: string): string {
  return (s || "").trim().toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50) || "gruero";
}

function normMuni(s: any): string | null {
  let k = (s ?? "").toString().trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  k = k.replace(/\s+/g, "_").replace(/[^a-z_]/g, "");
  return k || null;
}

function parseMunicipios(data: any): string[] {
  let raw = data.municipios ?? data.cobertura ?? [];
  if (typeof raw === "string") raw = raw.split(/[,;|]+/);
  if (!Array.isArray(raw)) raw = [raw];
  const keys = raw.map(normMuni).filter((x: string | null): x is string => !!x);
  return [...new Set(keys)];
}

async function uploadImg(supabase: any, dataUrl: string, path: string): Promise<string | null> {
  try {
    if (!dataUrl || !dataUrl.startsWith("data:")) return null;
    const comma = dataUrl.indexOf(",");
    const meta = dataUrl.substring(5, dataUrl.indexOf(";"));
    const b64 = dataUrl.substring(comma + 1);
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const contentType = meta || "image/jpeg";
    const { error } = await supabase.storage.from("grueros").upload(path, bytes, { contentType, upsert: true });
    if (error) return null;
    const { data } = supabase.storage.from("grueros").getPublicUrl(path);
    return data?.publicUrl ?? null;
  } catch (_) { return null; }
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
          name: "codigo_clave_gruero",
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

    // ── SETUP: consultar estado de la plantilla (uso único) ─────────────────
    if (data.action === "estado_plantilla_recuperar" && data.setup_key === "ridera_setup_2026") {
      const res = await fetch(`${GRAPH}/${wabaId}/message_templates?fields=name,status,category,language,rejected_reason&name=codigo_clave_gruero`, {
        headers: { Authorization: `Bearer ${waToken}` },
      });
      const result = await res.json();
      return json({ ok: res.ok, status: res.status, result });
    }

    // ── RECUPERAR CLAVE POR WHATSAPP, paso 1: enviar código (cuentas registradas solo con celular) ──
    if (data.action === "recuperar_clave_telefono") {
      const telefono = normalizePhone(String(data.telefono ?? ""));
      if (!telefono) return json({ ok: false, error: "Falta el número de WhatsApp" }, 400);

      // Respuesta siempre igual (no revelamos si el número existe o no).
      const { data: gruero } = await supabase.from("grueros")
        .select("id, nombre, telefono, auth_id").eq("telefono", telefono).maybeSingle();

      if (gruero?.auth_id) {
        const code = String(Math.floor(100000 + Math.random() * 900000));
        await supabase.from("gruero_reset_codes").insert({
          telefono,
          code,
          expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
        });
        await sendWATemplate(gruero.telefono, "codigo_clave_gruero", "es_CO", [code]);
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

      const { data: reset } = await supabase.from("gruero_reset_codes")
        .select("id, expires_at, used")
        .eq("telefono", telefono).eq("code", code)
        .order("created_at", { ascending: false }).limit(1).maybeSingle();

      if (!reset || reset.used || new Date(reset.expires_at) < new Date()) {
        return json({ ok: false, error: "Código inválido o vencido. Pide uno nuevo." }, 400);
      }

      const { data: gruero } = await supabase.from("grueros")
        .select("id, auth_id").eq("telefono", telefono).maybeSingle();
      if (!gruero?.auth_id) return json({ ok: false, error: "Cuenta no encontrada" }, 404);

      const { error: updErr } = await supabase.auth.admin.updateUserById(gruero.auth_id, { password: newPassword });
      if (updErr) return json({ ok: false, error: updErr.message }, 500);

      await supabase.from("gruero_reset_codes").update({ used: true }).eq("id", reset.id);
      return json({ ok: true });
    }

    // ── APROBACIÓN ──────────────────────────────────────────────────────
    if (data.action === "aprobar") {
      const grueroId = data.gruero_id ?? data.id ?? null;
      const emailInput = String(data.email ?? "").trim().toLowerCase();
      const nombreInput = String(data.nombre ?? "").trim();

      // Buscar gruero: por id > email > nombre
      let q = supabase.from("grueros").select("id, nombre, slug, auth_id, email");
      if (grueroId)        q = q.eq("id", grueroId);
      else if (emailInput) q = q.eq("email", emailInput);
      else if (nombreInput) q = q.ilike("nombre", nombreInput);
      else return json({ ok: false, error: "Se requiere gruero_id, email o nombre" }, 400);

      const { data: gruero, error: findErr } = await q.single();
      if (findErr || !gruero) return json({ ok: false, error: "Gruero no encontrado", nombre: nombreInput }, 404);

      const email = gruero.email;
      if (!email) return json({ ok: false, error: "El gruero no tiene email registrado" }, 400);

      // Generar slug único si no tiene
      let slug = gruero.slug;
      if (!slug) {
        const base = toSlug(gruero.nombre || "gruero");
        const { data: existe } = await supabase.from("grueros").select("id").eq("slug", base).neq("id", gruero.id);
        slug = (existe && existe.length > 0) ? `${base}-${gruero.id.slice(-4)}` : base;
      }

      // Crear cuenta Auth (invitar = crea usuario + envía email para setear clave)
      let authId = gruero.auth_id;
      if (!authId) {
        const { data: invited, error: invErr } = await supabase.auth.admin.inviteUserByEmail(email, {
          redirectTo: "https://gruas.ridera.com.co/mi-cuenta.html",
          data: { nombre: gruero.nombre || "", slug },
        });

        if (invErr) {
          if (invErr.status === 422 || (invErr.message || "").toLowerCase().includes("already")) {
            const { data: list } = await supabase.auth.admin.listUsers({ perPage: 1000 });
            const found = list?.users?.find((u: any) => u.email === email);
            if (found) {
              authId = found.id;
              await supabase.auth.admin.generateLink({
                type: "recovery",
                email,
                options: { redirectTo: "https://gruas.ridera.com.co/mi-cuenta.html" },
              });
            }
          } else {
            return json({ ok: false, error: `Auth: ${invErr.message}` }, 500);
          }
        } else {
          authId = invited?.user?.id ?? null;
        }
      }

      // Actualizar gruero: aprobado, slug, auth_id
      const upd: any = { aprobado: "SI", slug };
      if (authId) upd.auth_id = authId;
      const { error: updErr } = await supabase.from("grueros").update(upd).eq("id", gruero.id);
      if (updErr) return json({ ok: false, error: updErr.message }, 500);

      return json({ ok: true, gruero_id: gruero.id, slug, auth_id: authId, email });
    }

    // ── REGISTRO NUEVO ──────────────────────────────────────────────────────
    const nombre = String(data.nombre ?? "").trim();
    const telRaw = String(data.whatsapp ?? "").trim() || String(data.telefono ?? "").trim();
    const telefono = normalizePhone(telRaw);
    const ciudad = String(data.ciudad ?? "").trim();
    const zona = ciudad || String(data.cobertura ?? "").trim() || "Sin zona";
    const email = String(data.email ?? "").trim();
    const municipios = parseMunicipios(data);

    if (!nombre || !telefono) {
      return json({ ok: false, error: "Faltan nombre o teléfono" }, 400);
    }

    const stamp = Date.now();
    const safe = nombre.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "gruero";

    // Generar slug único: si ya existe uno igual, agregar sufijo numérico
    const slugBase = toSlug(nombre);
    const { data: slugExiste } = await supabase.from("grueros").select("id").eq("slug", slugBase).maybeSingle();
    const slug = slugExiste ? `${slugBase}-${String(stamp).slice(-4)}` : slugBase;

    let foto_url: string | null = null;
    let logo_url: string | null = null;
    if (data.foto_base64) foto_url = await uploadImg(supabase, data.foto_base64, `${safe}/${stamp}-foto.jpg`);
    if (data.logo_base64) logo_url = await uploadImg(supabase, data.logo_base64, `${safe}/${stamp}-logo.jpg`);

    const fotosBase64: string[] = Array.isArray(data.fotos_base64) ? data.fotos_base64.slice(0, 3) : [];
    const fotos_urls = (await Promise.all(
      fotosBase64.map((b64: string, i: number) => uploadImg(supabase, b64, `${safe}/${stamp}-foto${i + 1}.jpg`))
    )).filter((u): u is string => !!u);

    const { foto_base64, logo_base64, fotos_base64, ...limpio } = data;
    const datos = { ...limpio, foto_url, logo_url, fotos_urls };

    const { data: inserted, error } = await supabase
      .from("grueros")
      .insert({
        nombre, telefono, zona,
        ciudad: ciudad || null,
        email: email || null,
        municipios: municipios.length ? municipios : null,
        disponible: false,
        slug,
        datos,
      })
      .select("id")
      .single();

    if (error) return json({ ok: false, error: error.message }, 500);

    return json({ ok: true, id: inserted.id, foto_url, logo_url });

  } catch (e) {
    return json({ ok: false, error: String(e) }, 500);
  }
});
