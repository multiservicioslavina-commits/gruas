import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const sbClient = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

const NIVELES = [
  { min: 0, nombre: 'Novato', icono: '🔰' },
  { min: 50, nombre: 'Explorador', icono: '🧭' },
  { min: 150, nombre: 'Trotamundos', icono: '🗺️' },
  { min: 350, nombre: 'Leyenda Motera', icono: '🏆' },
  { min: 700, nombre: 'Maestro de las Rutas', icono: '👑' },
]

function nivelFor(puntos: number) {
  let nivel = NIVELES[0]
  for (const n of NIVELES) if (puntos >= n.min) nivel = n
  return nivel
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const url = new URL(req.url)
    const rider = url.searchParams.get('rider')

    const { data: sellos, error } = await sbClient
      .from('sellos')
      .select('rider_id, municipio_id, fecha, estado')
      .eq('estado', 'aprobado')
    if (error) throw error

    const { data: municipios } = await sbClient.from('municipios').select('id, nombre, puntos_sello')
    const puntosByMuni = new Map((municipios || []).map((m) => [m.id, m.puntos_sello || 10]))
    const nombreByMuni = new Map((municipios || []).map((m) => [m.id, m.nombre]))

    const { data: riders } = await sbClient.from('riders').select('id, nombre, apellido, ciudad, foto_url, slug')
    const riderById = new Map((riders || []).map((r) => [r.id, r]))

    const { data: bonus } = await sbClient.from('puntos_bonus').select('rider_id, puntos')

    const porRider = new Map<string, { puntos: number; municipios: Set<string>; ultima: string }>()
    for (const s of sellos || []) {
      if (!s.rider_id) continue
      const entry = porRider.get(s.rider_id) || { puntos: 0, municipios: new Set<string>(), ultima: s.fecha }
      entry.puntos += puntosByMuni.get(s.municipio_id) || 10
      entry.municipios.add(s.municipio_id)
      if (s.fecha > entry.ultima) entry.ultima = s.fecha
      porRider.set(s.rider_id, entry)
    }
    for (const b of bonus || []) {
      if (!b.rider_id) continue
      const entry = porRider.get(b.rider_id) || { puntos: 0, municipios: new Set<string>(), ultima: '' }
      entry.puntos += b.puntos || 0
      porRider.set(b.rider_id, entry)
    }

    const ranking = [...porRider.entries()]
      .map(([riderId, e]) => {
        const r = riderById.get(riderId)
        const nivel = nivelFor(e.puntos)
        return {
          rider_id: riderId,
          nombre: r ? `${r.nombre || ''} ${r.apellido || ''}`.trim() : 'Motero',
          ciudad: r?.ciudad || null,
          foto_url: r?.foto_url || null,
          slug: r?.slug || null,
          puntos: e.puntos,
          municipios_visitados: e.municipios.size,
          nivel: nivel.nombre,
          nivel_icono: nivel.icono,
          ultima_actividad: e.ultima,
        }
      })
      .sort((a, b) => b.puntos - a.puntos)
      .map((r, i) => ({ ...r, posicion: i + 1 }))

    if (rider) {
      const mine = ranking.find((r) => r.rider_id === rider)
      return new Response(JSON.stringify({ ok: true, rider: mine || null, top: ranking.slice(0, 10) }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ ok: true, ranking: ranking.slice(0, 50), total_riders: ranking.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    return new Response(JSON.stringify({ ok: false, error: String(error) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
