import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WA_TOKEN     = Deno.env.get("WHATSAPP_TOKEN")!;
const WA_PHONE_ID  = Deno.env.get("RITA_PHONE_ID") || Deno.env.get("WHATSAPP_PHONE_ID") || "1238785075974458";
const WA_API       = `https://graph.facebook.com/v25.0/${WA_PHONE_ID}/messages`;

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

// ─── WhatsApp helpers ─────────────────────────────────────────────────────────
async function sendWA(to: string, text: string): Promise<boolean> {
  try {
    const r = await fetch(WA_API, {
      method: "POST",
      headers: { Authorization: `Bearer ${WA_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", to, type: "text", text: { body: text } }),
      signal: AbortSignal.timeout(8000),
    });
    return r.ok;
  } catch { return false; }
}

async function sendTemplate(to: string, name: string, bodyParams: string[]): Promise<boolean> {
  try {
    const components = bodyParams.length
      ? [{ type: "body", parameters: bodyParams.map(t => ({ type: "text", text: t })) }]
      : [];
    const r = await fetch(WA_API, {
      method: "POST",
      headers: { Authorization: `Bearer ${WA_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "template",
        template: { name, language: { code: "es" }, ...(components.length ? { components } : {}) },
      }),
      signal: AbortSignal.timeout(8000),
    });
    return r.ok;
  } catch { return false; }
}

async function logNotif(telefono: string, tipo: string, mensaje: string) {
  await supabase.from("rita_notif_log").insert({ telefono, tipo, mensaje });
}

// ─── SOAT / TECNO REMINDERS ───────────────────────────────────────────────────
async function doDocReminders() {
  const today    = new Date();
  const todayStr = today.toISOString().split("T")[0];

  const { data: riders } = await supabase
    .from("riders")
    .select("telefono, nombre, moto_marca, moto_modelo, soat_vence, tecno_vence, ultima_notif_soat, ultima_notif_tecno")
    .eq("notif_activa", true)
    .not("telefono", "is", null);

  if (!riders?.length) return;

  const SOAT_DAYS = [30, 15, 7, 3, 1];
  const TECNO_DAYS = [60, 30, 15, 7];

  for (const r of riders) {
    const nombre = r.nombre?.split(" ")[0] || "parcero";
    const moto   = [r.moto_marca, r.moto_modelo].filter(Boolean).join(" ") || "tu moto";
    const tel    = r.telefono;

    // SOAT — usa plantilla aprobada (funciona fuera de la ventana de 24h)
    if (r.soat_vence) {
      const vence    = new Date(r.soat_vence);
      const diffDays = Math.ceil((vence.getTime() - today.getTime()) / 86400000);
      const shouldNotify    = SOAT_DAYS.includes(diffDays);
      const alreadyNotified = r.ultima_notif_soat === todayStr;

      if (shouldNotify && !alreadyNotified) {
        let infoVencimiento: string;
        if (diffDays === 1) {
          infoVencimiento = `¡MAÑANA vence el SOAT de tu ${moto}! Sin él: multa hasta $900k más inmovilización. Renuévalo HOY.`;
        } else if (diffDays <= 3) {
          infoVencimiento = `El SOAT de tu ${moto} vence en ${diffDays} días (${r.soat_vence}). Sin SOAT no hay cobertura en accidente.`;
        } else if (diffDays <= 7) {
          infoVencimiento = `El SOAT de tu ${moto} vence el ${r.soat_vence} — ${diffDays} días. Puedes renovarlo en línea sin salir de casa.`;
        } else {
          infoVencimiento = `El SOAT de tu ${moto} vence el ${r.soat_vence} (${diffDays} días). Anótalo para no coger tarde.`;
        }

        const ok = await sendTemplate(tel, "recordatorio_soat_promo", [nombre, infoVencimiento]);
        if (ok) {
          await supabase.from("riders").update({ ultima_notif_soat: todayStr }).eq("telefono", tel);
          await logNotif(tel, `soat_${diffDays}d`, infoVencimiento);
        }
      }
    }

    // TECNOMECÁNICA — texto libre (sin plantilla dedicada todavía)
    if (r.tecno_vence) {
      const vence    = new Date(r.tecno_vence);
      const diffDays = Math.ceil((vence.getTime() - today.getTime()) / 86400000);
      const shouldNotify    = TECNO_DAYS.includes(diffDays);
      const alreadyNotified = r.ultima_notif_tecno === todayStr;

      if (shouldNotify && !alreadyNotified) {
        let msg: string;
        if (diffDays <= 7) {
          msg = `🔧 ${nombre}, ¡URGENTE! La tecnomecánica de tu ${moto} vence en ${diffDays} días (${r.tecno_vence}). Sin ella no puedes circular legalmente. Los CDA aceptan citas en línea. ¿Te ayudo a encontrar uno cerca?`;
        } else if (diffDays <= 15) {
          msg = `🔧 ${nombre}, la tecnomecánica de tu ${moto} vence el ${r.tecno_vence}. Quedan ${diffDays} días — pide cita ya antes de que se llenen los cupos en el CDA.`;
        } else {
          msg = `📋 ${nombre}, en ${diffDays} días vence la tecnomecánica de tu ${moto}. Aprovecha para hacer una revisión general y llegar con todo perfecto al CDA.`;
        }
        const ok = await sendWA(tel, msg);
        if (ok) {
          await supabase.from("riders").update({ ultima_notif_tecno: todayStr }).eq("telefono", tel);
          await logNotif(tel, `tecno_${diffDays}d`, msg);
        }
      }
    }
  }
}

