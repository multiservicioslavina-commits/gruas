import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const resendApiKey = Deno.env.get('RESEND_API_KEY')

const sbClient = createClient(supabaseUrl, supabaseServiceKey)

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
  try {
    const { data, error } = await sbClient
      .from('grueros_admins')
      .select('id')
      .eq('api_key', key)
      .maybeSingle()
    if (error) {
      console.error('validateKey error:', error)
      return false
    }
    return !!data
  } catch (err) {
    console.error('validateKey exception:', err)
    return false
  }
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
        from: `${from_name} <onboarding@resend.dev>`,
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
        from_email: 'onboarding@resend.dev',
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
