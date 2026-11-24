import { Router } from 'express';
import {
  registrar,
  login,
  obtenerPerfil,
  actualizarRolUsuario
} from '../controllers/auth.controller.js';
import { verificarToken, requerirRol } from '../middlewares/auth.middleware.js';

const router = Router();

/**
 * @swagger
 * tags:
 *   name: Autenticacion
 *   description: Registro, inicio de sesion y gestion de roles con JWT
 */

/**
 * @swagger
 * /api/auth/registro:
 *   post:
 *     summary: Registrar una cuenta nueva (rol ESTUDIANTE por defecto)
 *     tags: [Autenticacion]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [nombre, correo, password]
 *             properties:
 *               nombre:
 *                 type: string
 *                 example: Manuel Lopez
 *               correo:
 *                 type: string
 *                 example: 20161247@itoaxaca.edu.mx
 *               password:
 *                 type: string
 *                 example: password123
 *     responses:
 *       201:
 *         description: Usuario creado y token JWT emitido
 *       409:
 *         description: El correo ya existe
 */
router.post('/registro', registrar);

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: Iniciar sesion y obtener token JWT
 *     tags: [Autenticacion]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [correo, password]
 *             properties:
 *               correo:
 *                 type: string
 *                 example: admin@itoaxaca.edu.mx
 *               password:
 *                 type: string
 *                 example: admin123
 *     responses:
 *       200:
 *         description: Token JWT y datos del usuario
 *       401:
 *         description: Credenciales invalidas
 */
router.post('/login', login);

/**
 * @swagger
 * /api/auth/perfil:
 *   get:
 *     summary: Obtener los datos del usuario autenticado
 *     tags: [Autenticacion]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Datos extraidos del token JWT
 *       401:
 *         description: Token faltante o invalido
 */
router.get('/perfil', verificarToken, obtenerPerfil);

/**
 * @swagger
 * /api/auth/usuarios/{id}/rol:
 *   patch:
 *     summary: Cambiar el rol de un usuario (solo ADMIN)
 *     tags: [Autenticacion]
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
 *             required: [rol]
 *             properties:
 *               rol:
 *                 type: string
 *                 enum: [ESTUDIANTE, MODERADOR, ADMIN]
 *     responses:
 *       200:
 *         description: Rol actualizado
 *       403:
 *         description: Acceso denegado por falta de rol ADMIN
 */
router.patch('/usuarios/:id/rol', verificarToken, requerirRol('ADMIN'), actualizarRolUsuario);

export default router;