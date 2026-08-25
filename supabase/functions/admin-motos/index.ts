import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
};

const NO_APROBADO = new Set(['riders', 'sellos']);

const TABLAS: Record<string, string> = {
  motos: 'motos_venta',
  talleres: 'talleres',
  almacenes: 'almacenes',
  hoteles: 'hoteles',
  restaurantes: 'restaurantes',
  riders: 'riders',
  sellos: 'sellos',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const SB_URL = Deno.env.get('SUPABASE_URL')!;
  const SB_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const sb = createClient(SB_URL, SB_KEY);

  const { data: cfgData } = await sb.from('admin_config').select('password').eq('id', 1).single();
  const adminKey = cfgData?.password ?? 'ridera-admin-2026';

  const url = new URL(req.url);
  const key = url.searchParams.get('key') || '';
  if (key !== adminKey) {
    return new Response(JSON.stringify({ error: 'No autorizado' }), {
      status: 401, headers: { ...cors, 'Content-Type': 'application/json' }
    });
  }

  const seccion = url.searchParams.get('seccion') || 'motos';
  const tabla = TABLAS[seccion];
  if (!tabla) {
    return new Response(JSON.stringify({ error: 'Seccion no valida' }), {
      status: 400, headers: { ...cors, 'Content-Type': 'application/json' }
    });
  }

  const sinAprobado = NO_APROBADO.has(seccion);

  if (req.method === 'GET') {
    let query = sb.from(tabla).select('*').order('created_at', { ascending: false });
    if (!sinAprobado) {
      const estado = url.searchParams.get('estado') || 'pendiente';
      query = query.eq('aprobado', estado === 'aprobado');
    }
    const { data, error } = await query;
    if (error) return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...cors, 'Content-Type': 'application/json' }
    });
    return new Response(JSON.stringify(data), {
      headers: { ...cors, 'Content-Type': 'application/json' }
    });
  }

  if (req.method === 'PATCH') {
    const body = await req.json();
    const { id, ...fields } = body;
    if (!id) return new Response(JSON.stringify({ error: 'ID requerido' }), {
      status: 400, headers: { ...cors, 'Content-Type': 'application/json' }
    });
    const { error } = await sb.from(tabla).update(fields).eq('id', id);
    if (error) return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...cors, 'Content-Type': 'application/json' }
    });
    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...cors, 'Content-Type': 'application/json' }
    });
  }

  if (req.method === 'DELETE') {
    const id = url.searchParams.get('id');
    if (!id) return new Response(JSON.stringify({ error: 'ID requerido' }), {
      status: 400, headers: { ...cors, 'Content-Type': 'application/json' }
    });
    const { error } = await sb.from(tabla).delete().eq('id', id);
    if (error) return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...cors, 'Content-Type': 'application/json' }
    });
    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...cors, 'Content-Type': 'application/json' }
    });
  }

  return new Response(JSON.stringify({ error: 'Metodo no soportado' }), {
    status: 405, headers: { ...cors, 'Content-Type': 'application/json' }
  });
});
