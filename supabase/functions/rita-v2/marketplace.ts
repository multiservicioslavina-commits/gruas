// ─────────────────────────────────────────────────────────────────
// Rita Phase 4 — Marketplace Motero
//
// Compra y venta de piezas y servicios entre riders:
//   - Listados de productos y servicios
//   - Búsqueda por categoría, ciudad, precio
//   - Transacciones y seguimiento de órdenes
//   - Reseñas y calificaciones de vendedores
// ─────────────────────────────────────────────────────────────────

import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase: SupabaseClient = createClient(SB_URL, SB_KEY);

export type Listing = {
  id: string;
  titulo: string;
  categoria: string;
  precio: number;
  condicion: string;
  ciudad: string;
  vendedor: {
    nombre: string;
    rating: number;
    verificado: boolean;
  };
  rating: number;
  imagenes?: string[];
};

export type Order = {
  id: string;
  listingId: string;
  titulo: string;
  estado: string;
  precioTotal: number;
  fechaCreacion: string;
  estimadoEntrega?: string;
};

export type SellerReview = {
  id: string;
  calificacion: number;
  titulo: string;
  contenido: string;
  autor: string;
  fecha: string;
};

// ─── Crear nuevo listado ────────────────────────────────────────
export async function crearListado(
  phone: string,
  titulo: string,
  descripcion: string,
  categoria: string,
  precio: number,
  condicion: string = "nuevo",
  ciudad?: string,
  imagenes?: string[],
): Promise<string | null> {
  try {
    const tel = phone.replace(/^57/, "");

    const { data: rider } = await supabase
      .from("riders")
      .select("id")
      .or(`telefono.eq.${tel},telefono.eq.57${tel},telefono.eq.+57${tel}`)
      .maybeSingle();

    if (!rider) return null;

    const { data, error } = await supabase
      .from("marketplace_listings")
      .insert({
        seller_id: rider.id,
        titulo,
        descripcion,
        categoria,
        precio,
        condicion,
        ciudad,
        imagenes,
      })
      .select("id");

    if (error) throw error;
    return data?.[0]?.id || null;
  } catch (e) {
    console.error("Error creando listado:", e);
    return null;
  }
}

// ─── Buscar productos en marketplace ────────────────────────────
export async function buscarProductos(
  categoria?: string,
  ciudad?: string,
  precioMin?: number,
  precioMax?: number,
  termino?: string,
  maxResultados: number = 20,
): Promise<Listing[]> {
  try {
    let query = supabase.from("marketplace_listings").select("*").eq("disponible", true);

    if (categoria) {
      query = query.eq("categoria", categoria);
    }

    if (ciudad) {
      query = query.eq("ciudad", ciudad);
    }

    if (precioMin) {
      query = query.gte("precio", precioMin);
    }

    if (precioMax) {
      query = query.lte("precio", precioMax);
    }

    const { data: listings } = await query.order("created_at", { ascending: false }).limit(maxResultados);

    if (!listings) return [];

    // Enriquecer con info del vendedor
    const enriched = await Promise.all(
      listings.map(async (l) => {
        const { data: seller } = await supabase
          .from("riders")
          .select("nombre")
          .eq("id", l.seller_id)
          .maybeSingle();

        const { data: profile } = await supabase
          .from("marketplace_seller_profiles")
          .select("vendedor_verificado")
          .eq("seller_id", l.seller_id)
          .maybeSingle();

        return {
          id: l.id,
          titulo: l.titulo,
          categoria: l.categoria,
          precio: l.precio,
          condicion: l.condicion,
          ciudad: l.ciudad,
          vendedor: {
            nombre: seller?.nombre || "Anónimo",
            rating: l.rating_promedio,
            verificado: profile?.vendedor_verificado || false,
          },
          rating: l.rating_promedio,
          imagenes: l.imagenes,
        };
      }),
    );

    return enriched;
  } catch (e) {
    console.error("Error buscando productos:", e);
    return [];
  }
}

