import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { products } from './schema.js';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});
const db = drizzle(pool);

async function seed() {
  await db.insert(products).values([
    { name: sql`'Steel Rod'`, category: sql`'Construction'`, description: sql`'High-quality steel rod'`, price: sql`100`, currency: sql`'USD'`, unit: sql`'kg'`, photos: sql`ARRAY['https://example.com/steel-rod.jpg']`, isActive: sql`true` },
    { name: sql`'Aluminum Sheet'`, category: sql`'Construction'`, description: sql`'Durable aluminum sheet'`, price: sql`200`, currency: sql`'USD'`, unit: sql`'m2'`, photos: sql`ARRAY['https://example.com/aluminum-sheet.jpg']`, isActive: sql`true` },
    { name: sql`'Copper Wire'`, category: sql`'Electrical'`, description: sql`'Conductive copper wire'`, price: sql`300`, currency: sql`'USD'`, unit: sql`'m'`, photos: sql`ARRAY['https://example.com/copper-wire.jpg']`, isActive: sql`true` },
  ]);

  console.log('Seed data inserted successfully');
}

seed().catch((err) => {
  console.error('Error seeding data:', err);
  process.exit(1);
});