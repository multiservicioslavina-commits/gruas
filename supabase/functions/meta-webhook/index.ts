import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.2'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const verifyToken = Deno.env.get('META_WEBHOOK_VERIFY_TOKEN') || ''
const pageToken = Deno.env.get('META_PAGE_ACCESS_TOKEN') || ''
const GRAPH = 'https://graph.facebook.com/v21.0'

const sbClient = createClient(supabaseUrl, supabaseServiceKey)

async function sendReply(psid: string, text: string) {
  if (!pageToken) return
  await fetch(`${GRAPH}/me/messages?access_token=${pageToken}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ recipient: { id: psid }, message: { text } }),
  }).catch(() => {})
}

Deno.serve(async (req) => {
  const url = new URL(req.url)

  // Meta webhook verification handshake (GET)
  if (req.method === 'GET') {
    const mode = url.searchParams.get('hub.mode')
    const token = url.searchParams.get('hub.verify_token')
    const challenge = url.searchParams.get('hub.challenge')
    if (mode === 'subscribe' && token === verifyToken && challenge) {
      return new Response(challenge, { status: 200 })
    }
    return new Response('Forbidden', { status: 403 })
  }

  if (req.method !== 'POST') return new Response('ok')

  try {
    const body = await req.json()
    const channel = body.object === 'instagram' ? 'instagram' : 'messenger'

    for (const entry of body.entry || []) {
      for (const event of entry.messaging || []) {
        const psid = event.sender?.id
        if (!psid) continue

        const text = String(event.message?.text || '').trim().toUpperCase()
        if (text === 'BAJA' || text === 'STOP') {
          await sbClient.from('meta_contacts').upsert({
            channel, psid, opted_in: false, last_seen_at: new Date().toISOString(),
          }, { onConflict: 'channel,psid' })
          await sendReply(psid, 'Listo, no recibirás más mensajes de Ridera por aquí.')
          continue
        }

        await sbClient.from('meta_contacts').upsert({
          channel, psid, opted_in: true, last_seen_at: new Date().toISOString(),
        }, { onConflict: 'channel,psid' })
      }
    }

    return new Response('ok')
  } catch {
    return new Response('ok')
  }
})
