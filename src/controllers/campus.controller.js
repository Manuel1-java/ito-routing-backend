import { pool } from '../config/db.js';

const incrementarVersion = async (client) => {
  const res = await client.query(
    `UPDATE campus_metadata
     SET version = version + 1, ultima_actualizacion = NOW()
     WHERE id = 1
     RETURNING version`
  );
  return res.rows[0].version;
};

export const sincronizarCampus = async (req, res) => {
  const versionCliente = Number(req.query.version) || 0;

  try {
    const metaRes = await pool.query(
      'SELECT version, ultima_actualizacion FROM campus_metadata WHERE id = 1'
    );
    const versionActual = metaRes.rows[0]?.version || 1;

    if (versionCliente >= versionActual) {
      return res.json({
        actualizado: true,
        version: versionActual
      });
    }

    const [edificiosRes, lugaresRes, rutasRes] = await Promise.all([
      pool.query('SELECT id, codigo, nombre, altura, base, piso, geometria FROM edificios ORDER BY nombre ASC'),
      pool.query('SELECT id, nombre, descripcion, tipo, edificio_id, longitud, latitud, palabras_clave FROM lugares ORDER BY nombre ASC'),
      pool.query('SELECT id, tipo, piso, edificio_id, habilitado, geometria FROM tramos_ruta ORDER BY id ASC')
    ]);

    const edificiosGeoJSON = {
      type: 'FeatureCollection',
      features: edificiosRes.rows.map((e) => ({
        type: 'Feature',
        properties: {
          db_id: e.id,
          id: e.codigo || e.id,
          nombre: e.nombre,
          altura: Number(e.altura),
          base: Number(e.base),
          piso: e.piso
        },
        geometry: e.geometria
      }))
    };

    const rutasGeoJSON = {
      type: 'FeatureCollection',
      features: rutasRes.rows.map((r) => ({
        type: 'Feature',
        properties: {
          fid: r.id,
          id: r.id,
          Tipo: r.tipo,
          Piso: r.piso,
          edificio_id: r.edificio_id,
          habilitado: r.habilitado
        },
        geometry: r.geometria
      }))
    };

    const lugares = lugaresRes.rows.map((l) => ({
      id: l.id,
      nombre: l.nombre,
      descripcion: l.descripcion,
      tipo: l.tipo,
      edificio_id: l.edificio_id,
      coordenadas: [Number(l.longitud), Number(l.latitud)],
      palabras_clave: l.palabras_clave || []
    }));

    return res.json({
      actualizado: false,
      version: versionActual,
      ultima_actualizacion: metaRes.rows[0]?.ultima_actualizacion,
      edificios: edificiosGeoJSON,
      rutas: rutasGeoJSON,
      lugares
    });
  } catch (error) {
    return res.status(500).json({
      error: 'Error al sincronizar datos del campus.',
      detalle: error.message
    });
  }
};

export const crearEdificio = async (req, res) => {
  const { id, nombre, altura = 4, base = 0, piso = 'PB', geometria } = req.body;

  if (!id || !nombre || !geometria) {
    return res.status(400).json({
      error: 'Los campos id, nombre y geometria (GeoJSON Polygon) son obligatorios.'
    });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const nuevo = await client.query(
      `INSERT INTO edificios (id, codigo, nombre, altura, base, piso, geometria)
       VALUES ($1, $1, $2, $3, $4, $5, $6)
       RETURNING id, codigo, nombre, altura, base, piso`,
      [String(id), nombre.trim(), Number(altura), Number(base), piso, JSON.stringify(geometria)]
    );

    const nuevaVersion = await incrementarVersion(client);
    await client.query('COMMIT');

    return res.status(201).json({
      mensaje: 'Edificio creado correctamente.',
      version_campus: nuevaVersion,
      edificio: nuevo.rows[0]
    });
  } catch (error) {
    await client.query('ROLLBACK');
    return res.status(500).json({ error: 'Error al crear edificio.', detalle: error.message });
  } finally {
    client.release();
  }
};