// ─── Obtener detalles de un listado ─────────────────────────────
export async function obtenerListado(listingId: string): Promise<Listing | null> {
  try {
    const { data: listing } = await supabase
      .from("marketplace_listings")
      .select("*")
      .eq("id", listingId)
      .maybeSingle();

    if (!listing) return null;

    const { data: seller } = await supabase
      .from("riders")
      .select("nombre")
      .eq("id", listing.seller_id)
      .maybeSingle();

    const { data: profile } = await supabase
      .from("marketplace_seller_profiles")
      .select("vendedor_verificado")
      .eq("seller_id", listing.seller_id)
      .maybeSingle();

    // Incrementar veces consultado
    await supabase
      .from("marketplace_listings")
      .update({ veces_consultado: (listing.veces_consultado || 0) + 1 })
      .eq("id", listingId);

    return {
      id: listing.id,
      titulo: listing.titulo,
      categoria: listing.categoria,
      precio: listing.precio,
      condicion: listing.condicion,
      ciudad: listing.ciudad,
      vendedor: {
        nombre: seller?.nombre || "Anónimo",
        rating: listing.rating_promedio,
        verificado: profile?.vendedor_verificado || false,
      },
      rating: listing.rating_promedio,
      imagenes: listing.imagenes,
    };
  } catch (e) {
    console.error("Error obteniendo listado:", e);
    return null;
  }
}

// ─── Crear orden de compra ──────────────────────────────────────
export async function crearOrden(
  phone: string,
  listingId: string,
  cantidad: number = 1,
  metodoPago?: string,
): Promise<string | null> {
  try {
    const tel = phone.replace(/^57/, "");

    const { data: buyer } = await supabase
      .from("riders")
      .select("id")
      .or(`telefono.eq.${tel},telefono.eq.57${tel},telefono.eq.+57${tel}`)
      .maybeSingle();

    if (!buyer) return null;

    const { data: listing } = await supabase
      .from("marketplace_listings")
      .select("seller_id, precio")
      .eq("id", listingId)
      .maybeSingle();

    if (!listing) return null;

    const precioTotal = listing.precio * cantidad;

    const { data, error } = await supabase
      .from("marketplace_orders")
      .insert({
        listing_id: listingId,
        buyer_id: buyer.id,
        seller_id: listing.seller_id,
        cantidad,
        precio_unitario: listing.precio,
        precio_total: precioTotal,
        metodo_pago: metodoPago,
      })
      .select("id");

    if (error) throw error;
    return data?.[0]?.id || null;
  } catch (e) {
    console.error("Error creando orden:", e);
    return null;
  }
}

// ─── Obtener mis órdenes ───────────────────────────────────────
export async function obtenerMisOrdenes(phone: string): Promise<Order[]> {
  try {
    const tel = phone.replace(/^57/, "");

    const { data: rider } = await supabase
      .from("riders")
      .select("id")
      .or(`telefono.eq.${tel},telefono.eq.57${tel},telefono.eq.+57${tel}`)
      .maybeSingle();

    if (!rider) return [];

    const { data: ordenes } = await supabase
      .from("marketplace_orders")
      .select("*, marketplace_listings(titulo)")
      .eq("buyer_id", rider.id)
      .order("created_at", { ascending: false });

    if (!ordenes) return [];

    return ordenes.map((o) => ({
      id: o.id,
      listingId: o.listing_id,
      titulo: (o.marketplace_listings as { titulo: string }).titulo,
      estado: o.estado,
      precioTotal: o.precio_total,
      fechaCreacion: o.created_at,
      estimadoEntrega: o.fecha_estimada_entrega,
    }));
  } catch (e) {
    console.error("Error obteniendo órdenes:", e);
    return [];
  }
}

// ─── Dejar reseña de vendedor ───────────────────────────────────
export async function dejarResena(
  phone: string,
  orderId: string,
  calificacion: number,
  titulo: string,
  contenido: string,
  positivos?: string[],
  negativos?: string[],
): Promise<boolean> {
  try {
    const tel = phone.replace(/^57/, "");

    const { data: reviewer } = await supabase
      .from("riders")
      .select("id")
      .or(`telefono.eq.${tel},telefono.eq.57${tel},telefono.eq.+57${tel}`)
      .maybeSingle();

    if (!reviewer) return false;

    const { data: orden } = await supabase
      .from("marketplace_orders")
      .select("seller_id")
      .eq("id", orderId)
      .maybeSingle();

    if (!orden) return false;

    const { error } = await supabase.from("marketplace_reviews").insert({
      order_id: orderId,
      reviewer_id: reviewer.id,
      reviewed_id: orden.seller_id,
      calificacion,
      titulo,
      contenido,
      aspectos_positivos: positivos,
      aspectos_negativos: negativos,
    });

    if (error) throw error;

    // Actualizar promedio de rating del vendedor
    const { data: resenas } = await supabase
      .from("marketplace_reviews")
      .select("calificacion")
      .eq("reviewed_id", orden.seller_id);

    if (resenas && resenas.length > 0) {
      const promedio =
        resenas.reduce((sum, r) => sum + r.calificacion, 0) / resenas.length;
      await supabase
        .from("marketplace_seller_profiles")
        .update({
          cantidad_resenas: resenas.length,
        })
        .eq("seller_id", orden.seller_id);
    }

    return true;
  } catch (e) {
    console.error("Error dejando reseña:", e);
    return false;
  }
}

