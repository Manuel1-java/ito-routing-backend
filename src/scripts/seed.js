import fs from 'node:fs';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import { pool } from '../config/db.js';

const publicDir = path.resolve(process.cwd(), '../ito-routing-app/public');

async function seed() {
  const client = await pool.connect();

  try {
    console.log('Iniciando migracion de datos hacia PostgreSQL...');
    await client.query('BEGIN');

    // 1. Crear usuarios de prueba para los 3 roles
    const rolesRes = await client.query('SELECT id, nombre FROM roles');
    const rolesMap = Object.fromEntries(rolesRes.rows.map((r) => [r.nombre, r.id]));

    const usuariosPrueba = [
      { nombre: 'Administrador ITO', correo: 'admin@itoaxaca.edu.mx', pass: 'admin123', rol: 'ADMIN' },
      { nombre: 'Moderador Campus', correo: 'moderador@itoaxaca.edu.mx', pass: 'mod123', rol: 'MODERADOR' },
      { nombre: 'Manuel Lopez', correo: '20161247@itoaxaca.edu.mx', pass: 'est123', rol: 'ESTUDIANTE' }
    ];

    for (const u of usuariosPrueba) {
      const hash = await bcrypt.hash(u.pass, 10);
      await client.query(
        `INSERT INTO usuarios (nombre, correo, password_hash, rol_id)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (correo) DO NOTHING`,
        [u.nombre, u.correo, hash, rolesMap[u.rol]]
      );
    }

    // 2. Migrar edificios.geojson
    const edificiosRaw = JSON.parse(
      fs.readFileSync(path.join(publicDir, 'edificios.geojson'), 'utf-8')
    );

    await client.query('TRUNCATE TABLE lugares, edificios RESTART IDENTITY CASCADE');

    const idsUsados = new Set();
    const codigosValidos = new Set();

    for (const feature of edificiosRaw.features) {
      const props = feature.properties || {};
      const codigoOriginal = String(props.id ?? props.fid);
      let dbId = codigoOriginal;

      if (idsUsados.has(dbId)) {
        dbId = `${codigoOriginal}_fid${props.fid}`;
      }
      idsUsados.add(dbId);
      codigosValidos.add(dbId);

      await client.query(
        `INSERT INTO edificios (id, codigo, nombre, altura, base, piso, geometria)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          dbId,
          codigoOriginal,
          props.nombre || 'Edificio sin nombre',
          Number(props.altura) || 4,
          Number(props.base) || 0,
          props.piso || 'PB',
          JSON.stringify(feature.geometry)
        ]
      );
    }

    // 3. Migrar lugares.json
    const lugaresRaw = JSON.parse(
      fs.readFileSync(path.join(publicDir, 'lugares.json'), 'utf-8')
    );

    for (const lugar of lugaresRaw) {
      const edId = lugar.edificio_id && codigosValidos.has(String(lugar.edificio_id))
        ? String(lugar.edificio_id)
        : null;

      await client.query(
        `INSERT INTO lugares (id, nombre, descripcion, tipo, edificio_id, longitud, latitud, palabras_clave)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          lugar.id,
          lugar.nombre,
          lugar.descripcion || '',
          lugar.tipo || 'Punto de Interes',
          edId,
          Number(lugar.coordenadas[0]),
          Number(lugar.coordenadas[1]),
          Array.isArray(lugar.palabras_clave) ? lugar.palabras_clave : []
        ]
      );
    }

    // 4. Migrar rutas.geojson
    const rutasRaw = JSON.parse(
      fs.readFileSync(path.join(publicDir, 'rutas.geojson'), 'utf-8')
    );

    await client.query('TRUNCATE TABLE tramos_ruta RESTART IDENTITY CASCADE');

    for (const feature of rutasRaw.features) {
      const props = feature.properties || {};
      await client.query(
        `INSERT INTO tramos_ruta (tipo, piso, edificio_id, habilitado, geometria)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          props.Tipo || props.tipo || 'andador',
          props.Piso || props.piso || 'pb',
          props.edificio_id ? String(props.edificio_id) : null,
          true,
          JSON.stringify(feature.geometry)
        ]
      );
    }

    await client.query('COMMIT');
    console.log(`Migracion completada: ${edificiosRaw.features.length} edificios, ${lugaresRaw.length} lugares y ${rutasRaw.features.length} tramos de ruta.`);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error durante la migracion:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

seed();