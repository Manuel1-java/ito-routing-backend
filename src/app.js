import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import swaggerUi from 'swagger-ui-express';
import { swaggerSpec } from './config/swagger.js';
import { pool } from './config/db.js';
import authRoutes from './routes/auth.routes.js';
import campusRoutes from './routes/campus.routes.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

const origenesPermitidos = [
  'http://localhost:5173',
  'http://localhost:3000',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:3000',
  'https://localhost',
  'http://localhost',
  'capacitor://localhost'
];

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || origenesPermitidos.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`Origen no permitido por CORS: ${origin}`));
      }
    },
    credentials: true
  })
);

app.use(express.json({ limit: '5mb' }));

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.use('/api/auth', authRoutes);
app.use('/api/campus', campusRoutes);

app.get('/api/health', async (_req, res) => {
  try {
    const result = await pool.query('SELECT NOW() AS hora_servidor');
    res.json({
      estado: 'ok',
      base_datos: 'conectada',
      hora: result.rows[0].hora_servidor
    });
  } catch (error) {
    res.status(500).json({
      estado: 'error',
      detalle: error.message
    });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
  console.log(`Documentacion Swagger disponible en http://localhost:${PORT}/api-docs`);
});