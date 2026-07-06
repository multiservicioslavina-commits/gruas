// DEBE importarse ANTES que puppeteer (los import de ESM se ejecutan en
// orden): Puppeteer lee PUPPETEER_EXECUTABLE_PATH del entorno al cargar
// su módulo y la cachea. Una variable vieja en Railway apuntando al
// chromium de Debian (v146, incompatible con Puppeteer 22) haría crashear
// el launch aunque la imagen traiga el Chrome for Testing correcto.
if (process.env.PUPPETEER_EXECUTABLE_PATH) {
  console.warn(
    `Ignorando PUPPETEER_EXECUTABLE_PATH=${process.env.PUPPETEER_EXECUTABLE_PATH} — se usa el Chrome emparejado de Puppeteer`
  );
  delete process.env.PUPPETEER_EXECUTABLE_PATH;
}
