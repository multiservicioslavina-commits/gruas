// ─────────────────────────────────────────────────────────────────
// Rita Phase 6 — Smart Recommendations Engine
//
// Motor de recomendaciones inteligentes basado en:
//   - Mantenimiento predictivo (km del rider)
//   - Estacionalidad (clima, festividades)
//   - Nivel de experiencia
//   - Patrones de conducción
// ─────────────────────────────────────────────────────────────────

import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase: SupabaseClient = createClient(SB_URL, SB_KEY);

export type Recommendation = {
  id: string;
  type: string;
  productName: string;
  reason: string;
  estimatedPrice: number;
  actionUrl: string;
  priority: number;
};

// ─── Obtener recomendaciones pendientes para un rider ─────────────
export async function obtenerRecomendacionesPendientes(
  phone: string,
  limite: number = 3,
): Promise<Recommendation[]> {
  try {
    const tel = phone.replace(/^57/, "");

    const { data: rider } = await supabase
      .from("riders")
      .select("id")
      .or(`telefono.eq.${tel},telefono.eq.57${tel},telefono.eq.+57${tel}`)
      .maybeSingle();

    if (!rider) return [];

    const { data: recomendaciones } = await supabase
      .from("rider_product_recommendations")
      .select("id, recommendation_type, product_name, reason, estimated_price, product_url")
      .eq("rider_id", rider.id)
      .eq("shown_in_chat", false)
      .gt("valid_until", new Date().toISOString())
      .order("recommendation_type", { ascending: true }) // maintenance first
      .limit(limite);

    if (!recomendaciones) return [];

    return recomendaciones.map((r) => ({
      id: r.id,
      type: r.recommendation_type,
      productName: r.product_name,
      reason: r.reason,
      estimatedPrice: r.estimated_price || 0,
      actionUrl: r.product_url || "https://ridera.com.co/marketplace",
      priority: r.recommendation_type === "maintenance" ? 1 : 2,
    }));
  } catch (e) {
    console.error("Error obteniendo recomendaciones pendientes:", e);
    return [];
  }
}

// ─── Calcular próximo mantenimiento basado en km ──────────────────
export async function calcularProximoMantenimiento(phone: string): Promise<string> {
  try {
    const tel = phone.replace(/^57/, "");

    const { data: rider } = await supabase
      .from("riders")
      .select("id, moto_marca, moto_modelo")
      .or(`telefono.eq.${tel},telefono.eq.57${tel},telefono.eq.+57${tel}`)
      .maybeSingle();

    if (!rider) return "";

    // Obtener último km registrado
    const { data: ultimaSesion } = await supabase
      .from("rider_sessions")
      .select("distancia_km")
      .eq("rider_id", rider.id)
      .order("fecha_inicio", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!ultimaSesion) return "";

    const kmActual = Math.round((ultimaSesion.distancia_km || 0) * 10) / 10;

    // Datos de mantenimiento genéricos (idealmente de garage_tecnico)
    const mapaMoto: Record<string, { aceite: number; filtro: number; cadena: number }> = {
      "cb500": { aceite: 9000, filtro: 9000, cadena: 6000 },
      "mt07": { aceite: 10000, filtro: 10000, cadena: 6000 },
      "ninja": { aceite: 8000, filtro: 8000, cadena: 6000 },
      "bmw": { aceite: 15000, filtro: 15000, cadena: 8000 },
      "default": { aceite: 10000, filtro: 10000, cadena: 6000 },
    };

    const patron = rider.moto_marca?.toLowerCase() || "default";
    const specs = mapaMoto[patron] || mapaMoto["default"];

    // Registrar en cronograma
    const { data: schedule } = await supabase
      .from("rider_maintenance_schedule")
      .select("id")
      .eq("rider_id", rider.id)
      .maybeSingle();

    if (schedule) {
      await supabase
        .from("rider_maintenance_schedule")
        .update({
          aceite_proximo_km: specs.aceite,
          filtro_proximo_km: specs.filtro,
          cadena_proximo_km: specs.cadena,
          aceite_proximo_mes: Math.ceil((specs.aceite - kmActual) / 500), // estimado
        })
        .eq("rider_id", rider.id);
    } else {
      await supabase.from("rider_maintenance_schedule").insert({
        rider_id: rider.id,
        aceite_proximo_km: specs.aceite,
        filtro_proximo_km: specs.filtro,
        cadena_proximo_km: specs.cadena,
      });
    }

    // Generar recomendaciones de mantenimiento si aplica
    const recomendaciones = [];

    if (kmActual >= specs.aceite - 1000) {
      recomendaciones.push({
        type: "maintenance",
        reason: `Tu ${rider.moto_marca} ${rider.moto_modelo} lleva ${kmActual}km. Toca cambio de aceite.`,
        product: "Aceite de motor (10W-40)",
        price: 45000,
      });
    }

    if (kmActual >= specs.filtro - 1000) {
      recomendaciones.push({
        type: "maintenance",
        reason: `Filtro de aire debido. Últimos km de filtración óptima.`,
        product: "Filtro de aire",
        price: 25000,
      });
    }

    if (kmActual >= specs.cadena - 500) {
      recomendaciones.push({
        type: "maintenance",
        reason: `Limpieza y lubricación de cadena recomendada.`,
        product: "Lubricante de cadena",
        price: 30000,
      });
    }

    // Crear recomendaciones en DB
    for (const rec of recomendaciones) {
      const { data: existe } = await supabase
        .from("rider_product_recommendations")
        .select("id")
        .eq("rider_id", rider.id)
        .eq("recommendation_type", rec.type)
        .eq("shown_in_chat", false)
        .maybeSingle();

      if (!existe) {
        await supabase.from("rider_product_recommendations").insert({
          rider_id: rider.id,
          product_name: rec.product,
          recommendation_type: rec.type,
          reason: rec.reason,
          estimated_price: rec.price,
          reason_data: { km: kmActual, component: rec.type },
          valid_until: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        });
      }
    }

    return recomendaciones.length > 0 ? "Recomendaciones de mantenimiento generadas." : "";
  } catch (e) {
    console.error("Error calculando próximo mantenimiento:", e);
    return "";
  }
}

