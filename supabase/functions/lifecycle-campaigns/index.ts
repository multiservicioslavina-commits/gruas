import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.2'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const waToken = Deno.env.get('WHATSAPP_TOKEN') || ''
const waPhoneId = Deno.env.get('RITA_PHONE_ID') || Deno.env.get('WHATSAPP_PHONE_ID') || '3234846550'
const GRAPH = 'https://graph.facebook.com/v25.0'
const REACTIVATION_TEMPLATE = Deno.env.get('REACTIVATION_TEMPLATE_NAME') || ''

const sbClient = createClient(supabaseUrl, supabaseServiceKey)

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
    return { ok: false, error: error.message }
  }
}

async function sendWATemplate(to: string, name: string, params: string[]): Promise<{ ok: boolean; error?: string }> {
  if (!waToken || !waPhoneId || !name) return { ok: false, error: 'Sin plantilla configurada' }
  try {
    const components = params.length ? [{ type: 'body', parameters: params.map((t) => ({ type: 'text', text: t })) }] : []
    const res = await fetch(`${GRAPH}/${waPhoneId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${waToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp', to, type: 'template',
        template: { name, language: { code: 'es_CO' }, ...(components.length ? { components } : {}) },
      }),
    })
    if (res.ok) return { ok: true }
    const d = await res.json().catch(() => ({}))
    return { ok: false, error: d?.error?.message || `HTTP ${res.status}` }
  } catch (error) {
    return { ok: false, error: error.message }
  }
}

function phoneSuffix(phone: string): string {
  return (phone || '').replace(/\D/g, '').slice(-10)
}

async function runWelcome() {
  const { data: contacts } = await sbClient
    .from('rita_contacts')
    .select('id, phone_number, preferred_name, created_at')
    .eq('opted_in', true)
    .eq('bienvenida_enviada', false)
    .lte('created_at', new Date(Date.now() - 5 * 60 * 1000).toISOString())

  let sent = 0
  for (const c of contacts || []) {
    const nombre = c.preferred_name ? `, ${c.preferred_name}` : ''
    const text = `¡Hola${nombre}! 🏍️ Soy Rita, tu asistente de Ridera. Estoy aquí para ayudarte con auxilio en carretera, rutas, mantenimiento de tu moto y más. Cuéntame en qué te puedo ayudar, o escribe "ayuda" para ver todo lo que puedo hacer.`
    const result = await sendWAText(c.phone_number, text)
    await sbClient.from('rita_contacts').update({ bienvenida_enviada: true }).eq('id', c.id)
    if (result.ok) sent++
    await new Promise((r) => setTimeout(r, 150))
  }
  return { candidates: (contacts || []).length, sent }
}

async function runPerfilIncompleto() {
  const desde = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000)
  const hasta = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)
  const { data: riders } = await sbClient
    .from('riders')
    .select('id, nombre, telefono, ciudad, moto_marca')
    .eq('perfil_recordatorio_enviado', false)
    .gte('created_at', desde.toISOString())
    .lte('created_at', hasta.toISOString())

  const incompletos = (riders || []).filter((r) => !r.ciudad || !r.moto_marca)
  if (!incompletos.length) return { candidates: 0, sent: 0 }

  const { data: contacts } = await sbClient.from('rita_contacts').select('phone_number').eq('opted_in', true)
  const contactSet = new Set((contacts || []).map((c) => phoneSuffix(c.phone_number)))

  let sent = 0
  for (const r of incompletos) {
    const suffix = phoneSuffix(r.telefono)
    if (contactSet.has(suffix)) {
      const text = `¡Hola${r.nombre ? ' ' + r.nombre : ''}! 🏍️ Vi que aún no completaste tu perfil en Ridera (ciudad y moto). Completarlo toma 1 minuto y me ayuda a darte mejores recomendaciones y auxilio más rápido. ¿Me cuentas tu ciudad y qué moto tienes?`
      const result = await sendWAText(r.telefono, text)
      if (result.ok) sent++
    }
    await sbClient.from('riders').update({ perfil_recordatorio_enviado: true }).eq('id', r.id)
  }
  return { candidates: incompletos.length, sent }
}

async function runReactivacion() {
  const umbral = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const { data: contacts } = await sbClient
    .from('rita_contacts')
    .select('id, phone_number, preferred_name, last_seen_at, reactivacion_enviada_at')
    .eq('opted_in', true)
    .lte('last_seen_at', umbral)

  const candidatos = (contacts || []).filter((c) => {
    if (!c.reactivacion_enviada_at) return true
    return new Date(c.reactivacion_enviada_at).getTime() <= Date.now() - 30 * 24 * 60 * 60 * 1000
  })

  let sent = 0, errors = 0
  const hoy = new Date().toISOString().slice(0, 10)
  for (const c of candidatos) {
    const nombre = c.preferred_name || 'motero'
    const result = REACTIVATION_TEMPLATE
      ? await sendWATemplate(c.phone_number, REACTIVATION_TEMPLATE, [nombre])
      : await sendWAText(c.phone_number, `¡Hola ${nombre}! 🏍️ Soy Rita de Ridera, hace rato no hablamos. ¿Todo bien con tu moto? Si necesitas auxilio, rutas o cualquier cosa, aquí estoy.`)
    if (result.ok) sent++
    else errors++
    await sbClient.from('rita_contacts').update({ reactivacion_enviada_at: hoy }).eq('id', c.id)
    await new Promise((r) => setTimeout(r, 150))
  }
  return { candidates: candidatos.length, sent, errors }
}

async function runSeguimientoServicio() {
  const desde = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { data: solicitudes } = await sbClient
    .from('solicitudes')
    .select('id, cliente_nombre, cliente_telefono, estado, finalizada_at, msg_followup_sent')
    .eq('estado', 'finalizada')
    .eq('msg_followup_sent', false)
    .gte('finalizada_at', desde)

  let sent = 0
  for (const s of solicitudes || []) {
    const nombre = s.cliente_nombre ? s.cliente_nombre.split(' ')[0] : ''
    const text = `¡Hola${nombre ? ' ' + nombre : ''}! 🏍️ Gracias por confiar en Ridera Grúas. ¿Cómo te fue con el servicio de auxilio? Cuéntanos si todo salió bien o si algo se puede mejorar, tu opinión nos ayuda mucho.`
    const result = await sendWAText(s.cliente_telefono, text)
    await sbClient.from('solicitudes').update({ msg_followup_sent: true }).eq('id', s.id)
    if (result.ok) sent++
    await new Promise((r) => setTimeout(r, 150))
  }
  return { candidates: (solicitudes || []).length, sent }
}

Deno.serve(async (_req) => {
  const results = {
    bienvenida: await runWelcome(),
    perfil_incompleto: await runPerfilIncompleto(),
    reactivacion: await runReactivacion(),
    seguimiento_servicio: await runSeguimientoServicio(),
  }
  return new Response(JSON.stringify({ ok: true, results }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
