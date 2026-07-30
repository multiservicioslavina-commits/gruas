<?php
/**
 * WPCode Snippet: Store Product Catalog System
 * Installation: WPCode → Auto Insert → Run Everywhere
 *
 * Features:
 * - CPT registration: producto_almacen
 * - Shortcode [catalogo_almacen] - CSV upload form
 * - Shortcode [productos_almacen id="USER_ID"] - Public catalog
 * - REST API endpoint: /wp-json/ridera/v1/buscar-productos?q=QUERY
 * - CSV import with automatic column mapping and duplicate handling
 */

// Register custom post type
function ridera_register_producto_almacen_cpt() {
    register_post_type( 'producto_almacen', array(
        'label'               => 'Productos Almacén',
        'public'              => true,
        'show_in_menu'        => true,
        'show_in_rest'        => true,
        'supports'            => array( 'title', 'editor', 'custom-fields' ),
        'rewrite'             => array( 'slug' => 'producto' ),
        'rest_base'           => 'productos',
        'capability_type'     => 'post',
        'map_meta_cap'        => true,
    ) );
}
add_action( 'init', 'ridera_register_producto_almacen_cpt' );

// Register REST API endpoint
function ridera_register_search_endpoint() {
    register_rest_route( 'ridera/v1', '/buscar-productos', array(
        'methods'             => 'GET',
        'callback'            => 'ridera_search_products',
        'permission_callback' => '__return_true',
        'args'                => array(
            'q' => array(
                'required'          => true,
                'type'              => 'string',
                'sanitize_callback' => 'sanitize_text_field',
            ),
        ),
    ) );
}
add_action( 'rest_api_init', 'ridera_register_search_endpoint' );

// Search callback
function ridera_search_products( $request ) {
    global $wpdb;
    
    $query = $request->get_param( 'q' );
    $query_escaped = '%' . $wpdb->esc_like( $query ) . '%';
    
    $results = $wpdb->get_results( $wpdb->prepare(
        "SELECT p.ID, p.post_title, pm1.meta_value AS marca, pm2.meta_value AS modelo, pm3.meta_value AS precio, pm4.meta_value AS almacen_nombre
         FROM {$wpdb->posts} p
         LEFT JOIN {$wpdb->postmeta} pm1 ON p.ID = pm1.post_id AND pm1.meta_key = '_producto_marca'
         LEFT JOIN {$wpdb->postmeta} pm2 ON p.ID = pm2.post_id AND pm2.meta_key = '_producto_modelo'
         LEFT JOIN {$wpdb->postmeta} pm3 ON p.ID = pm3.post_id AND pm3.meta_key = '_producto_precio'
         LEFT JOIN {$wpdb->postmeta} pm4 ON p.ID = pm4.post_id AND pm4.meta_key = '_almacen_nombre'
         WHERE p.post_type = 'producto_almacen'
         AND p.post_status = 'publish'
         AND (
             p.post_title LIKE %s
             OR pm1.meta_value LIKE %s
             OR pm2.meta_value LIKE %s
         )
         ORDER BY p.post_date DESC
         LIMIT 50",
        array( $query_escaped, $query_escaped, $query_escaped )
    ) );
    
    $products = array();
    foreach ( $results as $row ) {
        $products[] = array(
            'id'              => intval( $row->ID ),
            'nombre'          => $row->post_title,
            'marca'           => $row->marca,
            'modelo'          => $row->modelo,
            'precio'          => $row->precio,
            'almacen_nombre'  => $row->almacen_nombre,
            'url'             => get_permalink( $row->ID ),
        );
    }
    
    return new WP_REST_Response( $products, 200 );
}

