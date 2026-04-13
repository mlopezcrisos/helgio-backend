const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
// Permitimos que tu frontend de React (la tablet) se comunique sin bloqueos
app.use(cors());
app.use(express.json());

// Configuración de PostgreSQL para soportar Render (DATABASE_URL) y localhost
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://admin_helgio:password123@localhost:5432/helgio_db',
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

// ENDPOINT 1: Consultar precios del día
app.get('/api/productos', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM productos ORDER BY id ASC');
    res.json(result.rows);
  } catch (err) {
    console.error('Error al jalar productos:', err.message);
    res.status(500).send('Error en el servidor');
  }
});

// ENDPOINT 2: El corte de caja (Guardar ticket)
app.post('/api/ventas', async (req, res) => {
  const { total, detalles } = req.body;

  const client = await pool.connect();
  try {
    await client.query('BEGIN'); // Empezamos transacción segura

    // Guardamos el total de la venta
    const ventaResult = await client.query(
      'INSERT INTO ventas (total) VALUES ($1) RETURNING id',
      [total]
    );
    const ventaId = ventaResult.rows[0].id;

    // Guardamos cuántos kilos de azúcar o huevo fueron
    for (let item of detalles) {
      await client.query(
        'INSERT INTO detalle_ventas (venta_id, producto_id, kilos, subtotal) VALUES ($1, $2, $3, $4)',
        [ventaId, item.producto_id, item.kilos, item.subtotal]
      );
    }

    await client.query('COMMIT');
    res.status(201).json({ mensaje: 'Ticket guardado chingón', venta_id: ventaId });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error en la venta:', err.message);
    res.status(500).send('Error al registrar el ticket');
  } finally {
    client.release();
  }
});

// ENDPOINT 3: Actualizar precios
app.put('/api/productos', async (req, res) => {
  const { precios } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const [codigo, precio_kg] of Object.entries(precios)) {
      await client.query(
        'UPDATE productos SET precio_kg = $1 WHERE codigo = $2',
        [precio_kg, codigo]
      );
    }
    await client.query('COMMIT');
    res.json({ mensaje: 'Precios actualizados chingón' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error al actualizar precios:', err.message);
    res.status(500).send('Error al actualizar precios');
  } finally {
    client.release();
  }
});

// ENDPOINT 4: Resumen del Día
app.get('/api/resumen', async (req, res) => {
  try {
    const ingresosResult = await pool.query(
      "SELECT COALESCE(SUM(total), 0) as ingresos_totales, COUNT(id) as total_tickets FROM ventas WHERE DATE(fecha) = CURRENT_DATE"
    );

    const volumenResult = await pool.query(`
      SELECT p.nombre, SUM(dv.kilos) as kilos 
      FROM detalle_ventas dv
      JOIN ventas v ON dv.venta_id = v.id
      JOIN productos p ON dv.producto_id = p.id
      WHERE DATE(v.fecha) = CURRENT_DATE
      GROUP BY p.nombre
    `);

    const ingresosTotales = parseFloat(ingresosResult.rows[0].ingresos_totales);
    const totalTickets = parseInt(ingresosResult.rows[0].total_tickets, 10);

    const volumenPorProducto = {};
    volumenResult.rows.forEach(row => {
      volumenPorProducto[row.nombre] = parseFloat(row.kilos);
    });

    res.json({
      ingresosTotales,
      totalTickets,
      volumenPorProducto
    });
  } catch (err) {
    console.error('Error al jalar el resumen:', err.message);
    res.status(500).send('Error');
  }
});

const inicializarBD = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS productos (
        id SERIAL PRIMARY KEY,
        nombre VARCHAR(255) NOT NULL,
        precio_kg DECIMAL(10,2) NOT NULL,
        codigo VARCHAR(100) UNIQUE
      );
      CREATE TABLE IF NOT EXISTS ventas (
        id SERIAL PRIMARY KEY,
        fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        total DECIMAL(10,2) NOT NULL
      );
      CREATE TABLE IF NOT EXISTS detalle_ventas (
        id SERIAL PRIMARY KEY,
        venta_id INT REFERENCES ventas(id),
        producto_id INT REFERENCES productos(id),
        kilos DECIMAL(10,3) NOT NULL,
        subtotal DECIMAL(10,2) NOT NULL
      );
    `);

    await pool.query(`
      INSERT INTO productos (nombre, precio_kg, codigo) VALUES 
      ('Huevo Blanco', 42.50, 'huevoBlanco'),
      ('Azúcar Estándar', 22.00, 'azucarEstandar')
      ON CONFLICT (codigo) DO NOTHING;
    `);
    console.log("Base de datos inicializada correctamente");
  } catch (err) {
    console.error("Error al inicializar la base de datos:", err);
  }
};

const PORT = process.env.PORT || 5000;
app.listen(PORT, async () => {
  await inicializarBD();
  console.log(`Backend de Distribuidora HelGio escuchando en el puerto ${PORT}`);
});