import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.2'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN') || ''
const API = `https://api.telegram.org/bot${botToken}`

const sbClient = createClient(supabaseUrl, supabaseServiceKey)

async function sendMessage(chatId: number, text: string) {
  if (!botToken) return
  await fetch(`${API}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
  }).catch(() => {})
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('ok')

  try {
    const update = await req.json()
    const msg = update.message
    if (!msg) return new Response('ok')

    const chatId = msg.chat.id
    const text = String(msg.text || '').trim()
    const username = msg.from?.username || null
    const firstName = msg.from?.first_name || null

    const upper = text.toUpperCase()
    if (upper === 'BAJA' || upper === 'STOP' || upper === '/STOP') {
      await sbClient.from('telegram_contacts').upsert({
        chat_id: chatId, username, first_name: firstName, opted_in: false, last_seen_at: new Date().toISOString(),
      }, { onConflict: 'chat_id' })
      await sendMessage(chatId, 'Listo, no recibirás más mensajes de Ridera. Escribe /start cuando quieras volver a suscribirte.')
      return new Response('ok')
    }

    await sbClient.from('telegram_contacts').upsert({
      chat_id: chatId, username, first_name: firstName, opted_in: true, last_seen_at: new Date().toISOString(),
    }, { onConflict: 'chat_id' })

    if (text === '/start') {
      await sendMessage(chatId, `¡Hola${firstName ? ' ' + firstName : ''}! 🏍️ Te suscribiste a las novedades de Ridera por Telegram. Escribe BAJA en cualquier momento para dejar de recibir mensajes.`)
    }

    return new Response('ok')
  } catch {
    return new Response('ok')
  }
})
