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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: cors });

  const json = (body: any, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

  try {
    const data = await req.json().catch(() => ({}));
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

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

    const { foto_base64, logo_base64, ...limpio } = data;
    const datos = { ...limpio, foto_url, logo_url };

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