export const eliminarEdificio = async (req, res) => {
  const { id } = req.params;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const del = await client.query('DELETE FROM edificios WHERE id = $1 RETURNING id', [id]);

    if (del.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Edificio no encontrado.' });
    }

    const nuevaVersion = await incrementarVersion(client);
    await client.query('COMMIT');

    return res.json({
      mensaje: 'Edificio eliminado.',
      version_campus: nuevaVersion
    });
  } catch (error) {
    await client.query('ROLLBACK');
    return res.status(500).json({ error: 'Error al eliminar edificio.', detalle: error.message });
  } finally {
    client.release();
  }
};

export const crearLugar = async (req, res) => {
  const { id, nombre, descripcion = '', tipo, edificio_id = null, coordenadas, palabras_clave = [] } = req.body;

  if (!id || !nombre || !tipo || !Array.isArray(coordenadas) || coordenadas.length < 2) {
    return res.status(400).json({
      error: 'Los campos id, nombre, tipo y coordenadas [longitud, latitud] son obligatorios.'
    });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const nuevo = await client.query(
      `INSERT INTO lugares (id, nombre, descripcion, tipo, edificio_id, longitud, latitud, palabras_clave)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        String(id),
        nombre.trim(),
        descripcion.trim(),
        tipo.trim(),
        edificio_id,
        Number(coordenadas[0]),
        Number(coordenadas[1]),
        palabras_clave
      ]
    );

    const nuevaVersion = await incrementarVersion(client);
    await client.query('COMMIT');

    return res.status(201).json({
      mensaje: 'Lugar registrado correctamente.',
      version_campus: nuevaVersion,
      lugar: nuevo.rows[0]
    });
  } catch (error) {
    await client.query('ROLLBACK');
    return res.status(500).json({ error: 'Error al crear lugar.', detalle: error.message });
  } finally {
    client.release();
  }
};

export const cambiarEstadoTramo = async (req, res) => {
  const { id } = req.params;
  const { habilitado } = req.body;

  if (typeof habilitado !== 'boolean') {
    return res.status(400).json({ error: 'El campo habilitado debe ser booleano (true/false).' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const upd = await client.query(
      'UPDATE tramos_ruta SET habilitado = $1 WHERE id = $2 RETURNING id, tipo, piso, habilitado',
      [habilitado, id]
    );

    if (upd.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Tramo de ruta no encontrado.' });
    }

    if (habilitado) {
      await client.query(
        "UPDATE reportes_incidencia SET estado = 'resuelto' WHERE tramo_id = $1 AND estado = 'aprobado'",
        [id]
      );
    }

    const nuevaVersion = await incrementarVersion(client);
    await client.query('COMMIT');

    return res.json({
      mensaje: `Tramo ${habilitado ? 'habilitado' : 'deshabilitado'} correctamente.`,
      version_campus: nuevaVersion,
      tramo: upd.rows[0]
    });
  } catch (error) {
    await client.query('ROLLBACK');
    return res.status(500).json({ error: 'Error al actualizar estado del tramo.', detalle: error.message });
  } finally {
    client.release();
  }
};

export const crearReporteIncidencia = async (req, res) => {
  const { tramo_id, motivo } = req.body;

  if (!tramo_id || !motivo) {
    return res.status(400).json({ error: 'Debes indicar tramo_id y motivo.' });
  }

  try {
    const nuevo = await pool.query(
      `INSERT INTO reportes_incidencia (tramo_id, usuario_id, motivo)
       VALUES ($1, $2, $3)
       RETURNING id, tramo_id, motivo, estado, creado_en`,
      [Number(tramo_id), req.usuario.id, motivo.trim()]
    );

    return res.status(201).json({
      mensaje: 'Reporte enviado a moderacion.',
      reporte: nuevo.rows[0]
    });
  } catch (error) {
    return res.status(500).json({ error: 'Error al crear reporte.', detalle: error.message });
  }
};

export const listarReportes = async (_req, res) => {
  try {
    const resReportes = await pool.query(
      `SELECT r.id, r.tramo_id, r.motivo, r.estado, r.creado_en,
              t.habilitado AS tramo_habilitado,
              u.nombre AS reportado_por, u.correo
       FROM reportes_incidencia r
       JOIN usuarios u ON r.usuario_id = u.id
       LEFT JOIN tramos_ruta t ON r.tramo_id = t.id
       ORDER BY r.creado_en DESC`
    );
    return res.json({ reportes: resReportes.rows });
  } catch (error) {
    return res.status(500).json({ error: 'Error al obtener reportes.', detalle: error.message });
  }
};

export const resolverReporte = async (req, res) => {
  const { id } = req.params;
  const { estado } = req.body;

  if (!['aprobado', 'rechazado'].includes(estado)) {
    return res.status(400).json({ error: 'El estado debe ser "aprobado" o "rechazado".' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const repRes = await client.query(
      'SELECT id, tramo_id, estado FROM reportes_incidencia WHERE id = $1',
      [Number(id)]
    );

    if (repRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Reporte no encontrado.' });
    }

    const reporte = repRes.rows[0];

    await client.query(
      'UPDATE reportes_incidencia SET estado = $1 WHERE id = $2',
      [estado, reporte.id]
    );

    let nuevaVersion = null;
    if (estado === 'aprobado') {
      await client.query(
        'UPDATE tramos_ruta SET habilitado = FALSE WHERE id = $1',
        [reporte.tramo_id]
      );
      nuevaVersion = await incrementarVersion(client);
    }

    await client.query('COMMIT');

    return res.json({
      mensaje:
        estado === 'aprobado'
          ? `Reporte aprobado y tramo #${reporte.tramo_id} cerrado en el mapa.`
          : 'Reporte rechazado.',
      version_campus: nuevaVersion
    });
  } catch (error) {
    await client.query('ROLLBACK');
    return res.status(500).json({ error: 'Error al procesar reporte.', detalle: error.message });
  } finally {
    client.release();
  }
};