// CSV Upload Shortcode
function ridera_catalogo_almacen_shortcode() {
    if ( ! is_user_logged_in() ) {
        return '<p>Debes iniciar sesión para subir tu catálogo.</p>';
    }
    
    $user_id = get_current_user_id();
    $nonce = wp_create_nonce( 'ridera_upload_catalog_' . $user_id );
    
    ob_start();
    ?>
    <div class="catalogo-upload-form">
        <h2>Sube tu catálogo de productos</h2>
        <p>Carga un archivo CSV con tus motos y accesorios. Formatos soportados: producto/marca/modelo/precio</p>
        
        <form method="post" enctype="multipart/form-data">
            <input type="hidden" name="ridera_upload_catalog_nonce" value="<?php echo esc_attr( $nonce ); ?>">
            
            <div class="form-group">
                <label for="catalog_file">Archivo CSV:</label>
                <input type="file" id="catalog_file" name="catalog_file" accept=".csv" required>
                <small>Máximo 5 MB. Formato: CSV con columnas producto, marca, modelo, precio (u otros nombres comunes)</small>
            </div>
            
            <button type="submit" name="submit_catalog" class="btn-submit">Subir catálogo</button>
        </form>
        
        <?php
        // Handle upload
        if ( $_SERVER['REQUEST_METHOD'] === 'POST' && isset( $_POST['submit_catalog'] ) ) {
            if ( ! isset( $_POST['ridera_upload_catalog_nonce'] ) || 
                 ! wp_verify_nonce( $_POST['ridera_upload_catalog_nonce'], 'ridera_upload_catalog_' . $user_id ) ) {
                echo '<div class="error">Error de seguridad. Intenta de nuevo.</div>';
            } elseif ( ! isset( $_FILES['catalog_file'] ) || empty( $_FILES['catalog_file']['tmp_name'] ) ) {
                echo '<div class="error">Por favor selecciona un archivo.</div>';
            } else {
                $file = $_FILES['catalog_file'];
                $file_size = $file['size'];
                
                if ( $file_size > 5 * 1024 * 1024 ) {
                    echo '<div class="error">El archivo es demasiado grande (máximo 5 MB).</div>';
                } else {
                    $csv_data = file_get_contents( $file['tmp_name'] );
                    $csv_data = trim( $csv_data, " \t\n\r\0\x0B\xEF\xBB\xBF" );
                    
                    $lines = array_filter( array_map( 'str_getcsv', explode( "\n", $csv_data ) ) );
                    
                    if ( count( $lines ) > 0 ) {
                        $headers = array_shift( $lines );
                        $headers = array_map( 'strtolower', $headers );
                        $headers = array_map( function( $h ) {
                            $h = remove_accents( trim( $h ) );
                            return preg_replace( '/[^\w]/', '', $h );
                        }, $headers );
                        
                        // Map common column names
                        $column_map = array(
                            'producto' => 'product', 'nombre' => 'product', 'item' => 'product',
                            'marca' => 'brand', 'brand' => 'brand',
                            'modelo' => 'model', 'compatible' => 'model', 'moto' => 'model',
                            'precio' => 'price', 'price' => 'price', 'valor' => 'price',
                        );
                        
                        $col_indices = array();
                        foreach ( $column_map as $pattern => $mapped ) {
                            $index = array_search( $pattern, $headers );
                            if ( $index !== false ) {
                                $col_indices[ $mapped ] = $index;
                            }
                        }
                        
                        $imported = 0;
                        foreach ( $lines as $row ) {
                            if ( empty( array_filter( $row ) ) ) continue;
                            
                            $product_name = isset( $col_indices['product'] ) ? sanitize_text_field( $row[ $col_indices['product'] ] ) : '';
                            $brand = isset( $col_indices['brand'] ) ? sanitize_text_field( $row[ $col_indices['brand'] ] ) : '';
                            $model = isset( $col_indices['model'] ) ? sanitize_text_field( $row[ $col_indices['model'] ] ) : '';
                            $price = isset( $col_indices['price'] ) ? sanitize_text_field( $row[ $col_indices['price'] ] ) : '';
                            
                            if ( empty( $product_name ) ) continue;
                            
                            // Check for existing product by user + name
                            $existing = new WP_Query( array(
                                'post_type'      => 'producto_almacen',
                                'posts_per_page' => 1,
                                's'              => $product_name,
                                'meta_query'     => array(
                                    array(
                                        'key'   => '_almacen_user_id',
                                        'value' => $user_id,
                                    ),
                                ),
                            ) );
                            
                            if ( $existing->have_posts() ) {
                                $post_id = $existing->posts[0]->ID;
                                wp_update_post( array(
                                    'ID'           => $post_id,
                                    'post_title'   => $product_name,
                                    'post_content' => "Marca: $brand | Modelo: $model | Precio: $price",
                                ) );
                            } else {
                                $post_id = wp_insert_post( array(
                                    'post_type'    => 'producto_almacen',
                                    'post_title'   => $product_name,
                                    'post_content' => "Marca: $brand | Modelo: $model | Precio: $price",
                                    'post_status'  => 'publish',
                                    'post_author'  => $user_id,
                                ) );
                            }
                            
                            if ( $post_id ) {
                                update_post_meta( $post_id, '_almacen_user_id', $user_id );
                                update_post_meta( $post_id, '_producto_marca', $brand );
                                update_post_meta( $post_id, '_producto_modelo', $model );
                                update_post_meta( $post_id, '_producto_precio', $price );
                                update_post_meta( $post_id, '_almacen_nombre', get_user_meta( $user_id, 'almacen_nombre', true ) );
                                $imported++;
                            }
                        }
                        
                        echo '<div class="success">' . $imported . ' productos importados/actualizados correctamente.</div>';
                    }
                }
            }
        }
        ?>
    </div>
    
    <style>
    .catalogo-upload-form {
        max-width: 600px;
        margin: 20px 0;
        padding: 20px;
        background: #f9f9f9;
        border-radius: 8px;
    }
    
    .catalogo-upload-form h2 {
        color: #333;
        margin-top: 0;
    }
    
    .form-group {
        margin-bottom: 20px;
    }
    
    .form-group label {
        display: block;
        font-weight: bold;
        margin-bottom: 5px;
        color: #333;
    }
    
    .form-group input[type="file"] {
        width: 100%;
        padding: 10px;
        border: 2px solid #ddd;
        border-radius: 4px;
    }
    
    .form-group small {
        display: block;
        margin-top: 5px;
        color: #666;
    }
    
    .btn-submit {
        background-color: #c41e3a;
        color: white;
        padding: 10px 20px;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-weight: bold;
        transition: background-color 0.3s;
    }
    
    .btn-submit:hover {
        background-color: #a01830;
    }
    
    .error {
        background-color: #f8d7da;
        color: #721c24;
        padding: 12px;
        border-radius: 4px;
        margin-top: 20px;
    }
    
    .success {
        background-color: #d4edda;
        color: #155724;
        padding: 12px;
        border-radius: 4px;
        margin-top: 20px;
    }
    </style>
    
    <?php
    return ob_get_clean();
}
add_shortcode( 'catalogo_almacen', 'ridera_catalogo_almacen_shortcode' );

