import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.2'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const waToken = Deno.env.get('WHATSAPP_TOKEN') || ''
const waPhoneId = Deno.env.get('RITA_PHONE_ID') || Deno.env.get('WHATSAPP_PHONE_ID') || '1260857797114684'
const GRAPH = 'https://graph.facebook.com/v25.0'
const RECOMPENSA_PUNTOS = 50

const sbClient = createClient(supabaseUrl, supabaseServiceKey)

async function sendWAText(to: string, text: string): Promise<{ ok: boolean; error?: string }> {
  if (!waToken || !waPhoneId || !to) return { ok: false, error: 'Faltan credenciales o destinatario' }
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

function phoneSuffix(phone: string): string {
  return (phone || '').replace(/\D/g, '').slice(-10)
}

// Se llama cuando un rider nuevo termina de registrarse (ciudad + moto ya presentes).
Deno.serve(async (req) => {
  try {
    const body = await req.json().catch(() => ({}))
    const riderId = body.rider_id
    if (!riderId) return new Response(JSON.stringify({ ok: false, error: 'Falta rider_id' }), { status: 400 })

    const { data: nuevoRider } = await sbClient.from('riders').select('id, nombre, telefono').eq('id', riderId).maybeSingle()
    if (!nuevoRider) return new Response(JSON.stringify({ ok: false, error: 'Rider no encontrado' }), { status: 404 })

    const suffix = phoneSuffix(nuevoRider.telefono)
    const { data: pendientes } = await sbClient
      .from('referidos')
      .select('id, referidor_id, telefono_invitado')
      .eq('estado', 'pendiente')

    const match = (pendientes || []).find((r) => phoneSuffix(r.telefono_invitado) === suffix)
    if (!match) return new Response(JSON.stringify({ ok: true, matched: false }), { headers: { 'Content-Type': 'application/json' } })

    const { data: referidor } = await sbClient.from('riders').select('id, nombre, telefono').eq('id', match.referidor_id).maybeSingle()

    await sbClient.from('referidos').update({
      estado: 'registrado', referido_id: riderId, premiado_at: new Date().toISOString(),
    }).eq('id', match.id)

    await sbClient.from('puntos_bonus').insert([
      { rider_id: match.referidor_id, motivo: 'referido_registrado', puntos: RECOMPENSA_PUNTOS },
      { rider_id: riderId, motivo: 'bienvenida_referido', puntos: RECOMPENSA_PUNTOS },
    ])

    const results: Record<string, unknown> = {}
    if (referidor?.telefono) {
      results.referidor = await sendWAText(referidor.telefono, `🎉 ¡${nuevoRider.nombre || 'tu amigo'} se registró en Ridera con tu invitación! Ganaste +${RECOMPENSA_PUNTOS} puntos en el ranking. Sigue invitando: gruas.ridera.com.co/leaderboard.html`)
    }
    if (nuevoRider.telefono) {
      results.referido = await sendWAText(nuevoRider.telefono, `🏍️ ¡Bienvenido a Ridera! Como te uniste invitado por ${referidor?.nombre || 'un amigo'}, arrancas con +${RECOMPENSA_PUNTOS} puntos de regalo. Mira el ranking: gruas.ridera.com.co/leaderboard.html`)
    }

    return new Response(JSON.stringify({ ok: true, matched: true, results }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (error) {
    return new Response(JSON.stringify({ ok: false, error: String(error) }), { status: 500 })
  }
})
