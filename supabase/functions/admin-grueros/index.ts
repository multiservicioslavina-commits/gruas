import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const resendApiKey = Deno.env.get('RESEND_API_KEY')
const waToken = Deno.env.get('WHATSAPP_TOKEN') || ''
const waPhoneId = Deno.env.get('RITA_PHONE_ID') || Deno.env.get('WHATSAPP_PHONE_ID') || '1238785075974458'
const GRAPH = 'https://graph.facebook.com/v25.0'

const sbClient = createClient(supabaseUrl, supabaseServiceKey)

async function sendWATemplate(to: string, name: string, language: string, bodyParams: string[]): Promise<{ ok: boolean; error?: string }> {
  if (!waToken || !waPhoneId) return { ok: false, error: 'Faltan credenciales WhatsApp' }
  try {
    const components = bodyParams.length
      ? [{ type: 'body', parameters: bodyParams.map((t) => ({ type: 'text', text: t })) }]
      : []
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

function mdToHtml(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" style="color: #E85D20; text-decoration: none;">$1</a>')
    .replace(/\{\{nombre\}\}/g, '<span style="font-weight: 600;">{{nombre}}</span>')
    .replace(/\n/g, '<br />')
}

function html_email_template(body: string, preheader: string = ''): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 0; padding: 0; background: #f9f9f9; }
    .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
    .header { background: #E85D20; color: white; padding: 2rem 1.5rem; text-align: center; }
    .header h1 { margin: 0; font-size: 1.5rem; font-weight: 700; }
    .content { padding: 2rem 1.5rem; color: #333; line-height: 1.6; }
    .footer { background: #f5f5f5; padding: 1rem 1.5rem; text-align: center; font-size: 0.875rem; color: #666; border-top: 1px solid #eee; }
    a { color: #E85D20; text-decoration: none; }
    a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🏍️ Ridera</h1>
    </div>
    <div class="content">
      ${body}
    </div>
    <div class="footer">
      <p>© 2026 Ridera. Todos los derechos reservados.</p>
      <p>Puedes desuscribirse escribiendo BAJA en WhatsApp.</p>
    </div>
  </div>
</body>
</html>`
}

async function validateKey(key: string): Promise<boolean> {
  // Accept the admin key
  return key === 'mipadre2816'
}

async function sendEmailViaResend(to: string, subject: string, html: string, from_name: string = 'Ridera'): Promise<{ ok: boolean; error?: string }> {
  if (!resendApiKey) return { ok: false, error: 'RESEND_API_KEY not configured' }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `${from_name} <noticias@ridera.com.co>`,
        to,
        subject,
        html,
      }),
    })

    const data = await res.json()
    if (!res.ok) return { ok: false, error: data.message || 'Failed to send email' }
    return { ok: true }
  } catch (error) {
    return { ok: false, error: error.message }
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders })
  }

  try {
    const body = await req.json()
    const { key, action } = body

    if (!key) {
      return new Response(JSON.stringify({ ok: false, error: 'Key required' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const isValid = await validateKey(key)
    console.log('validateKey result:', { key: key.substring(0, 10) + '...', isValid })

    if (!isValid) {
      return new Response(JSON.stringify({ ok: false, error: 'Invalid key' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // LIST ACTION - for login validation
    if (action === 'list') {
      const { data: grueros } = await sbClient.from('grueros').select('*')
      return new Response(JSON.stringify({ ok: true, grueros: grueros || [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // LIST RIDERS
    if (action === 'list_riders') {
      const { data: riders, error } = await sbClient.from('riders').select('*').order('created_at', { ascending: false })
      if (error) {
        return new Response(JSON.stringify({ ok: false, error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      return new Response(JSON.stringify({ ok: true, riders: riders || [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // LIST CLUBS
    if (action === 'list_clubs') {
      const { data: clubs, error } = await sbClient.from('clubs').select('*').order('nombre', { ascending: true })
      if (error) {
        return new Response(JSON.stringify({ ok: false, error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      return new Response(JSON.stringify({ ok: true, clubs: clubs || [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // LIST MOTOS
    if (action === 'list_motos') {
      const { data: motos, error } = await sbClient.from('motos_venta').select('*').order('created_at', { ascending: false })
      if (error) {
        return new Response(JSON.stringify({ ok: false, error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      return new Response(JSON.stringify({ ok: true, motos: motos || [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // LIST TALLERES
    if (action === 'list_talleres') {
      const { data: talleres, error } = await sbClient.from('talleres').select('*').order('nombre', { ascending: true })
      if (error) {
        return new Response(JSON.stringify({ ok: false, error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      return new Response(JSON.stringify({ ok: true, talleres: talleres || [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // LIST ALMACENES
    if (action === 'list_almacenes') {
      const { data: almacenes, error } = await sbClient.from('almacenes').select('*').order('nombre', { ascending: true })
      if (error) {
        return new Response(JSON.stringify({ ok: false, error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      return new Response(JSON.stringify({ ok: true, almacenes: almacenes || [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // TOGGLE APPROVAL (talleres, almacenes, clubs, motos_venta)
    if (action === 'toggle_approval') {
      const { table, id, aprobado } = body
      const allowedTables = ['talleres', 'almacenes', 'clubs', 'motos_venta']
      if (!allowedTables.includes(table)) {
        return new Response(JSON.stringify({ ok: false, error: 'Tabla no permitida' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      const { error } = await sbClient.from(table).update({ aprobado }).eq('id', id)
      if (error) {
        return new Response(JSON.stringify({ ok: false, error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // REJECT RECORD (talleres, almacenes, clubs, motos_venta) - deletes the submission
    if (action === 'reject_record') {
      const { table, id } = body
      const allowedTables = ['talleres', 'almacenes', 'clubs', 'motos_venta']
      if (!allowedTables.includes(table)) {
        return new Response(JSON.stringify({ ok: false, error: 'Tabla no permitida' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      const { error } = await sbClient.from(table).delete().eq('id', id)
      if (error) {
        return new Response(JSON.stringify({ ok: false, error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // UPDATE RECORD (talleres, almacenes, clubs, motos_venta) - edit allowed fields
    if (action === 'update_record') {
      const { table, id, fields } = body
      const editableFields: Record<string, string[]> = {
        clubs: ['nombre', 'ciudad', 'codigo'],
        talleres: ['nombre', 'ciudad', 'telefono', 'email', 'instagram', 'direccion', 'barrio'],
        almacenes: ['nombre', 'ciudad', 'telefono', 'email', 'direccion', 'barrio', 'categorias'],
        motos_venta: ['titulo', 'precio', 'ciudad', 'barrio', 'telefono', 'email', 'marca', 'modelo', 'anio', 'kilometraje', 'cilindraje', 'color', 'descripcion'],
      }
      const allowed = editableFields[table]
      if (!allowed) {
        return new Response(JSON.stringify({ ok: false, error: 'Tabla no permitida' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      const update: Record<string, unknown> = {}
      for (const key of allowed) {
        if (fields && Object.prototype.hasOwnProperty.call(fields, key)) update[key] = fields[key]
      }
      if (Object.keys(update).length === 0) {
        return new Response(JSON.stringify({ ok: false, error: 'Sin campos para actualizar' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      const { error } = await sbClient.from(table).update(update).eq('id', id)
      if (error) {
        return new Response(JSON.stringify({ ok: false, error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // TEST ACTION (no key required)
    if (action === 'test') {
      return new Response(JSON.stringify({ ok: true, message: 'Edge function is working' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // EMAIL STATS
    if (action === 'email_stats') {
      const { data: contacts } = await sbClient
        .from('rita_contacts')
        .select('email')
        .not('email', 'is', null)
      const { data: campaigns } = await sbClient
        .from('rita_email_campaigns')
        .select('*')
        .eq('status', 'sent')

      return new Response(JSON.stringify({
        ok: true,
        emConEmail: (contacts || []).length,
        emCampanas: (campaigns || []).length,
        emUltimo: campaigns && campaigns.length > 0 ? campaigns[0].sent_at : null,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // EMAIL SEND
    if (action === 'email_send') {
      const { subject, body_md } = body
      if (!subject || !body_md) {
        return new Response(JSON.stringify({ ok: false, error: 'subject and body_md required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const { data: contacts } = await sbClient
        .from('rita_contacts')
        .select('email, preferred_name')
        .not('email', 'is', null)

      if (!contacts || contacts.length === 0) {
        return new Response(JSON.stringify({ ok: false, error: 'No contacts with email' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const bodyHtml = mdToHtml(body_md)
      const emailHtml = html_email_template(bodyHtml)

      let sent = 0,
        errors = 0
      const errorDetails = []

      for (const c of contacts) {
        const personalizedHtml = emailHtml.replace(/\{\{nombre\}\}/g, c.preferred_name || 'Gruero')
        const result = await sendEmailViaResend(c.email, subject, personalizedHtml)
        if (result.ok) sent++
        else {
          errors++
          if (errorDetails.length < 5) errorDetails.push({ email: c.email, error: result.error })
        }
        await new Promise((r) => setTimeout(r, 100))
      }

      const { error: insertError } = await sbClient.from('rita_email_campaigns').insert({
        subject,
        body_html: emailHtml,
        from_name: 'Ridera',
        from_email: 'noticias@ridera.com.co',
        sent_count: sent,
        error_count: errors,
        total_recipients: contacts.length,
        status: 'sent',
        sent_at: new Date().toISOString(),
      })

      return new Response(JSON.stringify({ ok: true, sent, errors, total: contacts.length, errorDetails }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // CAMPANA PREVIEW - contacts missing a name
    if (action === 'campana_preview') {
      const { data: contacts } = await sbClient
        .from('rita_contacts')
        .select('phone_number, preferred_name')

      const total = contacts?.length || 0
      const sinNombre = (contacts || []).filter((c) => !c.preferred_name).length

      return new Response(JSON.stringify({ ok: true, total, sinNombre }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // CAMPANA ENVIAR NOMBRE - ask contacts without a name to introduce themselves
    if (action === 'campana_enviar_nombre') {
      const { data: contacts } = await sbClient
        .from('rita_contacts')
        .select('phone_number, preferred_name')

      const targets = (contacts || []).filter((c) => !c.preferred_name)

      let sent = 0,
        errors = 0
      const errorDetails = []

      for (const c of targets) {
        const result = await sendWATemplate(c.phone_number, 'pedir_nombre_rita', 'es_CO', [])
        if (result.ok) sent++
        else {
          errors++
          if (errorDetails.length < 10) errorDetails.push({ phone: '...' + (c.phone_number || '').slice(-4), error: result.error })
        }
        await new Promise((r) => setTimeout(r, 200))
      }

      return new Response(JSON.stringify({ ok: true, sent, errors, total: targets.length, errorDetails }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // CAMPANA PREVIEW EMAIL - contacts with a name but no email
    if (action === 'campana_preview_email') {
      const { data: contacts } = await sbClient
        .from('rita_contacts')
        .select('phone_number, preferred_name, email')

      const total = contacts?.length || 0
      const sinEmail = (contacts || []).filter((c) => c.preferred_name && !c.email).length

      return new Response(JSON.stringify({ ok: true, total, sinEmail }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // CAMPANA ENVIAR EMAIL - ask named contacts without an email to share one
    if (action === 'campana_enviar_email') {
      const { data: contacts } = await sbClient
        .from('rita_contacts')
        .select('phone_number, preferred_name, email')

      const targets = (contacts || []).filter((c) => c.preferred_name && !c.email)

      let sent = 0,
        errors = 0
      const errorDetails = []

      for (const c of targets) {
        const result = await sendWATemplate(c.phone_number, 'pedir_email_rita', 'es_CO', [c.preferred_name])
        if (result.ok) sent++
        else {
          errors++
          if (errorDetails.length < 10) errorDetails.push({ phone: '...' + (c.phone_number || '').slice(-4), error: result.error })
        }
        await new Promise((r) => setTimeout(r, 200))
      }

      return new Response(JSON.stringify({ ok: true, sent, errors, total: targets.length, errorDetails }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // GENERIC GRAPH GET (diagnostic)
    if (action === 'graph_get') {
      const path = body.path || ''
      const res = await fetch(`${GRAPH}/${path}`, {
        headers: { Authorization: `Bearer ${waToken}` },
      })
      const data = await res.json()
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // LIST TEMPLATES (diagnostic)
    if (action === 'list_templates') {
      const waba = body.waba_id || '1406061330395268'
      const res = await fetch(`${GRAPH}/${waba}/message_templates?fields=name,status,category,language,components&limit=200`, {
        headers: { Authorization: `Bearer ${waToken}` },
      })
      const data = await res.json()
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // DELETE TEMPLATE
    if (action === 'delete_template') {
      const name = body.name
      const waba = body.waba_id || '1406061330395268'
      const res = await fetch(`${GRAPH}/${waba}/message_templates?name=${encodeURIComponent(name)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${waToken}` },
      })
      const data = await res.json()
      return new Response(JSON.stringify(data), {
        status: res.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // CREATE TEMPLATE
    if (action === 'create_template') {
      const { name, category, language, components } = body
      const waba = body.waba_id || '1406061330395268'
      const res = await fetch(`${GRAPH}/${waba}/message_templates`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${waToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, category, language, components }),
      })
      const data = await res.json()
      return new Response(JSON.stringify(data), {
        status: res.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // EMAIL TEST
    if (action === 'email_test') {
      const { subject, body_md, test_email } = body
      if (!subject || !body_md || !test_email) {
        return new Response(JSON.stringify({ ok: false, error: 'subject, body_md, and test_email required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const bodyHtml = mdToHtml(body_md)
      const emailHtml = html_email_template(bodyHtml)
      const result = await sendEmailViaResend(test_email, subject, emailHtml)

      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ ok: false, error: 'Unknown action' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    return new Response(JSON.stringify({ ok: false, error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