let tablaSugerenciasLista = null;

export const asegurarTablaSugerencias = () => {
  if (!tablaSugerenciasLista) {
    tablaSugerenciasLista = pool
      .query(`
        CREATE TABLE IF NOT EXISTS sugerencias_lugar (
          id SERIAL PRIMARY KEY,
          nombre VARCHAR(150) NOT NULL,
          descripcion TEXT,
          tipo VARCHAR(60) NOT NULL DEFAULT 'Punto de Interés',
          longitud DOUBLE PRECISION NOT NULL,
          latitud DOUBLE PRECISION NOT NULL,
          usuario_id INTEGER REFERENCES usuarios(id) ON DELETE CASCADE,
          estado VARCHAR(20) NOT NULL DEFAULT 'pendiente',
          creado_en TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        );
      `)
      .catch((err) => {
        tablaSugerenciasLista = null;
        throw err;
      });
  }
  return tablaSugerenciasLista;
};

export const crearSugerenciaLugar = async (req, res) => {
  const { nombre, descripcion = '', coordenadas } = req.body;

  if (!nombre || !String(nombre).trim() || !Array.isArray(coordenadas) || coordenadas.length < 2) {
    return res.status(400).json({
      error: 'Debes indicar el nombre y seleccionar el punto en el mapa.'
    });
  }

  const lng = Number(coordenadas[0]);
  const lat = Number(coordenadas[1]);
  if (Number.isNaN(lng) || Number.isNaN(lat)) {
    return res.status(400).json({ error: 'Coordenadas inválidas.' });
  }

  const nombreLimpio = String(nombre).trim().slice(0, 140);
  const descLimpia = String(descripcion || '').trim().slice(0, 350);
  const rol = req.usuario?.rol || 'ESTUDIANTE';
  const esStaff = rol === 'ADMIN' || rol === 'MODERADOR';

  try {
    await asegurarTablaSugerencias();
  } catch (error) {
    return res.status(500).json({
      error: 'Error al preparar tabla de sugerencias.',
      detalle: error.message
    });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    if (esStaff) {
      const nuevoId = `poi-${Date.now()}`;
      const nuevoLugar = await client.query(
        `INSERT INTO lugares (id, nombre, descripcion, tipo, edificio_id, longitud, latitud, palabras_clave)
         VALUES ($1, $2, $3, 'Punto de Interés', NULL, $4, $5, $6)
         RETURNING *`,
        [
          nuevoId,
          nombreLimpio,
          descLimpia || 'Punto de interés del campus',
          lng,
          lat,
          [nombreLimpio.toLowerCase(), 'punto de interes']
        ]
      );

      const nuevaVersion = await incrementarVersion(client);
      await client.query('COMMIT');

      return res.status(201).json({
        mensaje: 'Punto de interés publicado en el mapa del campus.',
        aprobado_directo: true,
        version_campus: nuevaVersion,
        lugar: nuevoLugar.rows[0]
      });
    }

    const sugerencia = await client.query(
      `INSERT INTO sugerencias_lugar (nombre, descripcion, tipo, longitud, latitud, usuario_id)
       VALUES ($1, $2, 'Punto de Interés', $3, $4, $5)
       RETURNING id, nombre, descripcion, tipo, longitud, latitud, estado, creado_en`,
      [nombreLimpio, descLimpia, lng, lat, req.usuario.id]
    );

    await client.query('COMMIT');

    return res.status(201).json({
      mensaje: 'Sugerencia enviada. Un moderador la revisará para publicarla en el mapa.',
      aprobado_directo: false,
      sugerencia: sugerencia.rows[0]
    });
  } catch (error) {
    await client.query('ROLLBACK');
    return res.status(500).json({
      error: 'Error al registrar el punto de interés.',
      detalle: error.message
    });
  } finally {
    client.release();
  }
};

