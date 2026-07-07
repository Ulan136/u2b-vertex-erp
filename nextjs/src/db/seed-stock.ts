import { eq, sql } from 'drizzle-orm';
import { db } from './index';
import { products } from './schema';

// Gives every product a starting stock of min_stock * 5 (well above the
// reorder minimum → "in stock"). Only touches rows still at 0, so re-running
// won't overwrite quantities that have since been adjusted.
async function seedStock() {
  console.log('🌱 Seeding product stock (min_stock * 5) where stock = 0…');
  const updated = await db
    .update(products)
    .set({ currentStock: sql`${products.minStock} * 5` })
    .where(eq(products.currentStock, 0))
    .returning({ sku: products.skuCode, min: products.minStock, stock: products.currentStock });

  updated
    .sort((a, b) => a.sku.localeCompare(b.sku))
    .forEach((r) => console.log(`   ${r.sku}: stock=${r.stock} (min ${r.min})`));
  console.log(`✅ Updated ${updated.length} products.`);
}

seedStock()
  .catch((err) => {
    console.error('❌ Stock seed failed:', err);
    process.exit(1);
  })
  .then(() => process.exit(0));