// ─── Obtener reseñas de un vendedor ─────────────────────────────
export async function obtenerResenasVendedor(sellerId: string): Promise<SellerReview[]> {
  try {
    const { data: resenas } = await supabase
      .from("marketplace_reviews")
      .select("*, riders(nombre)")
      .eq("reviewed_id", sellerId)
      .order("created_at", { ascending: false })
      .limit(10);

    if (!resenas) return [];

    return resenas.map((r) => ({
      id: r.id,
      calificacion: r.calificacion,
      titulo: r.titulo,
      contenido: r.contenido,
      autor: (r.riders as { nombre: string }).nombre || "Anónimo",
      fecha: r.created_at,
    }));
  } catch (e) {
    console.error("Error obteniendo reseñas:", e);
    return [];
  }
}

// ─── Agregar a favoritos ────────────────────────────────────────
export async function agregarAFavoritos(phone: string, listingId: string): Promise<boolean> {
  try {
    const tel = phone.replace(/^57/, "");

    const { data: rider } = await supabase
      .from("riders")
      .select("id")
      .or(`telefono.eq.${tel},telefono.eq.57${tel},telefono.eq.+57${tel}`)
      .maybeSingle();

    if (!rider) return false;

    const { error } = await supabase.from("marketplace_favorites").insert({
      rider_id: rider.id,
      listing_id: listingId,
    });

    if (error && error.code !== "23505") throw error;
    return true;
  } catch (e) {
    console.error("Error agregando a favoritos:", e);
    return false;
  }
}

// ─── Obtener mis favoritos ─────────────────────────────────────
export async function obtenerMisFavoritos(phone: string): Promise<Listing[]> {
  try {
    const tel = phone.replace(/^57/, "");

    const { data: rider } = await supabase
      .from("riders")
      .select("id")
      .or(`telefono.eq.${tel},telefono.eq.57${tel},telefono.eq.+57${tel}`)
      .maybeSingle();

    if (!rider) return [];

    const { data: favoritos } = await supabase
      .from("marketplace_favorites")
      .select("*, marketplace_listings(*)")
      .eq("rider_id", rider.id);

    if (!favoritos) return [];

    const enriched = await Promise.all(
      favoritos.map(async (f) => {
        const l = f.marketplace_listings as Record<string, unknown>;
        const { data: seller } = await supabase
          .from("riders")
          .select("nombre")
          .eq("id", l.seller_id as string)
          .maybeSingle();

        return {
          id: l.id as string,
          titulo: l.titulo as string,
          categoria: l.categoria as string,
          precio: l.precio as number,
          condicion: l.condicion as string,
          ciudad: l.ciudad as string,
          vendedor: {
            nombre: seller?.nombre || "Anónimo",
            rating: l.rating_promedio as number,
            verificado: false,
          },
          rating: l.rating_promedio as number,
        };
      }),
    );

    return enriched;
  } catch (e) {
    console.error("Error obteniendo favoritos:", e);
    return [];
  }
}

// ─── Generar contexto del marketplace para el prompt ────────────
export async function generarContextoMarketplace(phone: string): Promise<string> {
  try {
    const ordenes = await obtenerMisOrdenes(phone);
    const favoritos = await obtenerMisFavoritos(phone);

    if (ordenes.length === 0 && favoritos.length === 0) return "";

    let contexto = "MARKETPLACE DEL RIDER:\n";

    if (ordenes.length > 0) {
      const ordenesActivas = ordenes.filter((o) => o.estado !== "entregado" && o.estado !== "cancelado");
      if (ordenesActivas.length > 0) {
        contexto += `📦 Órdenes activas: ${ordenesActivas.length} (total gastado: $${ordenes.reduce((sum, o) => sum + o.precioTotal, 0)})\n`;
      }
    }

    if (favoritos.length > 0) {
      contexto += `❤️ Favoritos: ${favoritos.length} artículos guardados\n`;
    }

    return contexto;
  } catch (e) {
    console.error("Error generando contexto marketplace:", e);
    return "";
  }
}
