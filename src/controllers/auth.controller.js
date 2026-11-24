import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { pool } from '../config/db.js';

const generarToken = (usuario) => {
  return jwt.sign(
    {
      id: usuario.id,
      nombre: usuario.nombre,
      correo: usuario.correo,
      rol: usuario.rol
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
  );
};

export const registrar = async (req, res) => {
  const { nombre, correo, password } = req.body;

  if (!nombre || !correo || !password) {
    return res.status(400).json({
      error: 'Los campos nombre, correo y password sin obligatorios.'
    });
  }

  if (password.length < 6) {
    return res.status(400).json({
      error: 'La contrasena debe tener al menos 6 caracteres.'
    });
  }

  try {
    const existe = await pool.query('SELECT id FROM usuarios WHERE correo = $1', [
      correo.toLowerCase().trim()
    ]);

    if (existe.rows.length > 0) {
      return res.status(409).json({
        error: 'El correo ya se encuentra registrado.'
      });
    }

    const rolRes = await pool.query("SELECT id FROM roles WHERE nombre = 'ESTUDIANTE'");
    const rolId = rolRes.rows[0].id;

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const nuevoUsuario = await pool.query(
      `INSERT INTO usuarios (nombre, correo, password_hash, rol_id)
       VALUES ($1, $2, $3, $4)
       RETURNING id, nombre, correo`,
      [nombre.trim(), correo.toLowerCase().trim(), passwordHash, rolId]
    );

    const usuario = {
      ...nuevoUsuario.rows[0],
      rol: 'ESTUDIANTE'
    };

    const token = generarToken(usuario);

    return res.status(201).json({
      mensaje: 'Usuario registrado correctamente.',
      token,
      usuario
    });
  } catch (error) {
    return res.status(500).json({
      error: 'Error al registrar usuario.',
      detalle: error.message
    });
  }
};

export const login = async (req, res) => {
  const { correo, password } = req.body;

  if (!correo || !password) {
    return res.status(400).json({
      error: 'Debes proporcionar correo y password.'
    });
  }

  try {
    const resultado = await pool.query(
      `SELECT u.id, u.nombre, u.correo, u.password_hash, u.activo, r.nombre AS rol
       FROM usuarios u
       JOIN roles r ON u.rol_id = r.id
       WHERE u.correo = $1`,
      [correo.toLowerCase().trim()]
    );

    if (resultado.rows.length === 0) {
      return res.status(401).json({ error: 'Credenciales invalidas.' });
    }

    const userDB = resultado.rows[0];

    if (!userDB.activo) {
      return res.status(403).json({ error: 'Esta cuenta se encuentra deshabilitada.' });
    }

    const passwordValido = await bcrypt.compare(password, userDB.password_hash);

    if (!passwordValido) {
      return res.status(401).json({ error: 'Credenciales invalidas.' });
    }

    const usuario = {
      id: userDB.id,
      nombre: userDB.nombre,
      correo: userDB.correo,
      rol: userDB.rol
    };

    const token = generarToken(usuario);

    return res.json({
      mensaje: 'Inicio de sesion exitoso.',
      token,
      usuario
    });
  } catch (error) {
    return res.status(500).json({
      error: 'Error al iniciar sesion.',
      detalle: error.message
    });
  }
};

export const obtenerPerfil = (req, res) => {
  res.json({
    usuario: req.usuario
  });
};

export const actualizarRolUsuario = async (req, res) => {
  const { id } = req.params;
  const { rol } = req.body;
  const rolesValidos = ['ESTUDIANTE', 'MODERADOR', 'ADMIN'];

  if (!rol || !rolesValidos.includes(rol.toUpperCase())) {
    return res.status(400).json({
      error: `Rol invalido. Opciones permitidas: ${rolesValidos.join(', ')}`
    });
  }

  try {
    const rolRes = await pool.query('SELECT id FROM roles WHERE nombre = $1', [
      rol.toUpperCase()
    ]);

    const actualizado = await pool.query(
      `UPDATE usuarios
       SET rol_id = $1
       WHERE id = $2
       RETURNING id, nombre, correo`,
      [rolRes.rows[0].id, id]
    );

    if (actualizado.rows.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado.' });
    }

    return res.json({
      mensaje: 'Rol actualizado correctamente.',
      usuario: {
        ...actualizado.rows[0],
        rol: rol.toUpperCase()
      }
    });
  } catch (error) {
    return res.status(500).json({
      error: 'Error al actualizar el rol.',
      detalle: error.message
    });
  }
};