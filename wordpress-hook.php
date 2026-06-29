<?php
/**
 * Hook WordPress: al aprobar (publish) un gruero, envía datos a Google Sheets con aprobado=SI
 * Pegar en functions.php del tema hijo o en un plugin personalizado.
 */
add_action('transition_post_status', function($nuevo, $anterior, $post) {
    if ($post->post_type !== 'gruas') return;
    if ($nuevo !== 'publish' || $anterior === 'publish') return;

    $meta = get_post_meta($post->ID);
    $data = [
        'tipo'     => 'Grúa',
        'nombre'   => $post->post_title,
        'aprobado' => 'SI',
    ];
    foreach ($meta as $key => $val) {
        if (strpos($key, '_') === 0) continue; // Saltar meta internos de WordPress
        $data[$key] = $val[0];
    }

    // Enviar a Google Sheets
    wp_remote_post(
        'https://script.google.com/macros/s/AKfycbxBo_t8mz7yv56ORULMHz5HWf7zxZHVPsGYcLGgjrtmzH52EpxdxOkc1BhP-q99uxb4/exec',
        [
            'body'    => json_encode($data),
            'headers' => ['Content-Type' => 'application/json'],
            'timeout' => 15,
        ]
    );

    // Sincronizar aprobación en Supabase
    $supabase_url = 'https://vzzxsdtsaahhzyctvmhx.supabase.co/rest/v1/grueros';
    $supabase_key = defined('SUPABASE_SERVICE_KEY') ? SUPABASE_SERVICE_KEY : '';

    if ($supabase_key) {
        wp_remote_request(
            $supabase_url . '?nombre=eq.' . urlencode($post->post_title),
            [
                'method'  => 'PATCH',
                'body'    => json_encode(['aprobado' => 'SI']),
                'headers' => [
                    'Content-Type'  => 'application/json',
                    'apikey'        => $supabase_key,
                    'Authorization' => 'Bearer ' . $supabase_key,
                    'Prefer'        => 'return=minimal',
                ],
                'timeout' => 15,
            ]
        );
    }
}, 10, 3);
