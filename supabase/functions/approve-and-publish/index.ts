import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const WP_API = "https://ridera.com.co/wp-json/wp/v2";
const WP_USER = Deno.env.get("WP_USER") || "1";
const WP_PASS = Deno.env.get("WP_PASSWORD") || "";
const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SB_URL, SB_KEY);

// Crear post en WordPress
async function crearPostWP(tipo: string, datos: any) {
  const postTypeMap: Record<string, string> = {
    talleres: "talleres",
    almacenes: "almacenes",
    gruas: "gruas",
  };

  const postType = postTypeMap[tipo] || tipo;

  const postData = {
    title: datos.nombre,
    content: `<p>${datos.descripcion || ""}</p>
      <p><strong>Contacto:</strong> ${datos.email || ""}</p>
      <p><strong>Teléfono:</strong> ${datos.telefono || ""}</p>
      <p><strong>Ciudad:</strong> ${datos.ciudad || ""}</p>`,
    status: "publish",
    type: postType,
    author: WP_USER,
    meta: {
      email: datos.email,
      telefono: datos.telefono,
      ciudad: datos.ciudad,
      descripcion: datos.descripcion,
    },
  };

  try {
    const auth = btoa(`${WP_USER}:${WP_PASS}`);
    const response = await fetch(`${WP_API}/${postType}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${auth}`,
      },
      body: JSON.stringify(postData),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`WordPress error ${response.status}: ${error}`);
    }

    const result = await response.json();
    return result.id;
  } catch (err) {
    console.error(`Error creando post en WordPress:`, err.message);
    throw err;
  }
}

// Procesar aprobación de registros
async function procesarAprobacion(
  tipo: string,
  id: string,
  datos: any
) {
  try {
    console.log(`[${tipo}] Aprobando registro ${id}: ${datos.nombre}`);

    // Crear post en WordPress
    const wpPostId = await crearPostWP(tipo, datos);
    console.log(`[${tipo}] Post creado en WordPress: ${wpPostId}`);

    // Actualizar registro en Supabase con ID del post de WordPress
    await supabase
      .from(tipo)
      .update({
        wp_post_id: wpPostId,
        estado: "aprobado",
        aprobado_en: new Date().toISOString(),
      })
      .eq("id", id);

    console.log(`[${tipo}] Registro ${id} completamente aprobado`);
    return { success: true, wpPostId };
  } catch (err) {
    console.error(`Error procesando aprobación:`, err);

    // Marcar como error en Supabase
    await supabase
      .from(tipo)
      .update({
        estado: "error",
        error_msg: err.message,
      })
      .eq("id", id)
      .catch(() => {});

    throw err;
  }
}

// Handler principal
Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const payload = await req.json();
    const { tipo, id, datos } = payload;

    if (!tipo || !id || !datos) {
      return new Response("Missing required fields", { status: 400 });
    }

    const result = await procesarAprobacion(tipo, id, datos);
    return new Response(JSON.stringify(result), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Function error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
