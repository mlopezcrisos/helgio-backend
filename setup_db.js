const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://admin_helgio:password123@localhost:5432/helgio_db',
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

const runSetup = async () => {
  try {
    console.log("Creando tablas en la base de datos...");
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
    console.log("Tablas creadas con éxito.");

    console.log("Insertando productos iniciales...");
    await pool.query(`
      INSERT INTO productos (nombre, precio_kg, codigo) VALUES 
      ('Huevo Blanco', 42.50, 'huevoBlanco'),
      ('Azúcar Estándar', 22.00, 'azucarEstandar')
      ON CONFLICT (codigo) DO NOTHING;
    `);
    console.log("Productos insertados correctamente.");
  } catch (err) {
    console.error("Error configurando la base de datos:", err);
  } finally {
    pool.end();
  }
};

runSetup();