// ─── WEEKLY TIPS (LUNES) — usa plantilla tip_mantenimiento ───────────────────
type Tip = { titulo: string; detalle: string };

const TIPS_HONDA: Tip[] = [
  { titulo: "Revisa el nivel de aceite cada 1.000 km", detalle: "El motor de tu Honda agradece aceite limpio. Un aceite oscuro y espeso acelera el desgaste del embrague." },
  { titulo: "La cadena debe tener 20-25mm de holgura", detalle: "Mucha tensión revienta el retén, poca holgura pela los piñones. Ajusta y lubrica regularmente." },
  { titulo: "Los frenos de tambor piden ajuste cada 3.000 km", detalle: "¿Sientes que el pedal llega al fondo? Es hora de afinarlos antes de que fallen en la vía." },
];
const TIPS_YAMAHA: Tip[] = [
  { titulo: "Usa aceite YAMALUBE 10W-40 en tu Yamaha", detalle: "Mezclar marcas puede generar espuma y perder viscosidad. El aceite correcto alarga la vida del motor." },
  { titulo: "Limpia el filtro de aire cada 5.000 km en ciudad", detalle: "El polvo y el smog tapan el filtro más rápido que en carretera. Un filtro sucio reduce potencia y sube el consumo." },
  { titulo: "El sistema EXUP de las R-series necesita revisión cada 20.000 km", detalle: "Si notas pérdida de potencia en bajas RPM, es el primer sospechoso." },
];
const TIPS_SUZUKI: Tip[] = [
  { titulo: "Usa aceite 10W-40 API SL o superior en tu Suzuki", detalle: "El aceite mineral sale más barato pero el semisintético dobla la vida del motor." },
  { titulo: "Lubrica la cadena con aceite específico, no con WD-40", detalle: "El WD-40 limpia pero no lubrica — reseca los sellos y acelera el desgaste." },
];
const TIPS_BMW: Tip[] = [
  { titulo: "Los boxer R-series necesitan ajuste de válvulas cada 10.000 km", detalle: "Las válvulas descentradas requieren revisión periódica. Ignorarlo genera pérdida de compresión." },
  { titulo: "El eje cardán pide aceite de transmisión cada 20.000 km", detalle: "Es mágico en durabilidad pero muchos riders olvidan este mantenimiento crítico." },
];
const TIPS_KAWASAKI: Tip[] = [
  { titulo: "Las Ninja piden aceite sintético 10W-40 API SJ o superior", detalle: "Con aceite mineral la temperatura del aceite sube 15°C más en ciudad, acelerando el desgaste." },
  { titulo: "El refrigerante de las motos líquidas pide revisión cada 2 años", detalle: "El refrigerante viejo corroe el sistema. Cámbialo o los problemas llegarán solos." },
];
const TIPS_TRIUMPH: Tip[] = [
  { titulo: "Los triples de Triumph necesitan aceite 10W-40 sintético de calidad", detalle: "Escatimar en aceite se nota inmediatamente en la suavidad del motor. No lo hagas." },
  { titulo: "La Bonneville air-cooled pide revisión de carburación cada 10.000 km", detalle: "Una mezcla rica consume 15% más y ensucia la bujía prematuramente." },
];
const TIPS_GENERICOS: Tip[] = [
  { titulo: "Haz el T-CLOCS antes de salir (2 minutos que salvan vidas)", detalle: "Luces, presión de llantas, nivel de aceite en frío, frenos. Pequeño hábito, gran diferencia." },
  { titulo: "Con lluvia la distancia de frenado en moto se duplica", detalle: "Frena SIEMPRE antes de la curva, nunca dentro. Si hay aceite en la vía, amplía 3x la distancia." },
  { titulo: "La presión de llantas baja 1 PSI por cada 5°C menos de temperatura", detalle: "En Bogotá de mañana puede bajar 3-4 PSI vs la tarde. Revisa siempre en frío." },
  { titulo: "¿Cuándo cambiaste la bujía por última vez?", detalle: "Cada 10.000 km para bujía estándar, 20.000 km para iridio. Una bujía gastada sube el consumo y baja la potencia." },
  { titulo: "El freno trasero da el 70% de la estabilidad al frenar", detalle: "Úsalo siempre junto al delantero — nunca solo. Así frenas más corto y con más control." },
];

