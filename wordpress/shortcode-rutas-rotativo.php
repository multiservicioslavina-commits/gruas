<?php
/**
 * Shortcode [rutas_rotativas_premium]
 * Genera el HTML de rutas con rotación diaria
 */

add_shortcode( 'rutas_rotativas_premium', 'render_rutas_rotativas_premium' );

function render_rutas_rotativas_premium() {
    // Obtener todas las rutas
    $all_posts = get_posts( array(
        'post_type'      => 'rutas',
        'posts_per_page' => -1,
        'orderby'        => 'date',
        'order'          => 'DESC',
    ) );

    if ( empty( $all_posts ) ) {
        return '<p style="color:#888;text-align:center;">No hay rutas disponibles</p>';
    }

    // Calcular índice de rotación
    $hoy = date( 'Y-m-d' );
    $ultima_rotacion = get_option( 'ridera_rutas_premium_rotation_date' );

    if ( $ultima_rotacion !== $hoy ) {
        $indice = (int) get_option( 'ridera_rutas_premium_rotation_index', 0 );
        $indice = ( $indice + 3 ) % count( $all_posts );
        update_option( 'ridera_rutas_premium_rotation_index', $indice );
        update_option( 'ridera_rutas_premium_rotation_date', $hoy );
    } else {
        $indice = (int) get_option( 'ridera_rutas_premium_rotation_index', 0 );
    }

    // Seleccionar 3 rutas para hoy
    $rutas_hoy = array(
        $all_posts[ $indice % count( $all_posts ) ],
        $all_posts[ ( $indice + 1 ) % count( $all_posts ) ],
        $all_posts[ ( $indice + 2 ) % count( $all_posts ) ],
    );

    // CSS (una sola vez)
    static $css_loaded = false;
    $html = '';

    if ( ! $css_loaded ) {
        $css_loaded = true;
        $html .= '
        <style>
        @import url("https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Barlow+Condensed:wght@500;600;700&family=DM+Sans:wght@400;500&family=JetBrains+Mono:wght@500;600&display=swap");

        :root{
          --orange:#E8520A; --orange2:#FF6A1A; --orange-dim:rgba(232,82,10,.08); --orange-glow:rgba(232,82,10,.18);
          --gold:#B8956A; --gold-light:#D4AF82; --green:#3DDB74;
          --carbon:#0C0D0F; --carbon2:#141618; --carbon3:#1C1F23; --carbon4:#242830;
          --white:#F5F4F0;
          --muted:rgba(245,244,240,.78); --dim:rgba(245,244,240,.60);
          --border:rgba(245,244,240,.08); --border-hi:rgba(245,244,240,.16); --border-orange:rgba(232,82,10,.28);
          --r-sm:8px; --r-md:12px; --r-lg:18px; --r-xl:22px;
        }
        .rutas-section{padding:72px 4%;background:var(--carbon);border-top:.5px solid var(--border)}
        .rutas-inner{max-width:1200px;margin:0 auto}
        .rutas-head{display:flex;justify-content:space-between;align-items:flex-end;gap:20px;flex-wrap:wrap;margin-bottom:32px}
        .rutas-note{max-width:280px;font-size:13px;color:var(--muted);line-height:1.65;text-align:right}
        .rutas-note b{color:var(--white);font-weight:600}
        .sec-eyebrow{display:inline-flex;align-items:center;gap:9px;font-family:"JetBrains Mono",monospace;font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:var(--orange2);margin-bottom:14px}
        .sec-eyebrow::before{content:"";width:18px;height:1.5px;background:var(--orange)}
        .sec-title{font-family:"Bebas Neue",sans-serif;font-size:clamp(30px,4.5vw,52px);line-height:.95;letter-spacing:.5px}
        .sec-title em{font-style:normal;color:var(--orange)}
        .rutas-layout{display:grid;grid-template-columns:1fr 1.4fr;gap:20px;align-items:start}
        .rutas-portal{position:relative;border-radius:var(--r-xl);overflow:hidden;min-height:340px;display:flex;flex-direction:column;justify-content:flex-end;text-decoration:none;color:inherit;background-size:cover;background-position:center;border:.5px solid var(--border);isolation:isolate;transition:transform .4s cubic-bezier(.2,.7,.25,1),border-color .3s,background-size .6s}
        .rutas-portal:hover{border-color:var(--border-orange);background-size:110%;transform:translateY(-3px)}
        .rutas-portal::before{content:"";position:absolute;inset:0;z-index:-1;background:linear-gradient(180deg,rgba(12,13,15,.3) 0%,rgba(12,13,15,.55) 40%,rgba(12,13,15,.95) 100%)}
        .rutas-portal::after{content:"";position:absolute;left:0;right:0;bottom:0;height:2px;background:linear-gradient(90deg,transparent,var(--orange),var(--orange2),transparent);transform:scaleX(.3);opacity:.7;transition:transform .5s,opacity .4s;transform-origin:center}
        .rutas-portal:hover::after{transform:scaleX(1);opacity:1}
        .portal-top{position:absolute;top:14px;left:14px;right:14px;display:flex;align-items:center;gap:6px;flex-wrap:wrap;z-index:2}
        .portal-live{display:inline-flex;align-items:center;gap:6px;font-family:"JetBrains Mono",monospace;font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--white);background:rgba(12,13,15,.7);backdrop-filter:blur(6px);border:.5px solid var(--border-hi);padding:5px 10px;border-radius:99px}
        .portal-live i{width:5px;height:5px;border-radius:50%;background:var(--orange);box-shadow:0 0 0 3px var(--orange-glow);animation:rPulse 2s infinite}
        @keyframes rPulse{0%,100%{opacity:1}50%{opacity:.4}}
        .portal-count{font-family:"JetBrains Mono",monospace;font-size:10px;color:var(--white);background:rgba(12,13,15,.7);backdrop-filter:blur(6px);border:.5px solid var(--border-hi);padding:5px 10px;border-radius:99px}
        .portal-count b{color:var(--orange2)}
        .portal-info{padding:20px 20px 22px;position:relative;z-index:1}
        .portal-eyebrow{font-family:"JetBrains Mono",monospace;font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:var(--orange2);margin-bottom:6px}
        .portal-title{font-family:"Bebas Neue",sans-serif;font-size:clamp(26px,3vw,36px);line-height:.95;letter-spacing:.5px;margin-bottom:8px}
        .portal-desc{font-size:12.5px;color:var(--muted);line-height:1.6;max-width:36ch;margin-bottom:16px}
        .portal-cta{display:inline-flex;align-items:center;gap:8px;background:var(--orange);color:#0C0D0F;font-family:"Barlow Condensed",sans-serif;font-weight:700;font-size:15px;padding:11px 20px;border-radius:10px;transition:gap .25s,filter .2s}
        .rutas-portal:hover .portal-cta{gap:12px;filter:brightness(1.08)}
        .rutas-list{display:flex;flex-direction:column;gap:10px}
        .ruta-card{position:relative;overflow:hidden;display:block;text-decoration:none;color:inherit;background:var(--carbon3);border:.5px solid var(--border);border-radius:var(--r-md);cursor:pointer;transition:background .22s,border-color .22s,transform .22s}
        .ruta-card::before{content:"";position:absolute;left:0;top:0;bottom:0;width:3px;background:var(--orange);transform:scaleY(0);transform-origin:top;transition:transform .22s}
        .ruta-card:hover{border-color:var(--border-orange);background:var(--carbon4);transform:translateX(3px)}
        .ruta-card:hover::before{transform:scaleY(1)}
        .ruta-card-inner{display:grid;grid-template-columns:110px 1fr}
        .ruta-thumb{position:relative;background-size:cover;background-position:center;border-radius:var(--r-md) 0 0 var(--r-md);overflow:hidden;min-height:110px}
        .ruta-thumb::after{content:"";position:absolute;inset:0;background:linear-gradient(90deg,rgba(12,13,15,0) 50%,rgba(12,13,15,.5) 100%)}
        .ruta-body{padding:14px 16px;position:relative}
        .ruta-idx{position:absolute;top:6px;right:12px;font-family:"Bebas Neue",sans-serif;font-size:36px;line-height:1;color:rgba(245,244,240,.04);user-select:none;transition:color .22s}
        .ruta-card:hover .ruta-idx{color:rgba(232,82,10,.1)}
        .ruta-header{display:flex;justify-content:space-between;align-items:flex-start;gap:8px;margin-bottom:10px}
        .ruta-name{font-family:"Bebas Neue",sans-serif;font-size:18px;letter-spacing:.4px;text-transform:uppercase;line-height:1.05;word-break:break-word;flex:1}
        .ruta-diff{font-family:"JetBrains Mono",monospace;font-size:9.5px;letter-spacing:.06em;text-transform:uppercase;padding:3px 9px;border-radius:99px;flex:none;font-weight:600;margin-top:2px}
        .diff-media{background:rgba(232,82,10,.12);color:var(--orange2);border:.5px solid var(--border-orange)}
        .diff-alta{background:rgba(220,38,38,.12);color:#fca5a5;border:.5px solid rgba(220,38,38,.25)}
        .diff-baja{background:rgba(61,219,116,.1);color:var(--green);border:.5px solid rgba(61,219,116,.25)}
        .ruta-meta{display:flex;gap:0;border:.5px solid var(--border);border-radius:8px;overflow:hidden;margin-bottom:10px}
        .ruta-meta-item{flex:1;padding:7px 10px;border-right:.5px solid var(--border);display:flex;flex-direction:column;gap:3px}
        .ruta-meta-item:last-child{border-right:0}
        .ruta-meta-item b{font-family:"JetBrains Mono",monospace;font-size:12.5px;color:var(--white);font-weight:600;line-height:1}
        .ruta-meta-item b sup{font-size:8px;color:var(--dim);font-weight:500}
        .ruta-meta-item span{font-family:"JetBrains Mono",monospace;font-size:9px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);line-height:1}
        .ruta-tags{display:flex;gap:5px;flex-wrap:wrap}
        .ruta-tag{font-size:10.5px;color:var(--muted);border:.5px solid var(--border-hi);padding:2px 9px;border-radius:99px;transition:border-color .22s,color .22s}
        .ruta-card:hover .ruta-tag{border-color:rgba(245,244,240,.28);color:var(--white)}
        .rutas-approx{font-family:"JetBrains Mono",monospace;font-size:10.5px;color:var(--muted);letter-spacing:.02em;margin-top:4px;line-height:1.5}
        .rutas-approx sup{color:var(--orange2)}
        .rutas-foot{margin-top:4px}
        .btn-rutas{display:inline-flex;align-items:center;gap:10px;background:transparent;color:var(--gold-light);border:.5px solid rgba(184,149,106,.45);font-family:"Barlow Condensed",sans-serif;font-weight:600;font-size:15px;letter-spacing:.02em;padding:12px 22px;border-radius:10px;text-decoration:none;transition:gap .25s,border-color .25s,background .25s}
        .btn-rutas:hover{gap:14px;border-color:var(--gold-light);background:rgba(184,149,106,.08)}
        @media(max-width:900px){.rutas-layout{grid-template-columns:1fr;gap:16px}.rutas-portal{min-height:280px}.rutas-note{text-align:left;max-width:100%}}
        @media(max-width:560px){.rutas-section{padding:48px 4%}.rutas-head{gap:12px;margin-bottom:24px}.rutas-note{display:none}.rutas-portal{min-height:240px;border-radius:14px}.portal-top{top:10px;left:10px;right:10px;gap:5px}.portal-live,.portal-count{font-size:9px;padding:4px 9px}.portal-info{padding:14px 14px 16px}.portal-title{font-size:22px;margin-bottom:6px}.portal-desc{font-size:11.5px;margin-bottom:12px}.portal-cta{font-size:14px;padding:10px 16px;width:100%;justify-content:center}.ruta-card-inner{grid-template-columns:90px 1fr}.ruta-thumb{min-height:96px}.ruta-body{padding:10px 12px}.ruta-name{font-size:15px}.ruta-diff{font-size:9px;padding:2px 8px}.ruta-meta-item{padding:6px 8px}.ruta-meta-item b{font-size:11.5px}.ruta-meta-item span{font-size:8.5px}.ruta-tag{font-size:10px;padding:2px 7px}.rutas-approx{font-size:10px}.btn-rutas{width:100%;justify-content:center;font-size:14px}}
        </style>
        ';
    }

    // HTML
    $html .= '<section class="rutas-section">
      <div class="rutas-inner">
        <div class="rutas-head">
          <div>
            <div class="sec-eyebrow">Mototurismo · Antioquia</div>
            <h2 class="sec-title">Las rutas del <em>gremio</em></h2>
          </div>
          <p class="rutas-note">Rutas recorridas y verificadas en moto. <b>Datos reales</b> de distancia, tiempo y altura, no estimaciones de mapa.</p>
        </div>

        <div class="rutas-layout">
          <a href="https://ridera.com.co/ridera-rutas/" class="rutas-portal" style="background-image:url(\'https://ridera.com.co/wp-content/uploads/2026/06/ambitious-studio-rick-barrett-0IufleV_Uvw-unsplash-scaled.jpg\')">
            <div class="portal-top">
              <span class="portal-live"><i></i>Mapa interactivo</span>
              <span class="portal-count"><b>' . count( $all_posts ) . '</b> rutas · <b>125</b> municipios</span>
            </div>
            <div class="portal-info">
              <div class="portal-eyebrow">Explora el mapa</div>
              <div class="portal-title">Toda Antioquia,<br>ruta por ruta</div>
              <p class="portal-desc">Mapa con GPS, dificultad, puntos de interés y fotos de la comunidad.</p>
              <span class="portal-cta">Abrir mapa de rutas →</span>
            </div>
          </a>

          <div class="rutas-list">';

    // Renderizar las 3 rutas rotadas
    foreach ( $rutas_hoy as $idx => $post ) {
        $img = get_the_post_thumbnail_url( $post->ID, 'large' ) ?: 'https://ridera.com.co/wp-content/uploads/2026/06/ambitious-studio-rick-barrett-0IufleV_Uvw-unsplash-scaled.jpg';
        $distance = get_post_meta( $post->ID, 'distance', true ) ?: get_field( 'distance', $post->ID ) ?: '---';
        $time = get_post_meta( $post->ID, 'time', true ) ?: get_field( 'time', $post->ID ) ?: '---';
        $altitude = get_post_meta( $post->ID, 'altitude', true ) ?: get_field( 'altitude', $post->ID ) ?: '---';
        $difficulty = get_post_meta( $post->ID, 'difficulty', true ) ?: get_field( 'difficulty', $post->ID ) ?: 'Media';

        $tags = array();
        $post_tags = get_the_tags( $post->ID );
        if ( $post_tags ) {
            foreach ( $post_tags as $tag ) {
                $tags[] = $tag->name;
            }
        }

        $diff_class = $difficulty === 'Alta' ? 'diff-alta' : ( $difficulty === 'Baja' ? 'diff-baja' : 'diff-media' );
        $tags_html = implode( '', array_map( function( $tag ) {
            return '<span class="ruta-tag">' . esc_html( $tag ) . '</span>';
        }, $tags ) );

        $html .= '
            <a href="' . esc_url( get_permalink( $post->ID ) ) . '" class="ruta-card">
              <div class="ruta-card-inner">
                <div class="ruta-thumb" style="background-image:url(\'' . esc_url( $img ) . '\')"></div>
                <div class="ruta-body">
                  <div class="ruta-idx">' . str_pad( $idx + 1, 2, '0', STR_PAD_LEFT ) . '</div>
                  <div class="ruta-header">
                    <div class="ruta-name">' . esc_html( $post->post_title ) . '</div>
                    <div class="ruta-diff ' . $diff_class . '">' . esc_html( $difficulty ) . '</div>
                  </div>
                  <div class="ruta-meta">
                    <div class="ruta-meta-item"><b>' . esc_html( $distance ) . ' km<sup>~</sup></b><span>Distancia</span></div>
                    <div class="ruta-meta-item"><b>' . esc_html( $time ) . ' h<sup>~</sup></b><span>Tiempo</span></div>
                    <div class="ruta-meta-item"><b>' . esc_html( $altitude ) . ' m<sup>~</sup></b><span>Altitud</span></div>
                  </div>
                  <div class="ruta-tags">' . $tags_html . '</div>
                </div>
              </div>
            </a>
        ';
    }

    $html .= '
            <div class="rutas-approx"><sup>~</sup> Datos aproximados ida y vuelta. Detalles exactos en cada ruta.</div>
            <div class="rutas-foot">
              <a href="https://ridera.com.co/ridera-rutas/" class="btn-rutas">Ver todas las rutas →</a>
            </div>
          </div>
        </div>
      </div>
    </section>';

    return $html;
}
?>