// Public Catalog Shortcode
function ridera_productos_almacen_shortcode( $atts ) {
    $atts = shortcode_atts( array(
        'id' => get_current_user_id(),
    ), $atts );
    
    $user_id = intval( $atts['id'] );
    
    $products = new WP_Query( array(
        'post_type'      => 'producto_almacen',
        'posts_per_page' => -1,
        'meta_query'     => array(
            array(
                'key'   => '_almacen_user_id',
                'value' => $user_id,
            ),
        ),
    ) );
    
    ob_start();
    ?>
    <div class="productos-almacen-list">
        <?php
        if ( $products->have_posts() ) {
            $almacen_name = get_user_meta( $user_id, 'almacen_nombre', true ) ?: get_user_by( 'id', $user_id )->display_name;
            echo '<h2>' . esc_html( $almacen_name ) . '</h2>';
            echo '<p>Total de productos: ' . count( $products->posts ) . '</p>';
            
            echo '<table class="productos-table">';
            echo '<thead><tr><th>Producto</th><th>Marca</th><th>Modelo</th><th>Precio</th></tr></thead>';
            echo '<tbody>';
            
            while ( $products->have_posts() ) {
                $products->the_post();
                $marca = get_post_meta( get_the_ID(), '_producto_marca', true );
                $modelo = get_post_meta( get_the_ID(), '_producto_modelo', true );
                $precio = get_post_meta( get_the_ID(), '_producto_precio', true );
                
                echo '<tr>';
                echo '<td>' . esc_html( get_the_title() ) . '</td>';
                echo '<td>' . esc_html( $marca ) . '</td>';
                echo '<td>' . esc_html( $modelo ) . '</td>';
                echo '<td>' . esc_html( $precio ) . '</td>';
                echo '</tr>';
            }
            
            echo '</tbody>';
            echo '</table>';
        } else {
            echo '<p>Este almacén aún no tiene productos.</p>';
        }
        
        wp_reset_postdata();
        ?>
    </div>
    
    <style>
    .productos-almacen-list {
        margin: 20px 0;
    }
    
    .productos-almacen-list h2 {
        color: #c41e3a;
        margin-bottom: 10px;
    }
    
    .productos-almacen-list p {
        color: #666;
        margin-bottom: 20px;
    }
    
    .productos-table {
        width: 100%;
        border-collapse: collapse;
        background: white;
    }
    
    .productos-table thead {
        background-color: #f9f9f9;
        border-bottom: 2px solid #c41e3a;
    }
    
    .productos-table th {
        padding: 12px;
        text-align: left;
        font-weight: bold;
        color: #333;
    }
    
    .productos-table td {
        padding: 12px;
        border-bottom: 1px solid #e0e0e0;
        color: #666;
    }
    
    .productos-table tbody tr:hover {
        background-color: #fafafa;
    }
    </style>
    
    <?php
    return ob_get_clean();
}
add_shortcode( 'productos_almacen', 'ridera_productos_almacen_shortcode' );