function getTip(brand?: string): Tip {
  const b = (brand || "").toLowerCase();
  let pool = TIPS_GENERICOS;
  if (b.includes("honda"))    pool = [...TIPS_HONDA, ...TIPS_GENERICOS];
  else if (b.includes("yamaha"))   pool = [...TIPS_YAMAHA, ...TIPS_GENERICOS];
  else if (b.includes("suzuki"))   pool = [...TIPS_SUZUKI, ...TIPS_GENERICOS];
  else if (b.includes("kawasaki")) pool = [...TIPS_KAWASAKI, ...TIPS_GENERICOS];
  else if (b.includes("bmw"))      pool = [...TIPS_BMW, ...TIPS_GENERICOS];
  else if (b.includes("triumph"))  pool = [...TIPS_TRIUMPH, ...TIPS_GENERICOS];
  return pool[Math.floor(Math.random() * pool.length)];
}

async function doWeeklyTips() {
  const now       = new Date();
  const dayOfWeek = now.getUTCDay();
  if (dayOfWeek !== 1) return; // Solo lunes

  const cutoff = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000).toISOString();

  const { data: riders } = await supabase
    .from("riders")
    .select("telefono, nombre, moto_marca")
    .eq("notif_activa", true)
    .not("telefono", "is", null)
    .or(`ultima_notif_tip.is.null,ultima_notif_tip.lt.${cutoff}`);

  if (!riders?.length) return;

  for (const r of riders) {
    const nombre = r.nombre?.split(" ")[0] || "parcero";
    const tip    = getTip(r.moto_marca);
    const ok     = await sendTemplate(r.telefono, "tip_mantenimiento", [tip.titulo, tip.detalle]);
    if (ok) {
      await supabase.from("riders").update({ ultima_notif_tip: now.toISOString() }).eq("telefono", r.telefono);
      await logNotif(r.telefono, "tip_semanal", `${tip.titulo}: ${tip.detalle}`);
    }
    // Si falla la plantilla, intenta texto libre como respaldo
    else {
      const msg = `Buenos días ${nombre}! 👋\n\n🔧 Tip Ridera: ${tip.titulo}.\n${tip.detalle}\n\nCuida tu moto y ella te cuida a ti. 🏍️`;
      const okTexto = await sendWA(r.telefono, msg);
      if (okTexto) {
        await supabase.from("riders").update({ ultima_notif_tip: now.toISOString() }).eq("telefono", r.telefono);
        await logNotif(r.telefono, "tip_semanal_texto", msg);
      }
    }
  }
}

