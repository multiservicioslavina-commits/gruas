import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.2'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const waToken = Deno.env.get('WHATSAPP_TOKEN') || ''
const waPhoneId = Deno.env.get('RITA_PHONE_ID') || Deno.env.get('WHATSAPP_PHONE_ID') || '1238785075974458'
const GRAPH = 'https://graph.facebook.com/v25.0'

const sbClient = createClient(supabaseUrl, supabaseServiceKey)

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

async function sendWAText(to: string, text: string): Promise<{ ok: boolean; error?: string }> {
  if (!waToken || !waPhoneId) return { ok: false, error: 'Faltan credenciales WhatsApp' }
  try {
    const res = await fetch(`${GRAPH}/${waPhoneId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${waToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body: text } }),
    })
    if (res.ok) return { ok: true }
    const d = await res.json().catch(() => ({}))
    return { ok: false, error: d?.error?.message || `HTTP ${res.status}` }
  } catch (error) {
    return { ok: false, error: String(error) }
  }
}

Deno.serve(async (req) => {
  try {
    const body = await req.json().catch(() => ({}))
    const riderId = body.rider_id
    const municipioNuevo = body.municipio_id
    if (!riderId) return new Response(JSON.stringify({ ok: false, error: 'Falta rider_id' }), { status: 400 })

    const { data: rider } = await sbClient.from('riders').select('id, nombre, telefono').eq('id', riderId).maybeSingle()
    if (!rider?.telefono) return new Response(JSON.stringify({ ok: false, error: 'Rider sin teléfono' }), { status: 404 })

    const { data: sellos } = await sbClient.from('sellos').select('municipio_id').eq('rider_id', riderId).eq('estado', 'aprobado')
    const { data: municipios } = await sbClient.from('municipios').select('id, nombre, puntos_sello')
    const puntosByMuni = new Map((municipios || []).map((m) => [m.id, m.puntos_sello || 10]))
    const nombreByMuni = new Map((municipios || []).map((m) => [m.id, m.nombre]))

    const totalMunicipios = new Set((sellos || []).map((s) => s.municipio_id)).size
    const puntos = (sellos || []).reduce((acc, s) => acc + (puntosByMuni.get(s.municipio_id) || 10), 0)
    const puntosNuevoSello = municipioNuevo ? (puntosByMuni.get(municipioNuevo) || 10) : 0
    const nivelActual = nivelFor(puntos)
    const nivelAnterior = nivelFor(puntos - puntosNuevoSello)
    const subioDeNivel = nivelActual.nombre !== nivelAnterior.nombre

    // Posición en el ranking
    const { data: allSellos } = await sbClient.from('sellos').select('rider_id, municipio_id').eq('estado', 'aprobado')
    const puntosPorRider = new Map<string, number>()
    for (const s of allSellos || []) {
      puntosPorRider.set(s.rider_id, (puntosPorRider.get(s.rider_id) || 0) + (puntosByMuni.get(s.municipio_id) || 10))
    }
    const ranking = [...puntosPorRider.entries()].sort((a, b) => b[1] - a[1])
    const posicion = ranking.findIndex(([id]) => id === riderId) + 1

    const nombreMuni = municipioNuevo ? nombreByMuni.get(municipioNuevo) || 'un nuevo municipio' : 'un municipio'
    let text = `🏍️ ¡Sello aprobado! Sumaste ${nombreMuni} a tu pasaporte.\n\n📍 ${totalMunicipios} municipios recorridos\n⭐ ${puntos} puntos\n🏅 Posición #${posicion} en el ranking Ridera`

    if (subioDeNivel) {
      text += `\n\n🎉 ¡Subiste de nivel! Ahora eres ${nivelActual.icono} *${nivelActual.nombre}*`
    }
    text += `\n\nMira el ranking completo: gruas.ridera.com.co/leaderboard.html`

    const result = await sendWAText(rider.telefono, text)
    return new Response(JSON.stringify({ ok: true, sent: result.ok, error: result.error, puntos, posicion, nivel: nivelActual.nombre, subioDeNivel }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (error) {
    return new Response(JSON.stringify({ ok: false, error: String(error) }), { status: 500 })
  }
})
