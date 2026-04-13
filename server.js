const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
// Permitimos que tu frontend de React (la tablet) se comunique sin bloqueos
app.use(cors());
app.use(express.json());

// Tus credenciales recién horneadas de PostgreSQL en WSL
const pool = new Pool({
  user: 'admin_helgio',
  host: 'localhost',
  database: 'helgio_db',
  password: 'password123',
  port: 5432,
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

const PORT = 5000;
app.listen(PORT, () => {
  console.log(`Backend de Distribuidora HelGio escuchando en el puerto ${PORT}`);
});