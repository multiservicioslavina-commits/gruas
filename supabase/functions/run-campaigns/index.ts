import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const waToken = Deno.env.get('WHATSAPP_TOKEN') || ''
const waPhoneId = Deno.env.get('RITA_PHONE_ID') || Deno.env.get('WHATSAPP_PHONE_ID') || '1260857797114684'
const GRAPH = 'https://graph.facebook.com/v25.0'

const sbClient = createClient(supabaseUrl, supabaseServiceKey)

async function sendWATemplate(to: string, name: string, language: string, bodyParams: string[], media?: { type: 'image' | 'video' | 'document'; url: string }): Promise<{ ok: boolean; error?: string }> {
  if (!waToken || !waPhoneId) return { ok: false, error: 'Faltan credenciales WhatsApp' }
  try {
    const components: Record<string, unknown>[] = bodyParams.length
      ? [{ type: 'body', parameters: bodyParams.map((t) => ({ type: 'text', text: t })) }]
      : []
    if (media?.url) {
      components.unshift({ type: 'header', parameters: [{ type: media.type, [media.type]: { link: media.url } }] })
    }
    const res = await fetch(`${GRAPH}/${waPhoneId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${waToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'template',
        template: { name, language: { code: language }, ...(components.length ? { components } : {}) },
      }),
    })
    if (res.ok) return { ok: true }
    let msg = `HTTP ${res.status}`
    try {
      const d = await res.json()
      msg = d?.error?.message || msg
    } catch { /* ignore */ }
    return { ok: false, error: msg }
  } catch (error) {
    return { ok: false, error: error.message }
  }
}

async function runCampaign(campaign: Record<string, any>) {
  const media = campaign.media_url && ['image', 'video', 'document'].includes(campaign.media_type)
    ? { type: campaign.media_type, url: campaign.media_url }
    : undefined

  let { data: contacts } = await sbClient.from('rita_contacts').select('phone_number, preferred_name').eq('opted_in', true)
  contacts = contacts || []

  if (campaign.ciudad) {
    const { data: riders } = await sbClient.from('riders').select('telefono, ciudad').not('ciudad', 'is', null)
    const ciudadByPhoneSuffix = new Map<string, string>()
    for (const r of riders || []) {
      const suffix = (r.telefono || '').replace(/\D/g, '').slice(-10)
      if (suffix) ciudadByPhoneSuffix.set(suffix, r.ciudad)
    }
    contacts = contacts.filter((c: Record<string, any>) => {
      const suffix = (c.phone_number || '').replace(/\D/g, '').slice(-10)
      return ciudadByPhoneSuffix.get(suffix) === campaign.ciudad
    })
  }

  let sent = 0, errors = 0
  for (const c of contacts) {
    const bodyParams = (Array.isArray(campaign.params) ? campaign.params : []).map((p: string) => (p === '{{nombre}}' ? (c.preferred_name || '') : p))
    const result = await sendWATemplate(c.phone_number, campaign.template, campaign.language || 'es_CO', bodyParams, media)
    if (result.ok) sent++
    else errors++
  }

  await sbClient.from('broadcast_campaigns').update({
    status: 'sent',
    sent_count: sent,
    error_count: errors,
    processed_at: new Date().toISOString(),
  }).eq('id', campaign.id)

  await sbClient.from('admin_audit_log').insert({
    username: campaign.created_by,
    action: 'scheduled_broadcast',
    detail: { campaign_id: campaign.id, template: campaign.template, sent, errors },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const { data: due } = await sbClient
    .from('broadcast_campaigns')
    .select('*')
    .eq('status', 'pending')
    .lte('scheduled_at', new Date().toISOString())

  const campaigns = due || []
  for (const campaign of campaigns) {
    try {
      await runCampaign(campaign)
    } catch (error) {
      await sbClient.from('broadcast_campaigns').update({
        status: 'error',
        error_message: error.message,
        processed_at: new Date().toISOString(),
      }).eq('id', campaign.id)
    }
  }

  return new Response(JSON.stringify({ ok: true, processed: campaigns.length }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
