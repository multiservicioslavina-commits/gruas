import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const sbClient = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

const ENTIDADES_VALIDAS = new Set(['talleres', 'almacenes', 'hoteles', 'restaurantes'])

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: corsHeaders })

  try {
    const body = await req.json()
    const { entidad_tipo, entidad_id, entidad_nombre, nombre_contacto, telefono_contacto, fecha_solicitada, hora_solicitada, nota } = body

    if (!ENTIDADES_VALIDAS.has(entidad_tipo)) {
      return new Response(JSON.stringify({ ok: false, error: 'Tipo de negocio no válido' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    if (!entidad_id || !nombre_contacto || !telefono_contacto) {
      return new Response(JSON.stringify({ ok: false, error: 'Faltan datos obligatorios' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data, error } = await sbClient.from('reservas').insert({
      entidad_tipo, entidad_id, entidad_nombre: entidad_nombre || null,
      nombre_contacto: String(nombre_contacto).slice(0, 120),
      telefono_contacto: String(telefono_contacto).slice(0, 30),
      fecha_solicitada: fecha_solicitada || null,
      hora_solicitada: hora_solicitada ? String(hora_solicitada).slice(0, 20) : null,
      nota: nota ? String(nota).slice(0, 500) : null,
      estado: 'pendiente',
    }).select('id').maybeSingle()

    if (error) {
      return new Response(JSON.stringify({ ok: false, error: error.message }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ ok: true, reserva_id: data?.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    return new Response(JSON.stringify({ ok: false, error: String(error) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
