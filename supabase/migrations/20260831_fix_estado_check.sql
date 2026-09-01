-- Actualizar el CHECK constraint para permitir el estado 'solicitado'
-- Las solicitudes de nuevos miembros deben poder estar en estado 'solicitado'
-- hasta que el admin las apruebe y pasen a 'pendiente', y luego a 'vinculado'

ALTER TABLE connect_members
DROP CONSTRAINT connect_members_estado_check;

ALTER TABLE connect_members
ADD CONSTRAINT connect_members_estado_check
CHECK (estado IN ('solicitado', 'pendiente', 'vinculado'));
