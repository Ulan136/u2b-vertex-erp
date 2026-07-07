import { eq } from 'drizzle-orm';
import { db } from './index';
import { products } from './schema';

// [skuCode, retail price, discount price]
const PRICES: [string, number, number][] = [
  ['SKU-001', 35000, 35000],
  ['SKU-002', 35000, 35000],
  ['SKU-003', 45000, 45000],
  ['SKU-004', 45000, 45000],
  ['SKU-005', 6000, 5000],
  ['SKU-006', 10000, 8000],
  ['SKU-007', 18000, 16000],
  ['SKU-008', 45000, 40000],
  ['SKU-009', 50000, 45000],
  ['SKU-010', 75000, 70000],
  ['SKU-011', 130000, 125000],
  ['SKU-012', 140000, 135000],
  ['SKU-013', 150000, 145000],
  ['SKU-014', 165000, 160000],
  ['SKU-015', 250000, 245000],
  ['SKU-016', 45000, 45000],
  ['SKU-017', 45000, 45000],
  ['SKU-018', 40000, 40000],
  ['SKU-019', 50000, 50000],
  ['SKU-020', 55000, 55000],
  ['SKU-021', 60000, 60000],
];

async function seedPrices() {
  console.log(`🌱 Updating retail + discount prices for ${PRICES.length} products…`);
  let n = 0;
  for (const [sku, retail, discount] of PRICES) {
    const res = await db
      .update(products)
      .set({ price: String(retail), priceDiscount: String(discount) })
      .where(eq(products.skuCode, sku))
      .returning({ sku: products.skuCode });
    if (res.length) {
      n++;
      console.log(`   ${sku}: retail=${retail} · discount=${discount}`);
    } else {
      console.warn(`   ⚠️ ${sku} not found`);
    }
  }
  console.log(`✅ Updated ${n}/${PRICES.length} products.`);
}

seedPrices()
  .catch((err) => {
    console.error('❌ Price seed failed:', err);
    process.exit(1);
  })
  .then(() => process.exit(0));
