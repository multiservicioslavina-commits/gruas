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
const tgBotToken = Deno.env.get('TELEGRAM_BOT_TOKEN') || ''
const TELEGRAM_API = `https://api.telegram.org/bot${tgBotToken}`
const metaPageToken = Deno.env.get('META_PAGE_ACCESS_TOKEN') || ''

async function sendMetaMessage(psid: string, text: string): Promise<{ ok: boolean; error?: string }> {
  if (!metaPageToken) return { ok: false, error: 'Falta META_PAGE_ACCESS_TOKEN' }
  try {
    const res = await fetch(`${GRAPH}/me/messages?access_token=${metaPageToken}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipient: { id: psid }, message: { text } }),
    })
    if (res.ok) return { ok: true }
    const d = await res.json().catch(() => ({}))
    return { ok: false, error: d?.error?.message || `HTTP ${res.status}` }
  } catch (error) {
    return { ok: false, error: error.message }
  }
}

async function sendTelegramMessage(chatId: number, text: string): Promise<{ ok: boolean; error?: string }> {
  if (!tgBotToken) return { ok: false, error: 'Falta TELEGRAM_BOT_TOKEN' }
  try {
    const res = await fetch(`${TELEGRAM_API}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text }),
    })
    if (res.ok) return { ok: true }
    const d = await res.json().catch(() => ({}))
    return { ok: false, error: d?.description || `HTTP ${res.status}` }
  } catch (error) {
    return { ok: false, error: error.message }
  }
}

const sbClient = createClient(supabaseUrl, supabaseServiceKey)

