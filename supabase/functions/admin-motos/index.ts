import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const adminPassword = Deno.env.get('ADMIN_PASSWORD_MOTOS') || 'changeme'

const supabase = createClient(supabaseUrl, supabaseKey)

serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ ok: false, error: 'Method not allowed' }), { status: 405 })
  }

  try {
    const body = await req.json()
    const { key, action } = body

    if (key !== adminPassword) {
      return new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }), { status: 401 })
    }

    if (action === 'list') {
      const { data, error } = await supabase
        .from('motos_venta')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) throw error

      return new Response(JSON.stringify({ ok: true, motos: data || [] }))
    }

    if (action === 'update') {
      const { id, titulo, precio, km, descripcion, ciudad, telefono, email, aprobado, foto } = body

      let fotoUrl = null

      // Upload photo if provided
      if (foto && foto.startsWith('data:')) {
        try {
          const base64 = foto.split(',')[1]
          const buffer = Uint8Array.from(atob(base64), c => c.charCodeAt(0))
          const filename = `motos/${id}-${Date.now()}.jpg`

          const { data: uploadData, error: uploadError } = await supabase.storage
            .from('motos-venta')
            .upload(filename, buffer, { contentType: 'image/jpeg', upsert: false })

          if (uploadError) throw uploadError

          const { data: { publicUrl } } = supabase.storage
            .from('motos-venta')
            .getPublicUrl(uploadData.path)

          fotoUrl = publicUrl
        } catch (e) {
          console.error('Photo upload error:', e)
        }
      }

      const updateData: any = {
        titulo,
        precio: Number(precio),
        km: Number(km),
        descripcion,
        ciudad,
        telefono,
        email,
        aprobado,
      }

      if (fotoUrl) updateData.foto_url = fotoUrl

      const { error } = await supabase
        .from('motos_venta')
        .update(updateData)
        .eq('id', id)

      if (error) throw error

      return new Response(JSON.stringify({ ok: true, message: 'Updated' }))
    }

    if (action === 'delete') {
      const { id } = body

      const { error } = await supabase
        .from('motos_venta')
        .delete()
        .eq('id', id)

      if (error) throw error

      return new Response(JSON.stringify({ ok: true, message: 'Deleted' }))
    }

    return new Response(JSON.stringify({ ok: false, error: 'Unknown action' }), { status: 400 })
  } catch (error) {
    console.error('Error:', error)
    return new Response(JSON.stringify({ ok: false, error: error.message }), { status: 500 })
  }
})
