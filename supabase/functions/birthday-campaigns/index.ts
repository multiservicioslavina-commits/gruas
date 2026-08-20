import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.2'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const waToken = Deno.env.get('WHATSAPP_TOKEN') || ''
const waPhoneId = Deno.env.get('RITA_PHONE_ID') || Deno.env.get('WHATSAPP_PHONE_ID') || '1238785075974458'
const GRAPH = 'https://graph.facebook.com/v25.0'
const TEMPLATE_NAME = Deno.env.get('BIRTHDAY_TEMPLATE_NAME') || 'feliz_cumpleanos_rita'

const sbClient = createClient(supabaseUrl, supabaseServiceKey)

async function sendBirthdayTemplate(to: string, name: string): Promise<{ ok: boolean; error?: string }> {
  if (!waToken || !waPhoneId) return { ok: false, error: 'Faltan credenciales WhatsApp' }
  try {
    const res = await fetch(`${GRAPH}/${waPhoneId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${waToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'template',
        template: {
          name: TEMPLATE_NAME,
          language: { code: 'es_CO' },
          components: [{ type: 'body', parameters: [{ type: 'text', text: name || 'motero' }] }],
        },
      }),
    })
    if (res.ok) return { ok: true }
    const d = await res.json().catch(() => ({}))
    return { ok: false, error: d?.error?.message || `HTTP ${res.status}` }
  } catch (error) {
    return { ok: false, error: error.message }
  }
}

Deno.serve(async (req) => {
  const today = new Date()
  const month = today.getMonth() + 1
  const day = today.getDate()
  const todayStr = today.toISOString().slice(0, 10)

  const { data: riders } = await sbClient
    .from('riders')
    .select('id, nombre, telefono, fecha_nacimiento, ultima_notif_cumple')
    .not('fecha_nacimiento', 'is', null)

  const cumpleaneros = (riders || []).filter((r) => {
    if (r.ultima_notif_cumple === todayStr) return false
    const d = new Date(r.fecha_nacimiento)
    return d.getUTCMonth() + 1 === month && d.getUTCDate() === day
  })

  const { data: contacts } = await sbClient.from('rita_contacts').select('phone_number, preferred_name').eq('opted_in', true)
  const contactByPhoneSuffix = new Map<string, string>()
  for (const c of contacts || []) {
    const suffix = (c.phone_number || '').replace(/\D/g, '').slice(-10)
    if (suffix) contactByPhoneSuffix.set(suffix, c.phone_number)
  }

  let sent = 0, errors = 0
  for (const r of cumpleaneros) {
    const suffix = (r.telefono || '').replace(/\D/g, '').slice(-10)
    const phone = contactByPhoneSuffix.get(suffix)
    if (!phone) continue

    const result = await sendBirthdayTemplate(phone, r.nombre || '')
    if (result.ok) sent++
    else errors++

    await sbClient.from('riders').update({ ultima_notif_cumple: todayStr }).eq('id', r.id)
    await new Promise((res) => setTimeout(res, 200))
  }

  return new Response(JSON.stringify({ ok: true, candidates: cumpleaneros.length, sent, errors }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
