import { Router } from 'express';
import {
  listarEventos,
  listarEventosPendientes,
  crearEvento,
  resolverEventoPendiente,
  posponerEvento,
  eliminarEvento,
  limpiarEventosAnteriores
} from '../controllers/eventos.controller.js';
import { verificarToken, requerirRol } from '../middlewares/auth.middleware.js';

const router = Router();

/**
 * @swagger
 * tags:
 *   name: Eventos
 *   description: Gestion y consulta de eventos academicos, culturales y deportivos en el campus ITO
 */

router.get('/', listarEventos);
router.get('/pendientes', verificarToken, requerirRol('MODERADOR', 'ADMIN'), listarEventosPendientes);
router.post('/', verificarToken, crearEvento);
router.delete('/anteriores', verificarToken, requerirRol('MODERADOR', 'ADMIN'), limpiarEventosAnteriores);
router.patch('/:id/estado', verificarToken, requerirRol('MODERADOR', 'ADMIN'), resolverEventoPendiente);
router.patch('/:id/posponer', verificarToken, requerirRol('MODERADOR', 'ADMIN'), posponerEvento);
router.delete('/:id', verificarToken, requerirRol('MODERADOR', 'ADMIN'), eliminarEvento);

export default router;