// ─── Recomendaciones estacionales basadas en clima ─────────────────
export async function generarRecomendacionesEstacionales(phone: string): Promise<void> {
  try {
    const tel = phone.replace(/^57/, "");

    const { data: rider } = await supabase
      .from("riders")
      .select("id, ciudad")
      .or(`telefono.eq.${tel},telefono.eq.57${tel},telefono.eq.+57${tel}`)
      .maybeSingle();

    if (!rider) return;

    const ahora = new Date();
    const mes = ahora.getMonth() + 1; // 1-12

    // Determinar temporada
    const esTemporadaLluvia = [5, 6, 7, 8, 9, 10, 11].includes(mes);
    const esTemporadaFestival = [6, 12].includes(mes);

    const recomendaciones = [];

    if (esTemporadaLluvia) {
      recomendaciones.push({
        type: "seasonal",
        reason: "Vemos lluvia en tu zona. Protege tu moto.",
        product: "Cobertor impermeable",
        price: 35000,
      });
      recomendaciones.push({
        type: "seasonal",
        reason: "Temporada de lluvia: mejora tu visibilidad.",
        product: "Guantes impermeables",
        price: 65000,
      });
    }

    if (esTemporadaFestival) {
      recomendaciones.push({
        type: "seasonal",
        reason: "Próximo rodada/festival. Prepárate.",
        product: "Bandera para moto",
        price: 15000,
      });
    }

    // Crear recomendaciones si no existen
    for (const rec of recomendaciones) {
      const { data: existe } = await supabase
        .from("rider_product_recommendations")
        .select("id")
        .eq("rider_id", rider.id)
        .eq("recommendation_type", rec.type)
        .eq("product_name", rec.product)
        .maybeSingle();

      if (!existe) {
        await supabase.from("rider_product_recommendations").insert({
          rider_id: rider.id,
          product_name: rec.product,
          recommendation_type: rec.type,
          reason: rec.reason,
          estimated_price: rec.price,
          reason_data: { season: esTemporadaLluvia ? "rain" : "festival" },
          valid_until: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(),
        });
      }
    }
  } catch (e) {
    console.error("Error generando recomendaciones estacionales:", e);
  }
}

