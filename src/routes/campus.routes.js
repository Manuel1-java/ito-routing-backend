import { Router } from 'express';
import {
  sincronizarCampus,
  crearEdificio,
  eliminarEdificio,
  crearLugar,
  cambiarEstadoTramo,
  crearReporteIncidencia,
  listarReportes
} from '../controllers/campus.controller.js';
import { verificarToken, requerirRol } from '../middlewares/auth.middleware.js';

const router = Router();

/**
 * @swagger
 * tags:
 *   name: Campus
 *   description: Sincronizacion geoespacial Offline-First y administracion del campus por roles
 */

/**
 * @swagger
 * /api/campus/sync:
 *   get:
 *     summary: Sincronizar edificios, rutas y lugares del campus (Acceso publico)
 *     tags: [Campus]
 *     parameters:
 *       - in: query
 *         name: version
 *         schema:
 *           type: integer
 *           default: 0
 *         description: Version local almacenada en el dispositivo del usuario
 *     responses:
 *       200:
 *         description: Devuelve actualizado=true si no hay cambios, o el paquete GeoJSON/JSON completo si hay una version nueva
 */
router.get('/sync', sincronizarCampus);

/**
 * @swagger
 * /api/campus/edificios:
 *   post:
 *     summary: Registrar un nuevo edificio en el mapa (Solo ADMIN)
 *     tags: [Campus]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [id, nombre, geometria]
 *             properties:
 *               id:
 *                 type: string
 *                 example: "99"
 *               nombre:
 *                 type: string
 *                 example: "Laboratorio de Computo Movil"
 *               altura:
 *                 type: number
 *                 example: 8
 *               base:
 *                 type: number
 *                 example: 0
 *               piso:
 *                 type: string
 *                 example: "PB"
 *               geometria:
 *                 type: object
 *                 example: { "type": "Polygon", "coordinates": [[[-96.7445, 17.0775], [-96.7444, 17.0775], [-96.7444, 17.0774], [-96.7445, 17.0775]]] }
 *     responses:
 *       201:
 *         description: Edificio creado
 *       403:
 *         description: Rol insuficiente
 */
router.post('/edificios', verificarToken, requerirRol('ADMIN'), crearEdificio);

/**
 * @swagger
 * /api/campus/edificios/{id}:
 *   delete:
 *     summary: Eliminar un edificio por su ID (Solo ADMIN)
 *     tags: [Campus]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Edificio eliminado
 *       403:
 *         description: Rol insuficiente
 */
router.delete('/edificios/:id', verificarToken, requerirRol('ADMIN'), eliminarEdificio);

/**
 * @swagger
 * /api/campus/lugares:
 *   post:
 *     summary: Agregar un nuevo salon, oficina o punto de interes (Solo ADMIN)
 *     tags: [Campus]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [id, nombre, tipo, coordenadas]
 *             properties:
 *               id:
 *                 type: string
 *                 example: "aula-sc1"
 *               nombre:
 *                 type: string
 *                 example: "Aula SC-1"
 *               descripcion:
 *                 type: string
 *                 example: "Edificio de Sistemas, Planta Baja"
 *               tipo:
 *                 type: string
 *                 example: "Salon"
 *               edificio_id:
 *                 type: string
 *                 example: "8"
 *               coordenadas:
 *                 type: array
 *                 items:
 *                   type: number
 *                 example: [-96.7447, 17.0761]
 *               palabras_clave:
 *                 type: array
 *                 items:
 *                   type: string
 *                 example: ["sistemas", "sc1", "aula"]
 *     responses:
 *       201:
 *         description: Lugar creado
 */
router.post('/lugares', verificarToken, requerirRol('ADMIN'), crearLugar);

/**
 * @swagger
 * /api/campus/rutas/{id}/estado:
 *   patch:
 *     summary: Habilitar o deshabilitar un tramo de andador por cierre u obras (MODERADOR o ADMIN)
 *     tags: [Campus]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [habilitado]
 *             properties:
 *               habilitado:
 *                 type: boolean
 *                 example: false
 *     responses:
 *       200:
 *         description: Estado del tramo actualizado y version incrementada
 *       403:
 *         description: Acceso denegado
 */
router.patch('/rutas/:id/estado', verificarToken, requerirRol('MODERADOR', 'ADMIN'), cambiarEstadoTramo);

/**
 * @swagger
 * /api/campus/reportes:
 *   post:
 *     summary: Reportar una incidencia o bloqueo en un andador (Cualquier usuario autenticado)
 *     tags: [Campus]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [tramo_id, motivo]
 *             properties:
 *               tramo_id:
 *                 type: integer
 *                 example: 1
 *               motivo:
 *                 type: string
 *                 example: "Andador cerrado por mantenimiento de luminarias"
 *     responses:
 *       201:
 *         description: Reporte creado
 *   get:
 *     summary: Listar reportes de incidencias (MODERADOR o ADMIN)
 *     tags: [Campus]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de reportes
 */
router.post('/reportes', verificarToken, crearReporteIncidencia);
router.get('/reportes', verificarToken, requerirRol('MODERADOR', 'ADMIN'), listarReportes);

export default router;