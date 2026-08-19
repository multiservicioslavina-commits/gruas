import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const sb = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const [{ count: activas }, solData] = await Promise.all([
      sb.from('grueros')
        .select('*', { count: 'exact', head: true })
        .eq('disponible', true)
        .eq('aprobado', 'SI'),
      sb.from('solicitudes')
        .select('created_at, asignada_at')
        .not('asignada_at', 'is', null)
        .order('created_at', { ascending: false })
        .limit(200),
    ]);

    let avgMin: number | null = null;
    const rows = (solData.data ?? []).filter(
      (r: any) => r.created_at && r.asignada_at,
    );
    if (rows.length > 0) {
      const total = rows.reduce((sum: number, r: any) => {
        const diff =
          (new Date(r.asignada_at).getTime() -
            new Date(r.created_at).getTime()) /
          60000;
        return sum + diff;
      }, 0);
      avgMin = Math.round(total / rows.length);
    }

    return new Response(
      JSON.stringify({
        ok: true,
        activas: activas ?? 0,
        avg_min: avgMin,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ ok: false, error: String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