export const listarSugerenciasLugar = async (_req, res) => {
  try {
    await asegurarTablaSugerencias();
    const { rows } = await pool.query(`
      SELECT s.id, s.nombre, s.descripcion, s.tipo, s.longitud, s.latitud,
             s.estado, s.creado_en, u.nombre AS sugerido_por, u.correo
      FROM sugerencias_lugar s
      JOIN usuarios u ON s.usuario_id = u.id
      ORDER BY
        CASE WHEN s.estado = 'pendiente' THEN 0 ELSE 1 END,
        s.creado_en DESC
    `);
    return res.json({ sugerencias: rows });
  } catch (error) {
    return res.status(500).json({
      error: 'Error al obtener sugerencias de puntos de interés.',
      detalle: error.message
    });
  }
};

export const resolverSugerenciaLugar = async (req, res) => {
  const id = Number(req.params.id);
  const { estado } = req.body;

  if (!Number.isInteger(id) || !['aprobado', 'rechazado'].includes(estado)) {
    return res.status(400).json({ error: 'Solicitud inválida.' });
  }

  try {
    await asegurarTablaSugerencias();
  } catch (error) {
    return res.status(500).json({
      error: 'Error al preparar tabla de sugerencias.',
      detalle: error.message
    });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const sugRes = await client.query(
      'SELECT * FROM sugerencias_lugar WHERE id = $1',
      [id]
    );

    if (!sugRes.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Sugerencia no encontrada.' });
    }

    const sug = sugRes.rows[0];

    await client.query(
      'UPDATE sugerencias_lugar SET estado = $1 WHERE id = $2',
      [estado, id]
    );

    let nuevaVersion = null;
    let lugarCreado = null;

    if (estado === 'aprobado') {
      const nuevoId = `poi-${sug.id}-${Date.now()}`;
      const ins = await client.query(
        `INSERT INTO lugares (id, nombre, descripcion, tipo, edificio_id, longitud, latitud, palabras_clave)
         VALUES ($1, $2, $3, 'Punto de Interés', NULL, $4, $5, $6)
         RETURNING *`,
        [
          nuevoId,
          sug.nombre,
          sug.descripcion || 'Punto de interés del campus',
          Number(sug.longitud),
          Number(sug.latitud),
          [sug.nombre.toLowerCase(), 'punto de interes']
        ]
      );
      lugarCreado = ins.rows[0];
      nuevaVersion = await incrementarVersion(client);
    }

    await client.query('COMMIT');

    return res.json({
      mensaje:
        estado === 'aprobado'
          ? `Punto "${sug.nombre}" aprobado y visible para todo el campus.`
          : 'Sugerencia rechazada.',
      version_campus: nuevaVersion,
      lugar: lugarCreado
    });
  } catch (error) {
    await client.query('ROLLBACK');
    return res.status(500).json({
      error: 'Error al moderar punto de interés.',
      detalle: error.message
    });
  } finally {
    client.release();
  }
};