// ─── Recomendaciones basadas en experiencia ───────────────────────
export async function generarRecomendacionesExperiencia(phone: string): Promise<void> {
  try {
    const tel = phone.replace(/^57/, "");

    const { data: rider } = await supabase
      .from("riders")
      .select("id, experiencia")
      .or(`telefono.eq.${tel},telefono.eq.57${tel},telefono.eq.+57${tel}`)
      .maybeSingle();

    if (!rider) return;

    // Obtener km totales (proxy para experiencia)
    const { data: stats } = await supabase
      .from("rider_monthly_stats")
      .select("total_distancia_km")
      .eq("rider_id", rider.id)
      .order("mes", { ascending: false })
      .limit(12);

    const kmTotal = (stats || []).reduce((sum, s) => sum + (s.total_distancia_km || 0), 0);

    let nivel = "beginner";
    if (kmTotal > 5000) nivel = "expert";
    else if (kmTotal > 1000) nivel = "intermediate";

    const recomendacionesPorNivel: Record<string, Array<{ product: string; reason: string; price: number }>> = {
      beginner: [
        { product: "Casco integral premium", reason: "Upgrade en seguridad crítica", price: 250000 },
        { product: "Guantes de protección", reason: "Protección en caso de caída", price: 80000 },
        { product: "Kit herramientas básicas", reason: "Aprende a mantener tu moto", price: 120000 },
      ],
      intermediate: [
        { product: "Asiento deportivo", reason: "Comodidad en viajes largos", price: 350000 },
        { product: "Parrilla trasera", reason: "Lleva accesorios y carga", price: 150000 },
        { product: "Filtro de aire deportivo", reason: "Mejor flujo de aire", price: 90000 },
      ],
      expert: [
        { product: "Sistema de escape deportivo", reason: "Mejora performance", price: 800000 },
        { product: "Llantas de carrera", reason: "Agarre superior", price: 600000 },
        { product: "Maleteros de aluminio", reason: "Touring confort total", price: 1200000 },
      ],
    };

    const recomendaciones = recomendacionesPorNivel[nivel] || [];

    for (const rec of recomendaciones.slice(0, 2)) {
      const { data: existe } = await supabase
        .from("rider_product_recommendations")
        .select("id")
        .eq("rider_id", rider.id)
        .eq("product_name", rec.product)
        .maybeSingle();

      if (!existe) {
        await supabase.from("rider_product_recommendations").insert({
          rider_id: rider.id,
          product_name: rec.product,
          recommendation_type: "experience",
          reason: rec.reason,
          estimated_price: rec.price,
          reason_data: { level: nivel, km_total: kmTotal },
          valid_until: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
        });
      }
    }
  } catch (e) {
    console.error("Error generando recomendaciones de experiencia:", e);
  }
}

// ─── Registrar cuando un rider compra una recomendación ───────────
export async function registrarCompraRecomendacion(
  phone: string,
  recommendationId: string,
  amount: number,
  source: string = "direct_link",
): Promise<boolean> {
  try {
    const tel = phone.replace(/^57/, "");

    const { data: rider } = await supabase
      .from("riders")
      .select("id")
      .or(`telefono.eq.${tel},telefono.eq.57${tel},telefono.eq.+57${tel}`)
      .maybeSingle();

    if (!rider) return false;

    // Calcular comisión: 7% base + 3% si viene de recomendación de Rita
    const commissionBase = amount * 0.07;
    const commissionBonus = source === "direct_link" ? amount * 0.03 : 0;
    const totalCommission = commissionBase + commissionBonus;

    // Actualizar recomendación
    const { error: updateError } = await supabase
      .from("rider_product_recommendations")
      .update({
        purchased: true,
        purchased_at: new Date().toISOString(),
        purchased_amount: amount,
        conversion_source: source,
        commission_earned: totalCommission,
      })
      .eq("id", recommendationId);

    if (updateError) {
      console.error("Error actualizando recomendación:", updateError);
      return false;
    }

    // Registrar en historial de conversiones
    await supabase.from("recommendation_conversions").insert({
      recommendation_id: recommendationId,
      rider_id: rider.id,
      purchased_at: new Date().toISOString(),
      amount,
      conversion_source: source,
    });

    // Actualizar perfil de compra
    const { data: profile } = await supabase
      .from("rider_shopping_profile")
      .select("total_purchases, total_spent")
      .eq("rider_id", rider.id)
      .maybeSingle();

    if (profile) {
      await supabase
        .from("rider_shopping_profile")
        .update({
          total_purchases: (profile.total_purchases || 0) + 1,
          total_spent: (profile.total_spent || 0) + amount,
          last_purchase_date: new Date().toISOString(),
        })
        .eq("rider_id", rider.id);
    } else {
      await supabase.from("rider_shopping_profile").insert({
        rider_id: rider.id,
        total_purchases: 1,
        total_spent: amount,
        last_purchase_date: new Date().toISOString(),
      });
    }

    console.log(`Compra registrada: $${amount} | Comisión: $${totalCommission}`);
    return true;
  } catch (e) {
    console.error("Error registrando compra recomendación:", e);
    return false;
  }
}

// ─── Generar contexto de recomendaciones para el prompt de Rita ──────
export async function generarContextoRecomendaciones(phone: string): Promise<string> {
  try {
    // Generar todas las recomendaciones si no existen
    await calcularProximoMantenimiento(phone);
    await generarRecomendacionesEstacionales(phone);
    await generarRecomendacionesExperiencia(phone);

    const recomendaciones = await obtenerRecomendacionesPendientes(phone, 5);

    if (!recomendaciones.length) return "";

    let contexto = `RECOMENDACIONES PENDIENTES (${recomendaciones.length}):\n`;
    recomendaciones.slice(0, 3).forEach((r) => {
      contexto += `• ${r.type}: ${r.productName} (~$${r.estimatedPrice})\n`;
    });
    contexto += `\nSolo menciona si es relevante al mensaje del rider. No las fuerces.`;

    return contexto;
  } catch (e) {
    console.error("Error generando contexto recomendaciones:", e);
    return "";
  }
}
