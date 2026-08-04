// netlify/functions/upload-almacen-image.js
// Maneja carga de imágenes (logo y fotos) a Supabase Storage
// Retorna URL pública para guardar en el registro

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const headers = {
  apikey: SUPABASE_SERVICE_KEY,
  Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
};

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method not allowed" };
  }

  try {
    // Parse multipart form data o base64 JSON
    let file, filename, bucket;

    if (event.headers["content-type"]?.includes("multipart/form-data")) {
      // Para uploads desde formulario HTML (si se usa FormData)
      // Netlify maneja esto automáticamente en event.body si tiene archivos
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: "Usa application/json con base64 encoding",
        }),
      };
    } else {
      // Parse JSON con base64
      const body = JSON.parse(event.body);
      const { image_base64, filename: fname, type } = body;

      if (!image_base64 || !fname) {
        return {
          statusCode: 400,
          body: JSON.stringify({
            error: "Faltan image_base64 y filename",
          }),
        };
      }

      // Decodificar base64
      const buffer = Buffer.from(image_base64, "base64");

      // Determinar bucket y ruta según tipo
      bucket = "almacenes";
      const timestamp = Date.now();
      const uniqueFilename = `${timestamp}-${fname}`;
      const filepath = `images/${uniqueFilename}`;

      filename = filepath;
      file = buffer;
    }

    // Crear bucket si no existe (attempt, ignorar si ya existe)
    await fetch(`${SUPABASE_URL}/storage/v1/bucket`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        name: bucket,
        public: true,
      }),
    }).catch(() => {}); // Ignorar error si ya existe

    // Subir archivo a Supabase Storage
    const uploadRes = await fetch(
      `${SUPABASE_URL}/storage/v1/object/${bucket}/${filename}`,
      {
        method: "POST",
        headers: {
          apikey: SUPABASE_SERVICE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        },
        body: file,
      }
    );

    if (!uploadRes.ok) {
      const error = await uploadRes.text();
      console.error("Storage upload error:", error);
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: "No se pudo subir la imagen",
        }),
      };
    }

    // Construir URL pública
    const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${filename}`;

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        url: publicUrl,
        filename,
      }),
    };
  } catch (err) {
    console.error("Upload error:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "Error en la carga de archivo",
      }),
    };
  }
};