// ─── SEGUIMIENTO FOLLOW-UPS ───────────────────────────────────────────────────
async function doSeguimientos() {
  const now = new Date().toISOString();

  const { data: items } = await supabase
    .from("rita_seguimiento")
    .select("id, telefono, nota")
    .eq("completado", false)
    .lte("fecha_followup", now)
    .limit(50);

  if (!items?.length) return;

  for (const item of items) {
    const { data: rider } = await supabase
      .from("riders")
      .select("nombre")
      .or(`telefono.eq.${item.telefono}`)
      .maybeSingle();
    const nombre = rider?.nombre?.split(" ")[0] || "parcero";

    const msg = `Ey ${nombre} 👋 Rita aquí. La última vez que hablamos me contaste: "${item.nota}" — ¿cómo quedó eso? ¿Pudiste resolverlo? 🏍️`;
    const ok  = await sendWA(item.telefono, msg);
    if (ok) {
      await supabase.from("rita_seguimiento").update({ completado: true }).eq("id", item.id);
      await logNotif(item.telefono, "seguimiento", msg);
    }
  }
}

// ─── COMMUNITY MATCHING ───────────────────────────────────────────────────────
async function doCommunityMatch() {
  const { data: riders } = await supabase
    .from("riders")
    .select("telefono, nombre, moto_marca, moto_modelo, ciudad")
    .eq("notif_activa", true)
    .not("telefono", "is", null)
    .not("moto_marca", "is", null)
    .not("ciudad", "is", null);

  if (!riders || riders.length < 2) return;

  const groups: Record<string, typeof riders> = {};
  for (const r of riders) {
    const key = `${(r.moto_marca || "").toLowerCase()}|${(r.ciudad || "").toLowerCase()}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push(r);
  }

  for (const [, group] of Object.entries(groups)) {
    if (group.length < 2) continue;
    for (let i = 0; i < group.length - 1; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const a = group[i];
        const b = group[j];
        if (a.telefono === b.telefono) continue;
        const [ta, tb] = [a.telefono, b.telefono].sort();
        const { data: existing } = await supabase
          .from("rita_matches_log")
          .select("id")
          .eq("telefono_a", ta)
          .eq("telefono_b", tb)
          .maybeSingle();
        if (existing) continue;

        const moto = [a.moto_marca, a.moto_modelo].filter(Boolean).join(" ");
        const msgA = `¡Ey ${a.nombre?.split(" ")[0] || "parcero"}! Conocí a otro/a rider en ${a.ciudad} con ${moto} igual a la tuya. ¿Te interesa conectar? La comunidad Ridera crece 🏍️🤝`;
        const msgB = `¡Ey ${b.nombre?.split(" ")[0] || "parcero"}! Hay otro rider en ${b.ciudad} con ${moto} como la tuya. ¿Quieres que los presente? ¡La familia Ridera siempre suma! 🏍️🤝`;

        const [okA, okB] = await Promise.all([sendWA(a.telefono, msgA), sendWA(b.telefono, msgB)]);
        if (okA || okB) {
          await supabase.from("rita_matches_log").insert({ telefono_a: ta, telefono_b: tb });
          await logNotif(a.telefono, "community_match", msgA);
          await logNotif(b.telefono, "community_match", msgB);
        }
        break;
      }
    }
  }
}

// ─── MAIN HANDLER ─────────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  const url    = new URL(req.url);
  const secret = url.searchParams.get("secret") || req.headers.get("x-broadcast-secret");
  const expectedSecret = Deno.env.get("BROADCAST_SECRET");
  if (expectedSecret && secret !== expectedSecret) {
    return new Response("Unauthorized", { status: 401 });
  }

  const results: Record<string, string> = {};

  try { await doDocReminders();    results.doc_reminders   = "ok"; } catch (e) { results.doc_reminders   = String(e); }
  try { await doWeeklyTips();      results.weekly_tips     = "ok"; } catch (e) { results.weekly_tips     = String(e); }
  try { await doSeguimientos();    results.seguimientos    = "ok"; } catch (e) { results.seguimientos    = String(e); }
  try { await doCommunityMatch();  results.community_match = "ok"; } catch (e) { results.community_match = String(e); }

  return new Response(JSON.stringify({ ok: true, results }), {
    headers: { "Content-Type": "application/json" },
  });
});
