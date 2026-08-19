import "jsr:@supabase/functions-js/edge-runtime.d.ts";

Deno.serve(async (req: Request) => {
  try {
    const body = await req.json();
    const record = body.record || body;
    const tabla = body.table || 'registro';

    const tgToken = Deno.env.get('TG_TOKEN');
    const tgChat = Deno.env.get('TG_CHAT_ID');

    if (!tgToken || !tgChat) {
      return new Response('TG_TOKEN o TG_CHAT_ID no configurado', { status: 500 });
    }

    const tablaLabel: Record<string, string> = {
      motos_venta: '\u{1F3CD}️ Moto en venta',
      talleres: '\u{1F527} Taller',
      almacenes: '\u{1F3EA} Almacén',
      gruas: '\u{1F697} Grúa',
    };
    const label = tablaLabel[tabla] || tabla;

    const nombre = record.nombre || record.titulo || record.name || 'Sin nombre';
    const ciudad = record.ciudad || record.location || '';
    const precio = record.precio ? `$${Number(record.precio).toLocaleString('es-CO')}` : '';
    const id = record.id || '';

    let texto = `\u{1F514} *Nuevo registro pendiente*\n`;
    texto += `*Tipo:* ${label}\n`;
    texto += `*Nombre:* ${nombre}\n`;
    if (ciudad) texto += `*Ciudad:* ${ciudad}\n`;
    if (precio) texto += `*Precio:* ${precio}\n`;
    if (id) texto += `*ID:* \`${id}\`\n`;
    texto += `\n_Revisa el panel admin para aprobarlo._`;

    const tgUrl = `https://api.telegram.org/bot${tgToken}/sendMessage`;
    const tgRes = await fetch(tgUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: tgChat,
        text: texto,
        parse_mode: 'Markdown',
      }),
    });

    const tgData = await tgRes.json();
    if (!tgData.ok) {
      return new Response(JSON.stringify(tgData), { status: 400 });
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(String(e), { status: 500 });
  }
});