async function sendWATemplate(to: string, name: string, language: string, bodyParams: string[], media?: { type: 'image' | 'video' | 'document'; url: string }): Promise<{ ok: boolean; error?: string }> {
  if (!waToken || !waPhoneId) return { ok: false, error: 'Faltan credenciales WhatsApp' }
  try {
    const components: Record<string, unknown>[] = bodyParams.length
      ? [{ type: 'body', parameters: bodyParams.map((t) => ({ type: 'text', text: t })) }]
      : []
    // Only works if the approved template has a matching HEADER component (IMAGE/VIDEO/DOCUMENT).
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

async function validateKey(key: string): Promise<{ ok: boolean; role?: string; username?: string }> {
  const sep = (key || '').indexOf(':')
  if (sep === -1) return { ok: false }
  const username = key.slice(0, sep)
  const password = key.slice(sep + 1)
  if (!username || !password) return { ok: false }
  const { data, error } = await sbClient.rpc('verify_admin_credentials', { p_username: username, p_password: password })
  if (error || !data || !data.length) return { ok: false }
  sbClient.from('admin_users').update({ last_login_at: new Date().toISOString() }).eq('username', username).then(() => {})
  return { ok: true, role: data[0].role, username }
}

function logAudit(username: string, action: string, detail: Record<string, unknown> = {}) {
  sbClient.from('admin_audit_log').insert({ username, action, detail }).then(() => {})
}

function weekKey(d: Date): string {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  const dayNum = date.getUTCDay() || 7
  date.setUTCDate(date.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1))
  const weekNo = Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
  return `${date.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`
}

function toSlug(s: string, suffix = ''): string {
  const base = s.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) || 'gruero'
  return suffix ? `${base}-${suffix}` : base
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

    const auth = await validateKey(key)
    console.log('validateKey result:', { key: key.substring(0, 10) + '...', ok: auth.ok, role: auth.role })

    if (!auth.ok) {
      return new Response(JSON.stringify({ ok: false, error: 'Invalid key' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    const role = auth.role || 'admin'
    const ADMIN_ONLY_ACTIONS = new Set([
      'toggle_approval', 'reject_record', 'update_record', 'approve', 'set', 'delete',
      'update_error', 'export_contacts', 'broadcast',
      'email_send', 'email_test', 'campana_enviar_nombre', 'campana_enviar_email',
      'update_sello', 'cancel_dispatch', 'create_template', 'delete_template',
      'admin_users_list', 'admin_users_create', 'admin_users_delete', 'admin_audit_log',
      'campaign_create', 'campaign_list', 'campaign_cancel', 'telegram_broadcast', 'meta_broadcast',
      'survey_create', 'survey_list', 'survey_results', 'set_tags',
      'reserva_update_estado',
    ])
    if (ADMIN_ONLY_ACTIONS.has(action) && role !== 'admin') {
      return new Response(JSON.stringify({ ok: false, error: 'No tienes permisos para esta acción (solo admin)' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // LIST ACTION - for login validation
    if (action === 'list') {
      const { data: grueros } = await sbClient.from('grueros').select('*')
      return new Response(JSON.stringify({ ok: true, grueros: grueros || [], role }), {
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
      logAudit(auth.username!, 'toggle_approval', { table, id, aprobado })
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // REJECT RECORD (talleres, almacenes, clubs, motos_venta, riders, sellos) - deletes the record
    if (action === 'reject_record') {
      const { table, id } = body
      const allowedTables = ['talleres', 'almacenes', 'clubs', 'motos_venta', 'riders', 'sellos', 'hoteles', 'restaurantes']
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
      logAudit(auth.username!, 'reject_record', { table, id })
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // UPDATE RECORD (talleres, almacenes, clubs, motos_venta, grueros, riders) - edit allowed fields
    if (action === 'update_record') {
      const { table, id, fields } = body
      const editableFields: Record<string, string[]> = {
        clubs: ['nombre', 'ciudad', 'codigo'],
        talleres: ['nombre', 'ciudad', 'telefono', 'email', 'instagram', 'direccion', 'barrio'],
        almacenes: ['nombre', 'ciudad', 'telefono', 'email', 'direccion', 'barrio', 'categorias'],
        motos_venta: ['titulo', 'precio', 'ciudad', 'barrio', 'telefono', 'email', 'marca', 'modelo', 'anio', 'kilometraje', 'cilindraje', 'color', 'descripcion'],
        grueros: ['nombre', 'ciudad', 'telefono', 'email', 'zona'],
        riders: ['nombre', 'apellido', 'ciudad', 'telefono', 'correo', 'moto_marca', 'moto_modelo', 'fecha_nacimiento'],
        hoteles: ['nombre', 'municipio', 'subregion', 'direccion', 'telefono', 'whatsapp', 'email', 'contacto_nombre', 'descripcion'],
        restaurantes: ['nombre', 'municipio', 'subregion', 'direccion', 'telefono', 'whatsapp', 'email', 'tipo_cocina', 'contacto_nombre', 'descripcion'],
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
      logAudit(auth.username!, 'update_record', { table, id, fields: Object.keys(update) })
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // SET TAGS (segmentación) on rita_contacts by phone or riders by id
    if (action === 'set_tags') {
      const { entity, id, phone, tags } = body
      if (!Array.isArray(tags)) {
        return new Response(JSON.stringify({ ok: false, error: 'tags debe ser un arreglo' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      const cleanTags = [...new Set(tags.map((t: string) => String(t).trim().toLowerCase()).filter(Boolean))]
      if (entity === 'rider') {
        const { error } = await sbClient.from('riders').update({ tags: cleanTags }).eq('id', id)
        if (error) return new Response(JSON.stringify({ ok: false, error: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      } else if (entity === 'contact') {
        const { error } = await sbClient.from('rita_contacts').update({ tags: cleanTags }).eq('phone_number', phone)
        if (error) return new Response(JSON.stringify({ ok: false, error: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      } else {
        return new Response(JSON.stringify({ ok: false, error: 'entity debe ser rider o contact' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      logAudit(auth.username!, 'set_tags', { entity, id: id || null, phone: phone || null, tags: cleanTags })
      return new Response(JSON.stringify({ ok: true, tags: cleanTags }), {
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

    // STATS (Despacho dashboard)
    if (action === 'stats') {
      const { data: all } = await sbClient
        .from('solicitudes')
        .select('id, estado, municipio, calificacion, created_at, asignada_at')

      const rows = all || []
      const now = Date.now()
      const startToday = new Date(); startToday.setHours(0, 0, 0, 0)
      const startWeek = new Date(now - 7 * 86400000)
      const startMonth = new Date(now - 30 * 86400000)

      const total = rows.length
      const hoy = rows.filter((s) => new Date(s.created_at) >= startToday).length
      const semana = rows.filter((s) => new Date(s.created_at) >= startWeek).length
      const mes = rows.filter((s) => new Date(s.created_at) >= startMonth).length

      const cals = rows.map((s) => s.calificacion).filter((c): c is number => typeof c === 'number')
      const avgCal = cals.length ? Math.round((cals.reduce((a, b) => a + b, 0) / cals.length) * 10) / 10 : null

      const respTimes = rows
        .filter((s) => s.asignada_at)
        .map((s) => (new Date(s.asignada_at).getTime() - new Date(s.created_at).getTime()) / 60000)
      const avgRespuestaMin = respTimes.length ? Math.round(respTimes.reduce((a, b) => a + b, 0) / respTimes.length) : null

      const byEstado: Record<string, number> = {}
      for (const s of rows) byEstado[s.estado] = (byEstado[s.estado] || 0) + 1

      const muniCounts: Record<string, number> = {}
      for (const s of rows) if (s.municipio) muniCounts[s.municipio] = (muniCounts[s.municipio] || 0) + 1
      const topMunicipios = Object.entries(muniCounts)
        .sort((a, b) => b[1] - a[1]).slice(0, 5)
        .map(([municipio, total]) => ({ municipio, total }))

      const recientes = [...rows]
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 10)
        .map((s) => ({ estado: s.estado, municipio: s.municipio, calificacion: s.calificacion, created_at: s.created_at }))

      return new Response(JSON.stringify({ ok: true, total, hoy, semana, mes, avgCal, avgRespuestaMin, byEstado, topMunicipios, recientes }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // PENDING DISPATCH
    if (action === 'pending_dispatch') {
      const { data: sols, error } = await sbClient
        .from('solicitudes')
        .select('id, cliente_nombre, created_at, municipio, ubicacion, estado, asignada_at, gruero_asignado')
        .in('estado', ['pendiente', 'asignada'])
        .order('created_at', { ascending: false })
      if (error) {
        return new Response(JSON.stringify({ ok: false, error: error.message }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      const ids = [...new Set((sols || []).map((s) => s.gruero_asignado).filter(Boolean))]
      const nombres: Record<string, string> = {}
      if (ids.length) {
        const { data: gs } = await sbClient.from('grueros').select('id, nombre').in('id', ids)
        for (const g of gs || []) nombres[g.id] = g.nombre
      }
      const solicitudes = (sols || []).map((s) => ({ ...s, gruero_nombre: s.gruero_asignado ? nombres[s.gruero_asignado] || null : null }))
      return new Response(JSON.stringify({ ok: true, solicitudes }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // CANCEL DISPATCH - return the solicitud to the queue for re-dispatch
    if (action === 'cancel_dispatch') {
      const { id } = body
      const { error } = await sbClient.from('solicitudes')
        .update({ estado: 'pendiente', gruero_asignado: null, asignada_at: null })
        .eq('id', id)
      if (error) {
        return new Response(JSON.stringify({ ok: false, error: error.message }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // DESPACHO GRUEROS - available grueros for a municipio
    if (action === 'despacho_grueros') {
      const municipio = String(body.municipio || '').toLowerCase()
      const { data: grueros, error } = await sbClient
        .from('grueros')
        .select('id, nombre, telefono, ciudad, municipios')
        .eq('aprobado', 'SI')
        .eq('disponible', true)
      if (error) {
        return new Response(JSON.stringify({ ok: false, error: error.message }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      const filtered = (grueros || []).filter((g) =>
        (g.ciudad && g.ciudad.toLowerCase() === municipio) ||
        (Array.isArray(g.municipios) && g.municipios.some((m: string) => (m || '').toLowerCase() === municipio))
      )
      return new Response(JSON.stringify({
        ok: true,
        grueros: filtered.map((g) => ({ id: g.id, nombre: g.nombre, telefono: g.telefono, datos: { ciudad: g.ciudad, municipios: g.municipios } })),
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // APPROVE GRUERO
    if (action === 'approve') {
      const { id } = body
      const { data: gruero } = await sbClient.from('grueros').select('id, nombre, email, slug, auth_id').eq('id', id).maybeSingle()
      if (!gruero) {
        return new Response(JSON.stringify({ ok: false, error: 'Gruero no encontrado' }), {
          status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      let slug = gruero.slug || toSlug(gruero.nombre)
      if (!gruero.slug) {
        const { data: ex } = await sbClient.from('grueros').select('id').eq('slug', slug).neq('id', gruero.id).maybeSingle()
        if (ex) slug = toSlug(gruero.nombre, String(Date.now()).slice(-4))
      }

      let auth_id = gruero.auth_id
      let auth_created = false
      if (gruero.email && gruero.email.includes('@') && !auth_id) {
        const { data: inv, error: invErr } = await sbClient.auth.admin.inviteUserByEmail(gruero.email, {
          data: { nombre: gruero.nombre, gruero_id: gruero.id },
          redirectTo: 'https://gruas.ridera.com.co/mi-cuenta.html',
        })
        if (!invErr && inv?.user) {
          auth_id = inv.user.id
          auth_created = true
        }
      }

      await sbClient.from('grueros').update({ aprobado: 'SI', disponible: true, slug, auth_id: auth_id ?? null }).eq('id', gruero.id)

      return new Response(JSON.stringify({ ok: true, auth_created, slug }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // SET (toggle gruero disponibilidad)
    if (action === 'set') {
      const { id, disponible } = body
      const { error } = await sbClient.from('grueros').update({ disponible }).eq('id', id)
      if (error) {
        return new Response(JSON.stringify({ ok: false, error: error.message }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // DELETE GRUERO
    if (action === 'delete') {
      const { id } = body
      const { error } = await sbClient.from('grueros').delete().eq('id', id)
      if (error) {
        return new Response(JSON.stringify({ ok: false, error: error.message }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      logAudit(auth.username!, 'delete_gruero', { id })
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // EXPORT SOLICITUDES (CSV data)
    if (action === 'export_solicitudes') {
      const { data: sols, error } = await sbClient
        .from('solicitudes')
        .select('id, estado, cliente_nombre, cliente_telefono, municipio, ubicacion, calificacion, comentario_cliente, created_at, asignada_at, llego_at, finalizada_at, gruero_asignado')
        .order('created_at', { ascending: false })
      if (error) {
        return new Response(JSON.stringify({ ok: false, error: error.message }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      const ids = [...new Set((sols || []).map((s) => s.gruero_asignado).filter(Boolean))]
      const nombres: Record<string, string> = {}
      if (ids.length) {
        const { data: gs } = await sbClient.from('grueros').select('id, nombre').in('id', ids)
        for (const g of gs || []) nombres[g.id] = g.nombre
      }
      const solicitudes = (sols || []).map((s) => ({ ...s, gruero_nombre: s.gruero_asignado ? nombres[s.gruero_asignado] || null : null }))
      return new Response(JSON.stringify({ ok: true, solicitudes }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // HISTORIAL POR GRUERO
    if (action === 'historial_gruero') {
      const { gruero_id } = body
      const { data: sols, error } = await sbClient
        .from('solicitudes')
        .select('id, estado, cliente_nombre, municipio, calificacion, created_at')
        .eq('gruero_asignado', gruero_id)
        .order('created_at', { ascending: false })
        .limit(100)
      if (error) {
        return new Response(JSON.stringify({ ok: false, error: error.message }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      const rows = sols || []
      const startMonth = new Date(Date.now() - 30 * 86400000)
      const total = rows.length
      const mes = rows.filter((s) => new Date(s.created_at) >= startMonth).length
      const finalizadas = rows.filter((s) => s.estado === 'finalizada').length
      const cals = rows.map((s) => s.calificacion).filter((c): c is number => typeof c === 'number')
      const avgCal = cals.length ? Math.round((cals.reduce((a, b) => a + b, 0) / cals.length) * 10) / 10 : null
      return new Response(JSON.stringify({ ok: true, stats: { total, mes, avgCal, finalizadas }, solicitudes: rows }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // CHANGE ADMIN PASSWORD
    if (action === 'change_password') {
      const nueva = String(body.new || '')
      if (nueva.length < 4) {
        return new Response(JSON.stringify({ ok: false, error: 'Mínimo 4 caracteres' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      const { error } = await sbClient.rpc('set_admin_password', { p_username: auth.username, p_password: nueva })
      if (error) {
        return new Response(JSON.stringify({ ok: false, error: error.message }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      logAudit(auth.username!, 'change_password', {})
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // RITA ANALYTICS
    if (action === 'analytics') {
      const { data: contacts } = await sbClient.from('rita_contacts').select('opted_in, last_seen_at')
      const totalContacts = contacts?.length || 0
      const optedIn = (contacts || []).filter((c) => c.opted_in).length

      const startToday = new Date(); startToday.setHours(0, 0, 0, 0)
      const startWeek = new Date(Date.now() - 7 * 86400000)
      const startMonth = new Date(Date.now() - 30 * 86400000)

      const activeToday = (contacts || []).filter((c) => c.last_seen_at && new Date(c.last_seen_at) >= startToday).length

      const { data: msgs } = await sbClient.from('rita_messages').select('created_at').gte('created_at', startMonth.toISOString())
      const rows = msgs || []
      const msgsToday = rows.filter((m) => new Date(m.created_at) >= startToday).length
      const msgsWeek = rows.filter((m) => new Date(m.created_at) >= startWeek).length
      const msgsMonth = rows.length

      const perDay: Record<string, number> = {}
      for (const m of rows) {
        const day = String(m.created_at).slice(0, 10)
        perDay[day] = (perDay[day] || 0) + 1
      }

      return new Response(JSON.stringify({
        ok: true, totalContacts, optedIn, activeToday, msgsToday, msgsWeek, msgsMonth, intentCounts: {}, perDay,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // GROWTH ANALYTICS (funnel + retencion + referidos)
    if (action === 'growth_analytics') {
      const [{ data: riders }, { data: sellos }, { data: msgs }, { data: referidos }] = await Promise.all([
        sbClient.from('riders').select('id, telefono, created_at'),
        sbClient.from('sellos').select('rider_id, fecha, estado').eq('estado', 'aprobado'),
        sbClient.from('rita_messages').select('phone, phone_number, created_at').gte('created_at', new Date(Date.now() - 60 * 86400000).toISOString()),
        sbClient.from('referidos').select('estado, created_at'),
      ])

      const totalRiders = riders?.length || 0
      const primerSelloByRider = new Map<string, string>()
      for (const s of sellos || []) {
        if (!s.rider_id) continue
        const prev = primerSelloByRider.get(s.rider_id)
        if (!prev || s.fecha < prev) primerSelloByRider.set(s.rider_id, s.fecha)
      }
      const activados = primerSelloByRider.size

      const phoneSuffix = (p: string) => (p || '').replace(/\D/g, '').slice(-10)
      const riderPhoneSuffixes = new Set((riders || []).map((r) => phoneSuffix(r.telefono)).filter(Boolean))
      const start30 = new Date(Date.now() - 30 * 86400000)
      const phonesActivos30 = new Set(
        (msgs || [])
          .filter((m) => new Date(m.created_at) >= start30)
          .map((m) => phoneSuffix(m.phone || m.phone_number))
          .filter((p) => p && riderPhoneSuffixes.has(p)),
      )
      const activosUltimos30 = phonesActivos30.size

      // Cohortes por semana de registro: % con al menos 1 sello dentro de 7 dias de registrarse
      const porSemana: Record<string, { registrados: number; activadosSemana1: number }> = {}
      for (const r of riders || []) {
        const semana = weekKey(new Date(r.created_at))
        porSemana[semana] = porSemana[semana] || { registrados: 0, activadosSemana1: 0 }
        porSemana[semana].registrados++
        const primerSello = primerSelloByRider.get(r.id)
        if (primerSello && (new Date(primerSello).getTime() - new Date(r.created_at).getTime()) <= 7 * 86400000) {
          porSemana[semana].activadosSemana1++
        }
      }

      const referidosTotal = referidos?.length || 0
      const referidosRegistrados = (referidos || []).filter((r) => r.estado === 'registrado').length
      const tasaConversionReferidos = referidosTotal ? Math.round((referidosRegistrados / referidosTotal) * 100) : 0

      return new Response(JSON.stringify({
        ok: true,
        funnel: {
          registrados: totalRiders,
          activados_primer_sello: activados,
          tasa_activacion: totalRiders ? Math.round((activados / totalRiders) * 100) : 0,
          activos_ultimos_30d: activosUltimos30,
          tasa_retencion_30d: totalRiders ? Math.round((activosUltimos30 / totalRiders) * 100) : 0,
        },
        cohortes_semanales: Object.entries(porSemana).sort(([a], [b]) => a.localeCompare(b)).map(([semana, v]) => ({
          semana, registrados: v.registrados, activados_semana1: v.activadosSemana1,
          tasa_activacion_semana1: v.registrados ? Math.round((v.activadosSemana1 / v.registrados) * 100) : 0,
        })),
        referidos: {
          total_invitaciones: referidosTotal,
          registrados: referidosRegistrados,
          tasa_conversion: tasaConversionReferidos,
        },
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // RESERVAS (talleres, almacenes, hoteles, restaurantes - sin pago)
    if (action === 'reserva_list') {
      const estado = body.estado ? String(body.estado) : null
      let query = sbClient.from('reservas').select('*').order('created_at', { ascending: false }).limit(200)
      if (estado) query = query.eq('estado', estado)
      const { data, error } = await query
      if (error) {
        return new Response(JSON.stringify({ ok: false, error: error.message }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      return new Response(JSON.stringify({ ok: true, reservas: data || [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (action === 'reserva_update_estado') {
      const { id, estado } = body
      const validEstados = ['pendiente', 'confirmada', 'cancelada', 'completada']
      if (!validEstados.includes(estado)) {
        return new Response(JSON.stringify({ ok: false, error: 'Estado no válido' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      const { error } = await sbClient.from('reservas').update({ estado, updated_at: new Date().toISOString() }).eq('id', id)
      if (error) {
        return new Response(JSON.stringify({ ok: false, error: error.message }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      logAudit(auth.username!, 'reserva_update_estado', { id, estado })
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // RITA CONTACTS (paginated + search)
    if (action === 'contacts') {
      const limit = Math.min(Number(body.limit) || 20, 100)
      const offset = Math.max(Number(body.offset) || 0, 0)
      const search = String(body.search || '').replace(/[,()%]/g, '').trim()

      let query = sbClient.from('rita_contacts').select('phone_number, preferred_name, opted_in, last_seen_at, email', { count: 'exact' })
      if (search) query = query.or(`preferred_name.ilike.%${search}%,phone_number.ilike.%${search}%`)
      query = query.order('last_seen_at', { ascending: false, nullsFirst: false }).range(offset, offset + limit - 1)

      const { data, count, error } = await query
      if (error) {
        return new Response(JSON.stringify({ ok: false, error: error.message }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      return new Response(JSON.stringify({ ok: true, contacts: data || [], total: count || 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // CONVERSATION VIEWER
    if (action === 'conversation') {
      const phone = String(body.phone || '')
      const { data: messages, error } = await sbClient
        .from('rita_messages')
        .select('role, content, created_at')
        .or(`phone.eq.${phone},phone_number.eq.${phone}`)
        .order('created_at', { ascending: true })
        .limit(300)
      if (error) {
        return new Response(JSON.stringify({ ok: false, error: error.message }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      return new Response(JSON.stringify({ ok: true, messages: messages || [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ERROR REPORTS
    if (action === 'error_reports') {
      let query = sbClient.from('rita_errores_reportados').select('*').order('created_at', { ascending: false }).limit(200)
      if (body.estado) query = query.eq('estado', body.estado)
      const { data, error } = await query
      if (error) {
        return new Response(JSON.stringify({ ok: false, error: error.message }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      return new Response(JSON.stringify({ ok: true, reports: data || [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // UPDATE ERROR REPORT STATE
    if (action === 'update_error') {
      const { id, estado } = body
      const { error } = await sbClient.from('rita_errores_reportados').update({ estado }).eq('id', id)
      if (error) {
        return new Response(JSON.stringify({ ok: false, error: error.message }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // EXPORT RITA CONTACTS (CSV data)
    if (action === 'export_contacts') {
      const { data: contacts, error } = await sbClient
        .from('rita_contacts')
        .select('phone_number, preferred_name, email, last_seen_at, opted_in, created_at')
        .order('created_at', { ascending: false })
      if (error) {
        return new Response(JSON.stringify({ ok: false, error: error.message }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      return new Response(JSON.stringify({ ok: true, contacts: contacts || [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // BROADCAST AUDIENCE - distinct ciudades + count of opted-in contacts, optionally filtered by ciudad
    if (action === 'broadcast_audience') {
      const ciudad = String(body.ciudad || '').trim()
      const tag = String(body.tag || '').trim()
      let contactsQuery = sbClient.from('rita_contacts').select('phone_number, tags').eq('opted_in', true)
      if (tag) contactsQuery = contactsQuery.contains('tags', [tag])
      const { data: contacts } = await contactsQuery
      const { data: riders } = await sbClient.from('riders').select('telefono, ciudad').not('ciudad', 'is', null)
      const { data: allTagged } = await sbClient.from('rita_contacts').select('tags').eq('opted_in', true)
      const ciudadByPhoneSuffix = new Map<string, string>()
      for (const r of riders || []) {
        const suffix = (r.telefono || '').replace(/\D/g, '').slice(-10)
        if (suffix) ciudadByPhoneSuffix.set(suffix, r.ciudad)
      }
      const ciudades = [...new Set((riders || []).map((r) => r.ciudad).filter(Boolean))].sort()
      const tags = [...new Set((allTagged || []).flatMap((c) => c.tags || []))].sort()
      let total = (contacts || []).length
      if (ciudad) {
        total = (contacts || []).filter((c) => {
          const suffix = (c.phone_number || '').replace(/\D/g, '').slice(-10)
          return ciudadByPhoneSuffix.get(suffix) === ciudad
        }).length
      }
      return new Response(JSON.stringify({ ok: true, total, ciudades, tags }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // BROADCAST (WhatsApp template to opted-in contacts, optionally filtered by rider ciudad)
    if (action === 'broadcast') {
      const { template, language, params, ciudad, tag, mediaUrl, mediaType } = body
      if (!template) {
        return new Response(JSON.stringify({ ok: false, error: 'Falta el nombre del template' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      const media = mediaUrl && ['image', 'video', 'document'].includes(mediaType) ? { type: mediaType, url: mediaUrl } : undefined
      let contactsQuery = sbClient.from('rita_contacts').select('phone_number, preferred_name').eq('opted_in', true)
      if (tag) contactsQuery = contactsQuery.contains('tags', [String(tag).trim()])
      let { data: contacts } = await contactsQuery
      contacts = contacts || []

      if (ciudad) {
        const { data: riders } = await sbClient.from('riders').select('telefono, ciudad').not('ciudad', 'is', null)
        const ciudadByPhoneSuffix = new Map<string, string>()
        for (const r of riders || []) {
          const suffix = (r.telefono || '').replace(/\D/g, '').slice(-10)
          if (suffix) ciudadByPhoneSuffix.set(suffix, r.ciudad)
        }
        contacts = contacts.filter((c) => {
          const suffix = (c.phone_number || '').replace(/\D/g, '').slice(-10)
          return ciudadByPhoneSuffix.get(suffix) === ciudad
        })
      }

      let sent = 0, errors = 0
      const errorDetails: { phone: string; error?: string }[] = []

      for (const c of contacts) {
        const bodyParams = (Array.isArray(params) ? params : []).map((p: string) => (p === '{{nombre}}' ? (c.preferred_name || '') : p))
        const result = await sendWATemplate(c.phone_number, template, language || 'es_CO', bodyParams, media)
        if (result.ok) sent++
        else {
          errors++
          if (errorDetails.length < 10) errorDetails.push({ phone: '...' + (c.phone_number || '').slice(-4), error: result.error })
        }
        await new Promise((r) => setTimeout(r, 200))
      }

      logAudit(auth.username!, 'broadcast', { template, ciudad: ciudad || null, tag: tag || null, sent, errors })
      return new Response(JSON.stringify({ ok: true, sent, errors, total: contacts.length, errorDetails }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // CREATE SCHEDULED CAMPAIGN
    if (action === 'campaign_create') {
      const { template, language, params, ciudad, mediaUrl, mediaType, scheduledAt } = body
      if (!template || !scheduledAt) {
        return new Response(JSON.stringify({ ok: false, error: 'Falta el template o la fecha programada' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      const { data: campaign, error } = await sbClient.from('broadcast_campaigns').insert({
        template,
        language: language || 'es_CO',
        params: Array.isArray(params) ? params : [],
        ciudad: ciudad || null,
        media_url: mediaUrl || null,
        media_type: ['image', 'video', 'document'].includes(mediaType) ? mediaType : null,
        scheduled_at: scheduledAt,
        created_by: auth.username!,
      }).select().single()
      if (error) {
        return new Response(JSON.stringify({ ok: false, error: error.message }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      logAudit(auth.username!, 'campaign_create', { campaign_id: campaign.id, template, scheduledAt })
      return new Response(JSON.stringify({ ok: true, campaign }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // LIST SCHEDULED CAMPAIGNS
    if (action === 'campaign_list') {
      const { data: campaigns, error } = await sbClient
        .from('broadcast_campaigns')
        .select('*')
        .order('scheduled_at', { ascending: false })
        .limit(100)
      if (error) {
        return new Response(JSON.stringify({ ok: false, error: error.message }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      return new Response(JSON.stringify({ ok: true, campaigns: campaigns || [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // CANCEL SCHEDULED CAMPAIGN
    if (action === 'campaign_cancel') {
      const { campaignId } = body
      if (!campaignId) {
        return new Response(JSON.stringify({ ok: false, error: 'Falta el id de la campaña' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      const { error } = await sbClient.from('broadcast_campaigns').update({ status: 'canceled' }).eq('id', campaignId).eq('status', 'pending')
      if (error) {
        return new Response(JSON.stringify({ ok: false, error: error.message }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      logAudit(auth.username!, 'campaign_cancel', { campaign_id: campaignId })
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // TELEGRAM AUDIENCE
    if (action === 'telegram_audience') {
      const { count } = await sbClient.from('telegram_contacts').select('id', { count: 'exact', head: true }).eq('opted_in', true)
      return new Response(JSON.stringify({ ok: true, total: count || 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // TELEGRAM BROADCAST (plain text to opted-in Telegram contacts)
    if (action === 'telegram_broadcast') {
      const { message } = body
      if (!message) {
        return new Response(JSON.stringify({ ok: false, error: 'Falta el mensaje' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      const { data: contacts } = await sbClient.from('telegram_contacts').select('chat_id, first_name').eq('opted_in', true)
      let sent = 0, errors = 0
      const errorDetails: { chatId: string; error?: string }[] = []
      for (const c of contacts || []) {
        const text = message.replace(/\{\{nombre\}\}/g, c.first_name || '')
        const result = await sendTelegramMessage(c.chat_id, text)
        if (result.ok) sent++
        else {
          errors++
          if (errorDetails.length < 10) errorDetails.push({ chatId: String(c.chat_id), error: result.error })
        }
        await new Promise((r) => setTimeout(r, 50))
      }
      logAudit(auth.username!, 'telegram_broadcast', { sent, errors })
      return new Response(JSON.stringify({ ok: true, sent, errors, total: (contacts || []).length, errorDetails }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // META AUDIENCE (Messenger + Instagram DM)
    if (action === 'meta_audience') {
      const channel = body.channel === 'instagram' ? 'instagram' : 'messenger'
      const { count } = await sbClient.from('meta_contacts').select('id', { count: 'exact', head: true }).eq('opted_in', true).eq('channel', channel)
      return new Response(JSON.stringify({ ok: true, total: count || 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // META BROADCAST (Messenger + Instagram DM, plain text to opted-in contacts within the 24h window)
    if (action === 'meta_broadcast') {
      const { message, channel: rawChannel } = body
      const channel = rawChannel === 'instagram' ? 'instagram' : 'messenger'
      if (!message) {
        return new Response(JSON.stringify({ ok: false, error: 'Falta el mensaje' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      const { data: contacts } = await sbClient.from('meta_contacts').select('psid, name').eq('opted_in', true).eq('channel', channel)
      let sent = 0, errors = 0
      const errorDetails: { psid: string; error?: string }[] = []
      for (const c of contacts || []) {
        const text = message.replace(/\{\{nombre\}\}/g, c.name || '')
        const result = await sendMetaMessage(c.psid, text)
        if (result.ok) sent++
        else {
          errors++
          if (errorDetails.length < 10) errorDetails.push({ psid: '...' + String(c.psid).slice(-4), error: result.error })
        }
        await new Promise((r) => setTimeout(r, 50))
      }
      logAudit(auth.username!, 'meta_broadcast', { channel, sent, errors })
      return new Response(JSON.stringify({ ok: true, sent, errors, total: (contacts || []).length, errorDetails }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // CREATE SURVEY (WhatsApp interactive buttons, max 3 options)
    if (action === 'survey_create') {
      const { pregunta, opciones, ciudad } = body
      if (!pregunta || !Array.isArray(opciones) || opciones.length < 2 || opciones.length > 3) {
        return new Response(JSON.stringify({ ok: false, error: 'La encuesta necesita una pregunta y entre 2 y 3 opciones' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      const { data: encuesta, error: insertError } = await sbClient.from('encuestas').insert({
        pregunta, opciones, ciudad: ciudad || null, created_by: auth.username!,
      }).select().single()
      if (insertError) {
        return new Response(JSON.stringify({ ok: false, error: insertError.message }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      let { data: contacts } = await sbClient.from('rita_contacts').select('phone_number').eq('opted_in', true)
      contacts = contacts || []
      if (ciudad) {
        const { data: riders } = await sbClient.from('riders').select('telefono, ciudad').not('ciudad', 'is', null)
        const ciudadByPhoneSuffix = new Map<string, string>()
        for (const r of riders || []) {
          const suffix = (r.telefono || '').replace(/\D/g, '').slice(-10)
          if (suffix) ciudadByPhoneSuffix.set(suffix, r.ciudad)
        }
        contacts = contacts.filter((c) => {
          const suffix = (c.phone_number || '').replace(/\D/g, '').slice(-10)
          return ciudadByPhoneSuffix.get(suffix) === ciudad
        })
      }

      const buttons = opciones.map((op: { label: string }, i: number) => ({
        type: 'reply', reply: { id: `enc:${encuesta.id}:${i}`, title: String(op.label).slice(0, 20) },
      }))

      let sent = 0, errors = 0
      for (const c of contacts) {
        try {
          const res = await fetch(`${GRAPH}/${waPhoneId}/messages`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${waToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              messaging_product: 'whatsapp',
              to: c.phone_number,
              type: 'interactive',
              interactive: { type: 'button', body: { text: pregunta }, action: { buttons } },
            }),
          })
          if (res.ok) sent++
          else errors++
        } catch { errors++ }
        await new Promise((r) => setTimeout(r, 200))
      }

      await sbClient.from('encuestas').update({ sent_count: sent }).eq('id', encuesta.id)
      logAudit(auth.username!, 'survey_create', { encuesta_id: encuesta.id, pregunta, sent, errors })
      return new Response(JSON.stringify({ ok: true, encuesta, sent, errors, total: contacts.length }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // LIST SURVEYS
    if (action === 'survey_list') {
      const { data: encuestas, error } = await sbClient.from('encuestas').select('*').order('created_at', { ascending: false }).limit(50)
      if (error) {
        return new Response(JSON.stringify({ ok: false, error: error.message }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      return new Response(JSON.stringify({ ok: true, encuestas: encuestas || [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // SURVEY RESULTS (counts per option)
    if (action === 'survey_results') {
      const { encuestaId } = body
      if (!encuestaId) {
        return new Response(JSON.stringify({ ok: false, error: 'Falta el id de la encuesta' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      const { data: respuestas, error } = await sbClient.from('encuesta_respuestas').select('opcion_label').eq('encuesta_id', encuestaId)
      if (error) {
        return new Response(JSON.stringify({ ok: false, error: error.message }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      const counts: Record<string, number> = {}
      for (const r of respuestas || []) counts[r.opcion_label] = (counts[r.opcion_label] || 0) + 1
      return new Response(JSON.stringify({ ok: true, counts, total: (respuestas || []).length }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // LIST SELLOS
    if (action === 'list_sellos') {
      const { data: sellos, error } = await sbClient
        .from('sellos')
        .select('*, riders(nombre)')
        .order('created_at', { ascending: false })
      if (error) {
        return new Response(JSON.stringify({ ok: false, error: error.message }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      return new Response(JSON.stringify({ ok: true, sellos: sellos || [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // UPDATE SELLO (approve/reject)
    if (action === 'update_sello') {
      const { id, estado } = body
      const { error } = await sbClient.from('sellos').update({ estado }).eq('id', id)
      if (error) {
        return new Response(JSON.stringify({ ok: false, error: error.message }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ADMIN USERS - list (admin only, no passwords returned)
    if (action === 'admin_users_list') {
      const { data: users, error } = await sbClient.from('admin_users').select('id, username, role, created_at, last_login_at').order('created_at', { ascending: true })
      if (error) {
        return new Response(JSON.stringify({ ok: false, error: error.message }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      return new Response(JSON.stringify({ ok: true, users: users || [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ADMIN AUDIT LOG - recent actions (admin only)
    if (action === 'admin_audit_log') {
      const { data: log, error } = await sbClient
        .from('admin_audit_log')
        .select('id, username, action, detail, created_at')
        .order('created_at', { ascending: false })
        .limit(200)
      if (error) {
        return new Response(JSON.stringify({ ok: false, error: error.message }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      return new Response(JSON.stringify({ ok: true, log: log || [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ADMIN USERS - create (admin only)
    if (action === 'admin_users_create') {
      const { username, password, role: newRole } = body
      if (!username || !password || !['admin', 'viewer'].includes(newRole)) {
        return new Response(JSON.stringify({ ok: false, error: 'Faltan username, password o role válido' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      if (password.length < 4) {
        return new Response(JSON.stringify({ ok: false, error: 'Contraseña mínimo 4 caracteres' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      const { error } = await sbClient.rpc('create_admin_user', { p_username: username, p_password: password, p_role: newRole })
      if (error) {
        return new Response(JSON.stringify({ ok: false, error: error.message.includes('duplicate') ? 'Ese usuario ya existe' : error.message }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      logAudit(auth.username!, 'admin_users_create', { username, role: newRole })
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ADMIN USERS - delete (admin only)
    if (action === 'admin_users_delete') {
      const { username: delUsername } = body
      if (!delUsername) {
        return new Response(JSON.stringify({ ok: false, error: 'Falta username' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      if (delUsername === auth.username) {
        return new Response(JSON.stringify({ ok: false, error: 'No puedes borrar tu propio usuario' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      const { error } = await sbClient.from('admin_users').delete().eq('username', delUsername)
      if (error) {
        return new Response(JSON.stringify({ ok: false, error: error.message }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      logAudit(auth.username!, 'admin_users_delete', { username: delUsername })
      return new Response(JSON.stringify({ ok: true }), {
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
