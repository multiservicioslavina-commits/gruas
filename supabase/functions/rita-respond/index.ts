import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.2'

const supabaseUrl = Deno.env.get('SUPABASE_URL')
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')

const client = createClient(supabaseUrl!, supabaseKey!)

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  try {
    const payload = await req.json()
    const { record } = payload

    // Solo responder a preguntas de usuarios
    if (record.sender !== 'user') {
      return new Response(JSON.stringify({ ok: true }), { status: 200 })
    }

    const question = record.content
    const memberId = record.member_id
    const clubId = record.club_id

    // Llamar Claude API para generar respuesta sobre motos
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': anthropicKey!,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 1024,
        system: `Eres Rita, un asistente experto en motos y motociclismo para el club Ridera.
Responde en español, de manera amigable y concisa (máximo 2-3 párrafos).
Solo responde sobre temas relacionados con motos: mecánica, mantenimiento, seguridad, rutas, marcas, etc.
Si la pregunta no es sobre motos, responde: "Eso no tiene que ver con motos, pero puedo ayudarte con cualquier duda de motociclismo 🏍️"`,
        messages: [
          {
            role: 'user',
            content: question,
          },
        ],
      }),
    })

    const data = await response.json()
    let answer = 'No pude generar una respuesta'

    if (data.content && data.content[0]) {
      answer = data.content[0].text
    }

    // Guardar respuesta en BD
    const { error } = await client.from('connect_rita_dms').insert({
      member_id: memberId,
      club_id: clubId,
      sender: 'rita',
      content: answer,
    })

    if (error) {
      console.error('Error saving response:', error)
      return new Response(JSON.stringify({ error: error.message }), { status: 500 })
    }

    return new Response(JSON.stringify({ ok: true, answer }), { status: 200 })
  } catch (error) {
    console.error('Error:', error)
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }
})
