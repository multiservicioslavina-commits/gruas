# Facturación electrónica DIAN

Es un módulo del plan **Premium**. Genera facturas de venta electrónicas
válidas ante la DIAN a partir de una orden de trabajo, usando
[Factus](https://www.factus.com.co/) como proveedor tecnológico autorizado.

---

## Por qué hace falta un proveedor

En Colombia nadie factura electrónicamente "por su cuenta": la DIAN exige
que el documento se firme digitalmente y se transmita a través de un
proveedor tecnológico autorizado. Este software no reemplaza eso — se
conecta a la cuenta de Factus de cada taller, igual que un cajero se
conecta a un datáfono: el taller es dueño de su cuenta y de su información
ante la DIAN, el software sólo la usa.

Por eso, a diferencia de las notificaciones por WhatsApp, aquí **no existe
un modo compartido**: cada taller factura bajo su propio NIT, con su propia
cuenta de Factus.

---

## Lo que necesitas tener antes de empezar

1. **RUT actualizado** con la responsabilidad de facturación electrónica.
2. **Certificado digital** para firmar los documentos (Factus lo gestiona
   por ti si no tienes uno).
3. **Resolución de numeración de la DIAN** — el rango de números que
   puedes usar para tus facturas (ej. de la 1 a la 5000). Factus te guía
   para tramitarla si no la tienes.
4. **Cuenta en Factus** — regístrate en <https://www.factus.com.co/> y
   pide tus credenciales de API (`Client ID`, `Client Secret`, usuario y
   contraseña) en <https://developers.factus.com.co/>.

Factus tiene un ambiente de **pruebas (sandbox)** separado del de
producción: úsalo primero. Los documentos que generes en sandbox no valen
ante la DIAN, así que puedes probar sin miedo a romper nada.

---

## Configurarlo en el software

1. Entra a **Ajustes → Facturación electrónica**.
2. Elige el ambiente (`sandbox` para probar, `production` cuando ya
   confirmaste que todo funciona).
3. Pega tu `Client ID`, `Client Secret`, usuario y contraseña de Factus.
   Guarda.
4. Haz clic en **Elegir rango de numeración**: el software le pregunta a
   Factus qué rangos tienes activos y te deja escoger con cuál facturar.
   Guarda.

Con eso, en cualquier orden de trabajo aparece el botón **Facturar
electrónicamente**.

---

## Cómo se factura una orden

Al hacer clic en **Facturar electrónicamente**, se pide lo que la DIAN
exige y que no vive ya en la ficha del cliente: tipo y número de
documento, si es persona natural o jurídica, el código DANE del
municipio y el método de pago. El resto —repuestos, mano de obra, IVA,
total— se arma solo a partir de la orden.

Al confirmar:

- El software le pide a Factus que **cree y valide** la factura en un
  solo paso.
- Si la DIAN rechaza algo (por ejemplo, un dato mal escrito), Factus
  devuelve el motivo exacto y el software te lo muestra tal cual — no
  se guarda ninguna factura a medias.
- Si todo sale bien, la factura queda guardada en la orden, con el
  número que le asignó Factus y su CUFE (el identificador único del
  documento ante la DIAN). Desde ahí se puede descargar el PDF cuando
  se necesite.

---

## Dónde encontrar el código DANE de un municipio

Es el código de 5 dígitos que identifica a cada municipio de Colombia
(Medellín es `05001`, Bogotá `11001`, Cali `76001`...). Se pide porque la
DIAN lo exige en cada factura. Si no lo tienes a la mano, Factus lo trae
en su propio panel, y también está en el
[Codificador de Divipola del DANE](https://www.dane.gov.co).

---

## Qué no incluye todavía esta primera versión

- **Notas crédito**: para anular o corregir una factura ya validada hace
  falta una nota crédito, que Factus soporta pero este software aún no
  genera. Mientras tanto, esas correcciones se hacen directamente desde
  el panel de Factus.
- **Descuentos de la orden**: si la orden tiene un descuento general, no
  se traslada a la factura electrónica (los ítems se facturan a su
  precio de lista). Es poco común en este tipo de negocio, pero si lo
  necesitas, avísale a quien te dio el software.
- **Envío automático por correo**: la factura queda lista para descargar
  en PDF; enviarla por correo al cliente es un paso manual por ahora.
