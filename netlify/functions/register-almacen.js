// netlify/functions/register-almacen.js
// Maneja el registro completo de almacenes con todos los campos del formulario WordPress
// Soporta: logo, fotos, categorias, marcas, horarios, opciones de entrega

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const headers = {
  "Content-Type": "application/json",
  apikey: SUPABASE_SERVICE_KEY,
  Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
};

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method not allowed" };
  }

  try {
    const body = JSON.parse(event.body);
    const {
      nombre,
      ciudad,
      telefono,
      email,
      ubicacion,
      contacto_nombre,
      logo_url,
      fotos_urls,
      categorias,
      brands,
      horarios,
      delivery_options,
      password,
    } = body;

    // Validar campos obligatorios
    if (!nombre || !ciudad || !telefono || !email || !password) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: "Faltan campos obligatorios: nombre, ciudad, telefono, email, password",
        }),
      };
    }

    // 1. Crear la cuenta en Supabase Auth
    const authRes = await fetch(
      `${SUPABASE_URL}/auth/v1/signup`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_SERVICE_KEY,
        },
        body: JSON.stringify({
          email,
          password,
        }),
      }
    );

    if (!authRes.ok) {
      const authError = await authRes.json();
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: authError.message || "No se pudo crear la cuenta",
        }),
      };
    }

    const authUser = await authRes.json();
    const userId = authUser.user.id;

    // 2. Generar slug desde el nombre
    const slug = nombre
      .toLowerCase()
      .trim()
      .replace(/\s+/g, "-")
      .replace(/[^\w-]/g, "");

    // 3. Crear el registro en almacenes
    const almacenRes = await fetch(
      `${SUPABASE_URL}/rest/v1/almacenes`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          slug,
          nombre: nombre.trim(),
          ciudad: ciudad.trim(),
          telefono: telefono.trim(),
          email: email.trim(),
          ubicacion: ubicacion || null,
          contacto_nombre: contacto_nombre || null,
          logo_url: logo_url || null,
          fotos_urls: fotos_urls || [],
          categorias: categorias || [],
          brands: brands || [],
          delivery_options: delivery_options || [],
          auth_id: userId,
          status: "activo",
        }),
      }
    );

    if (!almacenRes.ok) {
      const almacenError = await almacenRes.json();
      console.error("Error crear almacen:", almacenError);
      // Intentar limpiar la cuenta creada si falla el almacen
      await fetch(
        `${SUPABASE_URL}/auth/v1/admin/users/${userId}`,
        {
          method: "DELETE",
          headers: {
            apikey: SUPABASE_SERVICE_KEY,
            Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
          },
        }
      ).catch(() => {}); // Ignorar errores en limpieza

      return {
        statusCode: 400,
        body: JSON.stringify({
          error: almacenError.message || "No se pudo crear el almacén",
        }),
      };
    }

    const almacen = await almacenRes.json();

    // 4. Crear horarios si se proporcionaron
    if (horarios && Array.isArray(horarios) && horarios.length > 0) {
      for (const horario of horarios) {
        await fetch(`${SUPABASE_URL}/rest/v1/almacen_horarios`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            almacen_id: almacen[0].id,
            dia_semana: horario.dia_semana,
            hora_apertura: horario.hora_apertura,
            hora_cierre: horario.hora_cierre,
            abierto: horario.abierto !== false,
          }),
        }).catch((err) => {
          console.error(`Error crear horario para día ${horario.dia_semana}:`, err);
        });
      }
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        almacen_id: almacen[0].id,
        slug: almacen[0].slug,
        message: "Almacén registrado exitosamente",
      }),
    };
  } catch (err) {
    console.error("Register almacen error:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "Error interno del servidor",
      }),
    };
  }
};
