import { pool } from '../config/db.js';

export const asegurarTablaEventos = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS eventos_campus (
      id SERIAL PRIMARY KEY,
      titulo VARCHAR(150) NOT NULL,
      descripcion TEXT,
      organizador VARCHAR(120),
      edificio_id VARCHAR(50) NOT NULL,
      salon_id VARCHAR(80),
      salon_nombre VARCHAR(120),
      piso VARCHAR(10) DEFAULT 'PB',
      espacio_detalle VARCHAR(150),
      fecha_inicio TIMESTAMPTZ NOT NULL,
      fecha_fin TIMESTAMPTZ NOT NULL,
      imagen_webp TEXT,
      estado VARCHAR(20) NOT NULL DEFAULT 'pendiente',
      pospuesto BOOLEAN NOT NULL DEFAULT FALSE,
      creado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
      creado_en TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_eventos_campus_estado_fechas
      ON eventos_campus (estado, fecha_inicio, fecha_fin);
  `);
};

const limpiarExpirados = async () => {
  await pool.query(`
    DELETE FROM eventos_campus
    WHERE fecha_fin < NOW() - INTERVAL '24 hours'
       OR (estado = 'rechazado' AND creado_en < NOW() - INTERVAL '24 hours')
  `);
};

export const listarEventos = async (_req, res) => {
  try {
    await limpiarExpirados();

    const { rows } = await pool.query(`
      SELECT
        e.id,
        e.titulo,
        e.descripcion,
        e.organizador,
        e.edificio_id,
        e.salon_id,
        e.salon_nombre,
        e.piso,
        e.espacio_detalle,
        e.fecha_inicio,
        e.fecha_fin,
        e.imagen_webp,
        e.pospuesto,
        e.creado_en,
        u.nombre AS autor_nombre,
        (e.fecha_fin < NOW()) AS es_anterior
      FROM eventos_campus e
      LEFT JOIN usuarios u ON u.id = e.creado_por
      WHERE e.estado = 'aprobado'
        AND e.fecha_fin >= NOW() - INTERVAL '24 hours'
      ORDER BY
        CASE WHEN e.fecha_fin >= NOW() THEN 0 ELSE 1 END,
        CASE WHEN e.fecha_fin >= NOW() THEN e.fecha_inicio END ASC,
        CASE WHEN e.fecha_fin < NOW() THEN e.fecha_fin END DESC
    `);

    const disponibles = [];
    const anteriores = [];

    for (const row of rows) {
      const { es_anterior, ...evento } = row;
      if (es_anterior) {
        anteriores.push(evento);
      } else {
        disponibles.push(evento);
      }
    }

    res.json({ disponibles, anteriores });
  } catch (error) {
    console.error('Error al listar eventos:', error);
    res.status(500).json({ error: 'No se pudieron obtener los eventos del campus.' });
  }
};

export const listarEventosPendientes = async (_req, res) => {
  try {
    await limpiarExpirados();

    const { rows } = await pool.query(`
      SELECT
        e.id,
        e.titulo,
        e.descripcion,
        e.organizador,
        e.edificio_id,
        e.salon_id,
        e.salon_nombre,
        e.piso,
        e.espacio_detalle,
        e.fecha_inicio,
        e.fecha_fin,
        e.imagen_webp,
        e.creado_en,
        u.nombre AS autor_nombre,
        u.correo AS autor_correo
      FROM eventos_campus e
      LEFT JOIN usuarios u ON u.id = e.creado_por
      WHERE e.estado = 'pendiente'
        AND e.fecha_fin >= NOW()
      ORDER BY e.creado_en ASC
    `);

    res.json({ pendientes: rows });
  } catch (error) {
    console.error('Error al listar eventos pendientes:', error);
    res.status(500).json({ error: 'No se pudieron cargar las propuestas pendientes.' });
  }
};

export const crearEvento = async (req, res) => {
  try {
    const {
      titulo,
      descripcion,
      organizador,
      edificio_id,
      salon_id,
      salon_nombre,
      piso,
      espacio_detalle,
      fecha_inicio,
      fecha_fin,
      imagen_webp
    } = req.body;

    if (!titulo || !String(titulo).trim()) {
      return res.status(400).json({ error: 'El nombre del evento es obligatorio.' });
    }
    if (!edificio_id || !String(edificio_id).trim()) {
      return res.status(400).json({ error: 'Debes seleccionar el edificio donde se realizará.' });
    }
    if (!fecha_inicio || !fecha_fin) {
      return res.status(400).json({ error: 'Debes indicar fecha y horario de inicio y fin.' });
    }

    const inicioDate = new Date(fecha_inicio);
    const finDate = new Date(fecha_fin);

    if (Number.isNaN(inicioDate.getTime()) || Number.isNaN(finDate.getTime())) {
      return res.status(400).json({ error: 'Formato de fecha u horario inválido.' });
    }
    if (finDate <= inicioDate) {
      return res.status(400).json({ error: 'La hora o fecha de cierre debe ser posterior a la de inicio.' });
    }
    if (finDate <= new Date()) {
      return res.status(400).json({ error: 'El evento no puede terminar en una fecha pasada.' });
    }

    let imagenLimpia = null;
    if (imagen_webp) {
      const imgStr = String(imagen_webp);
      if (!imgStr.startsWith('data:image/')) {
        return res.status(400).json({ error: 'Formato de imagen no válido.' });
      }
      if (imgStr.length > 1_800_000) {
        return res.status(400).json({ error: 'La imagen es demasiado pesada.' });
      }
      imagenLimpia = imgStr;
    }

    const rol = req.usuario?.rol || 'ESTUDIANTE';
    const esStaff = rol === 'ADMIN' || rol === 'MODERADOR';
    const estadoInicial = esStaff ? 'aprobado' : 'pendiente';
    const usuarioId = req.usuario?.id ?? req.usuario?.usuarioId ?? null;

    const { rows } = await pool.query(
      `
      INSERT INTO eventos_campus (
        titulo,
        descripcion,
        organizador,
        edificio_id,
        salon_id,
        salon_nombre,
        piso,
        espacio_detalle,
        fecha_inicio,
        fecha_fin,
        imagen_webp,
        estado,
        creado_por
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *
      `,
      [
        String(titulo).trim().slice(0, 150),
        descripcion ? String(descripcion).trim().slice(0, 600) : null,
        organizador ? String(organizador).trim().slice(0, 120) : null,
        String(edificio_id).trim(),
        salon_id ? String(salon_id).trim() : null,
        salon_nombre ? String(salon_nombre).trim().slice(0, 120) : null,
        piso ? String(piso).trim().toUpperCase().slice(0, 10) : 'PB',
        espacio_detalle ? String(espacio_detalle).trim().slice(0, 150) : null,
        inicioDate.toISOString(),
        finDate.toISOString(),
        imagenLimpia,
        estadoInicial,
        usuarioId
      ]
    );

    res.status(201).json({
      mensaje: esStaff
        ? 'Evento publicado en el mapa del campus.'
        : 'Propuesta enviada. Un moderador la revisará antes de publicarla.',
      evento: rows[0]
    });
  } catch (error) {
    console.error('Error al crear evento:', error);
    res.status(500).json({ error: 'Error interno al registrar el evento.' });
  }
};

export const resolverEventoPendiente = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { estado } = req.body;

    if (!Number.isInteger(id)) {
      return res.status(400).json({ error: 'ID de evento inválido.' });
    }
    if (!['aprobado', 'rechazado'].includes(estado)) {
      return res.status(400).json({ error: 'Estado inválido. Usa aprobado o rechazado.' });
    }

    if (estado === 'rechazado') {
      const del = await pool.query('DELETE FROM eventos_campus WHERE id = $1 RETURNING id', [id]);
      if (!del.rowCount) {
        return res.status(404).json({ error: 'Evento no encontrado.' });
      }
      return res.json({ mensaje: 'Propuesta rechazada y descartada.' });
    }

    const { rows } = await pool.query(
      `
      UPDATE eventos_campus
      SET estado = 'aprobado'
      WHERE id = $1
      RETURNING *
      `,
      [id]
    );

    if (!rows.length) {
      return res.status(404).json({ error: 'Evento no encontrado.' });
    }

    res.json({
      mensaje: 'Evento aprobado y publicado.',
      evento: rows[0]
    });
  } catch (error) {
    console.error('Error al moderar evento:', error);
    res.status(500).json({ error: 'No se pudo actualizar el estado del evento.' });
  }
};

export const posponerEvento = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { fecha_inicio, fecha_fin } = req.body;

    if (!Number.isInteger(id)) {
      return res.status(400).json({ error: 'ID de evento inválido.' });
    }
    if (!fecha_inicio || !fecha_fin) {
      return res.status(400).json({ error: 'Debes indicar la nueva fecha y horario.' });
    }

    const inicioDate = new Date(fecha_inicio);
    const finDate = new Date(fecha_fin);

    if (Number.isNaN(inicioDate.getTime()) || Number.isNaN(finDate.getTime())) {
      return res.status(400).json({ error: 'Formato de fecha inválido.' });
    }
    if (finDate <= inicioDate) {
      return res.status(400).json({ error: 'La hora de cierre debe ser posterior a la de inicio.' });
    }
    if (finDate <= new Date()) {
      return res.status(400).json({ error: 'La nueva fecha debe ser futura.' });
    }

    const { rows } = await pool.query(
      `
      UPDATE eventos_campus
      SET fecha_inicio = $1,
          fecha_fin = $2,
          pospuesto = TRUE,
          estado = 'aprobado'
      WHERE id = $3
      RETURNING *
      `,
      [inicioDate.toISOString(), finDate.toISOString(), id]
    );

    if (!rows.length) {
      return res.status(404).json({ error: 'Evento no encontrado.' });
    }

    res.json({
      mensaje: 'Evento reprogramado correctamente.',
      evento: rows[0]
    });
  } catch (error) {
    console.error('Error al posponer evento:', error);
    res.status(500).json({ error: 'No se pudo posponer el evento.' });
  }
};

export const eliminarEvento = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ error: 'ID de evento inválido.' });
    }

    const { rowCount } = await pool.query('DELETE FROM eventos_campus WHERE id = $1', [id]);
    if (!rowCount) {
      return res.status(404).json({ error: 'El evento ya no existe.' });
    }

    res.json({ mensaje: 'Evento eliminado.' });
  } catch (error) {
    console.error('Error al eliminar evento:', error);
    res.status(500).json({ error: 'No se pudo eliminar el evento.' });
  }
};

export const limpiarEventosAnteriores = async (_req, res) => {
  try {
    const { rowCount } = await pool.query(`
      DELETE FROM eventos_campus
      WHERE estado = 'aprobado' AND fecha_fin < NOW()
    `);

    res.json({
      mensaje: `Se eliminaron ${rowCount} eventos anteriores.`,
      eliminados: rowCount
    });
  } catch (error) {
    console.error('Error al limpiar eventos anteriores:', error);
    res.status(500).json({ error: 'No se pudieron limpiar los eventos anteriores.' });
  }
};