CREATE DATABASE ito_routing_db;

\c ito_routing_db;

CREATE TABLE roles (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(30) UNIQUE NOT NULL
);

INSERT INTO roles (nombre) VALUES
    ('ESTUDIANTE'),
    ('MODERADOR'),
    ('ADMIN');

CREATE TABLE usuarios (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(120) NOT NULL,
    correo VARCHAR(150) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    rol_id INTEGER NOT NULL REFERENCES roles(id),
    activo BOOLEAN DEFAULT TRUE,
    creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE edificios (
    id VARCHAR(50) PRIMARY KEY,
    nombre VARCHAR(150) NOT NULL,
    altura NUMERIC(5,2) DEFAULT 4,
    base NUMERIC(5,2) DEFAULT 0,
    piso VARCHAR(10) DEFAULT 'PB',
    geometria JSONB NOT NULL,
    actualizado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE lugares (
    id VARCHAR(80) PRIMARY KEY,
    nombre VARCHAR(150) NOT NULL,
    descripcion TEXT,
    tipo VARCHAR(60) NOT NULL,
    edificio_id VARCHAR(50) REFERENCES edificios(id) ON DELETE SET NULL,
    longitud DOUBLE PRECISION NOT NULL,
    latitud DOUBLE PRECISION NOT NULL,
    palabras_clave TEXT[] DEFAULT '{}'
);

CREATE TABLE tramos_ruta (
    id SERIAL PRIMARY KEY,
    tipo VARCHAR(40) DEFAULT 'andador',
    habilitado BOOLEAN DEFAULT TRUE,
    geometria JSONB NOT NULL
);

CREATE TABLE reportes_incidencia (
    id SERIAL PRIMARY KEY,
    tramo_id INTEGER REFERENCES tramos_ruta(id) ON DELETE CASCADE,
    usuario_id INTEGER REFERENCES usuarios(id) ON DELETE CASCADE,
    motivo TEXT NOT NULL,
    estado VARCHAR(20) DEFAULT 'pendiente',
    creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE campus_metadata (
    id INTEGER PRIMARY KEY DEFAULT 1,
    version INTEGER NOT NULL DEFAULT 1,
    ultima_actualizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO campus_metadata (id, version) VALUES (1, 1);