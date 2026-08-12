// wp-content-sync
//
// Trae contenido publicado de ridera.com.co (posts, paginas, rutas) via la
// REST API de WordPress, lo guarda en wp_sync_content, lo trocea y genera
// embeddings con Voyage AI hacia ridera_content para que Rita pueda buscarlo
// semanticamente via match_ridera_content().
//
// Procesa por lotes (LIMIT_DEFAULT items por invocacion) para no exceder el
// tiempo de ejecucion de la edge function. Se puede llamar repetidas veces
// (manual o por pg_cron) hasta que "pendientes" llegue a 0.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-ridera-cron',
}

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const CRON_SECRET = Deno.env.get('CRON_SECRET') ?? 'rid3ra_cron_2026'
const sbClient = createClient(supabaseUrl, supabaseServiceKey)

const WP_BASE = 'https://ridera.com.co'
const CONTENT_TYPES: { type: string; restBase: string }[] = [
  { type: 'post', restBase: 'posts' },
  { type: 'page', restBase: 'pages' },
  { type: 'rutas', restBase: 'rutas' },
]

const VOYAGE_MODEL = 'voyage-3'
const CHUNK_SIZE = 1200
const CHUNK_OVERLAP = 150

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

function chunkText(text: string, size = CHUNK_SIZE, overlap = CHUNK_OVERLAP): string[] {
  if (!text) return []
  if (text.length <= size) return [text]
  const chunks: string[] = []
  let start = 0
  while (start < text.length) {
    const end = Math.min(start + size, text.length)
    chunks.push(text.slice(start, end))
    if (end === text.length) break
    start = end - overlap
  }
  return chunks
}

async function getVoyageKey(): Promise<string> {
  const { data, error } = await sbClient.rpc('get_vault_secret', { secret_name: 'voyage_api_key' })
  if (error || !data) throw new Error('No se pudo leer la clave de Voyage: ' + (error?.message || 'vacía'))
  return data as string
}

async function embedBatch(texts: string[], apiKey: string, inputType: 'document' | 'query'): Promise<number[][]> {
  const res = await fetch('https://api.voyageai.com/v1/embeddings', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ input: texts, model: VOYAGE_MODEL, input_type: inputType }),
  })
  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`Voyage API ${res.status}: ${errText}`)
  }
  const data = await res.json()
  return data.data.map((d: { embedding: number[] }) => d.embedding)
}

async function fetchAllWP(restBase: string): Promise<Record<string, unknown>[]> {
  const items: Record<string, unknown>[] = []
  let page = 1
  while (true) {
    const url = `${WP_BASE}/wp-json/wp/v2/${restBase}?per_page=50&page=${page}&status=publish&_embed`
    const res = await fetch(url)
    if (!res.ok) break
    const batch = await res.json()
    if (!Array.isArray(batch) || batch.length === 0) break
    items.push(...batch)
    const totalPages = Number(res.headers.get('x-wp-totalpages') || '1')
    if (page >= totalPages) break
    page++
  }
  return items
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const secreto = req.headers.get('x-ridera-cron') ?? new URL(req.url).searchParams.get('secret') ?? ''
  if (secreto !== CRON_SECRET) {
    return json({ ok: false, error: 'no autorizado' }, 401)
  }

  const url = new URL(req.url)
  const limit = Math.min(Number(url.searchParams.get('limit') || '25'), 100)
  const onlyType = url.searchParams.get('type') || null

  try {
    const voyageKey = await getVoyageKey()

    // Snapshot de lo ya sincronizado (wp_sync_content.synced_at se actualiza
    // siempre, aunque el contenido quede vacio tras strip_html, para no
    // reintentar para siempre las paginas sin texto util).
    const { data: existing } = await sbClient.from('wp_sync_content').select('wp_id, type, wp_modified_at')
    const syncedAt = new Map<string, string | null>()
    for (const row of existing || []) {
      syncedAt.set(`${row.type}:${row.wp_id}`, row.wp_modified_at)
    }

    const types = onlyType ? CONTENT_TYPES.filter((t) => t.type === onlyType) : CONTENT_TYPES
    const perType: Record<string, unknown>[] = []
    let totalWp = 0
    let pendientes = 0
    let procesados = 0
    let chunksTotal = 0
    const errores: string[] = []

    for (const { type, restBase } of types) {
      const wpItems = await fetchAllWP(restBase)
      totalWp += wpItems.length
      let synced = 0
      let embedded = 0
      let skipped = 0

      for (const item of wpItems) {
        const wpModified = item.modified_gmt
          ? new Date(String(item.modified_gmt) + 'Z').toISOString()
          : null
        const link = String(item.link)
        const lastSyncedModified = syncedAt.get(`${type}:${item.id}`)
        const needsSync =
          lastSyncedModified === undefined ||
          (!!wpModified && new Date(lastSyncedModified || 0).getTime() < new Date(wpModified).getTime())

        if (!needsSync) { skipped++; continue }

        pendientes++
        if (procesados >= limit) continue // se procesara en la siguiente invocacion

        const title = (item.title as { rendered?: string })?.rendered || ''
        const contentHtml = (item.content as { rendered?: string })?.rendered || ''
        const excerpt = (item.excerpt as { rendered?: string })?.rendered || ''
        const embeddedMedia = (item as { _embedded?: Record<string, unknown[]> })._embedded
        const featuredImage =
          (embeddedMedia?.['wp:featuredmedia']?.[0] as { source_url?: string })?.source_url || null

        const { error: upsertErr } = await sbClient.from('wp_sync_content').upsert(
          {
            wp_id: item.id,
            type,
            title,
            slug: item.slug,
            status: item.status,
            content: contentHtml,
            excerpt,
            featured_image: featuredImage,
            link,
            meta: item.acf || {},
            wp_modified_at: wpModified,
            synced_at: new Date().toISOString(),
          },
          { onConflict: 'wp_id,type' },
        )
        if (upsertErr) { errores.push(`${type}#${item.id}: ${upsertErr.message}`); procesados++; continue }
        synced++

        const plainText = stripHtml(contentHtml)
        procesados++
        if (!plainText) { continue }

        const chunks = chunkText(plainText)
        if (!chunks.length) continue

        let embeddings: number[][]
        try {
          embeddings = await embedBatch(chunks, voyageKey, 'document')
        } catch (e) {
          errores.push(`${type}#${item.id} embed: ${(e as Error).message}`)
          continue
        }

        await sbClient.from('ridera_content').delete().eq('url', link)
        const rows = chunks.map((chunk_text, i) => ({
          url: link,
          titulo: title,
          categoria: type,
          chunk_text,
          chunk_index: i,
          embedding: embeddings[i],
          updated_at: new Date().toISOString(),
        }))
        const { error: insErr } = await sbClient.from('ridera_content').insert(rows)
        if (insErr) { errores.push(`${type}#${item.id} insert: ${insErr.message}`); continue }
        embedded++
        chunksTotal += rows.length
      }

      perType.push({ type, wp_total: wpItems.length, sincronizados: synced, embebidos: embedded, sin_cambios: skipped })
    }

    return json({
      ok: true,
      total_wp: totalWp,
      procesados,
      pendientes: Math.max(pendientes - procesados, 0),
      chunks_nuevos: chunksTotal,
      por_tipo: perType,
      errores: errores.slice(0, 10),
    })
  } catch (e) {
    return json({ ok: false, error: (e as Error).message }, 500)
  }
})
