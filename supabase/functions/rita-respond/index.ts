import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.2'

const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders })
  }

  try {
    const payload = await req.json()
    const { record } = payload
    const question = record.content

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
        messages: [{ role: 'user', content: question }],
      }),
    })

    const data = await response.json()
    let answer = 'No pude generar una respuesta'

    if (data.content && data.content[0]) {
      answer = data.content[0].text
    }

    return new Response(JSON.stringify({ ok: true, answer }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('Error:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
