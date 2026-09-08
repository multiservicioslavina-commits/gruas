// Errores de API con código HTTP. Cualquier otro error se reporta como 500.
export class ApiError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export const badRequest  = (msg, details) => new ApiError(400, msg, details);
export const unauthorized = (msg = 'No autenticado') => new ApiError(401, msg);
export const forbidden   = (msg = 'No tienes permiso para esta acción') => new ApiError(403, msg);
export const notFound    = (msg = 'No encontrado') => new ApiError(404, msg);
export const conflict    = (msg, details) => new ApiError(409, msg, details);

// Envuelve un handler async para que los rechazos lleguen al middleware de error.
export const wrap = (handler) => (req, res, next) =>
  Promise.resolve(handler(req, res, next)).catch(next);
