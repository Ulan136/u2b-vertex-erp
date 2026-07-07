import { db } from './index';
import { products } from './schema';

// 21 warehouse SKUs (source: sketch_screens.html warehouseData) + 3 consumables.
// stock/reserved start at 0; prices are placeholders (0) — update via the app.
type SeedProduct = {
  skuCode: string;
  name: string;
  fullName: string;
  groupId: string;
  waterType: string;
  minStock: number;
  isConsumable?: boolean;
};

const catalog: SeedProduct[] = [
  // ── Радиомодульные ──────────────────────────────────────────
  { skuCode: 'SKU-001', groupId: 'radio', name: 'KAZMETER Pro15C-LRW', fullName: 'KAZMETER Pro15C-LRW со встроенным радиомодулем. Класс точности "С" для холодной воды', waterType: 'х/в', minStock: 5 },
  { skuCode: 'SKU-002', groupId: 'radio', name: 'KAZMETER Pro15H-LRW', fullName: 'KAZMETER Pro15H-LRW со встроенным радиомодулем. Класс точности "В" для горячей воды', waterType: 'г/в', minStock: 5 },
  { skuCode: 'SKU-003', groupId: 'radio', name: 'KAZMETER Pro15C-NB', fullName: 'KAZMETER Pro15C-NB со встроенным радиомодулем. Класс точности "С" для холодной воды', waterType: 'х/в', minStock: 5 },
  { skuCode: 'SKU-004', groupId: 'radio', name: 'KAZMETER Pro15H-NB', fullName: 'KAZMETER Pro15H-NB со встроенным радиомодулем. Класс точности "В" для горячей воды', waterType: 'г/в', minStock: 5 },
  // ── Импульсные ──────────────────────────────────────────────
  { skuCode: 'SKU-005', groupId: 'impulse', name: 'KAZMETER KM-UW15', fullName: 'KAZMETER KM-UW15 для горячей воды. Класс точности "B", с импульсным выходом', waterType: 'г/в', minStock: 5 },
  { skuCode: 'SKU-006', groupId: 'impulse', name: 'VODOMER ВСКМ-15', fullName: 'VODOMER ВСКМ-15-R160-И. Класс точности "С", с импульсным выходом', waterType: 'х/в', minStock: 10 },
  { skuCode: 'SKU-007', groupId: 'impulse', name: 'VODOMER ВСКМ-20', fullName: 'VODOMER ВСКМ-20-R160-И. Класс точности "С", с импульсным выходом', waterType: 'х/в', minStock: 10 },
  { skuCode: 'SKU-008', groupId: 'impulse', name: 'KAZMETER KM-CW25', fullName: 'KAZMETER KM-CW25. Класс точности "С", с импульсным выходом', waterType: 'х/в', minStock: 5 },
  { skuCode: 'SKU-009', groupId: 'impulse', name: 'KAZMETER KM-CW32', fullName: 'KAZMETER KM-CW32. Класс точности "С", с импульсным выходом', waterType: 'х/в', minStock: 5 },
  { skuCode: 'SKU-010', groupId: 'impulse', name: 'KAZMETER KM-CW40', fullName: 'KAZMETER KM-CW40. Класс точности "С", с импульсным выходом', waterType: 'х/в', minStock: 3 },
  { skuCode: 'SKU-011', groupId: 'impulse', name: 'KAZMETER KM-CW50', fullName: 'KAZMETER KM-CW50. Класс точности "С", с импульсным выходом. Фланец', waterType: 'х/в', minStock: 3 },
  { skuCode: 'SKU-012', groupId: 'impulse', name: 'KAZMETER KM-CW65', fullName: 'KAZMETER KM-CW65. Класс точности "С", с импульсным выходом', waterType: 'х/в', minStock: 2 },
  { skuCode: 'SKU-013', groupId: 'impulse', name: 'KAZMETER KM-CW80', fullName: 'KAZMETER KM-CW80. Класс точности "С", с импульсным выходом', waterType: 'х/в', minStock: 2 },
  { skuCode: 'SKU-014', groupId: 'impulse', name: 'KAZMETER KM-CW100', fullName: 'KAZMETER KM-CW100. Класс точности "С", с импульсным выходом', waterType: 'х/в', minStock: 2 },
  { skuCode: 'SKU-015', groupId: 'impulse', name: 'KAZMETER KM-CW150', fullName: 'KAZMETER KM-CW150. Класс точности "С", с импульсным выходом', waterType: 'х/в', minStock: 1 },
  // ── Радиомодемы ─────────────────────────────────────────────
  { skuCode: 'SKU-016', groupId: 'modem', name: 'ExpDevice 2кан. NB-IoT', fullName: 'ExpDevice 2-х канальный NB-IoT', waterType: '—', minStock: 5 },
  { skuCode: 'SKU-017', groupId: 'modem', name: 'ExpDevice 2кан. GSM', fullName: 'ExpDevice 2-х канальный GSM', waterType: '—', minStock: 5 },
  { skuCode: 'SKU-018', groupId: 'modem', name: 'ExpDevice 2кан. Wi-Fi', fullName: 'ExpDevice 2-х канальный Wi-Fi', waterType: '—', minStock: 5 },
  { skuCode: 'SKU-019', groupId: 'modem', name: 'ExpDevice 4кан.', fullName: 'ExpDevice 4-х канальный', waterType: '—', minStock: 3 },
  { skuCode: 'SKU-020', groupId: 'modem', name: 'ExpDevice 8кан.', fullName: 'ExpDevice 8-ми канальный', waterType: '—', minStock: 3 },
  { skuCode: 'SKU-021', groupId: 'modem', name: 'ExpDevice 10кан.', fullName: 'ExpDevice 10-ти канальный', waterType: '—', minStock: 2 },
  // ── Расходники ──────────────────────────────────────────────
  { skuCode: 'SKU-022', groupId: 'consumable', name: 'Этикетка', fullName: 'Этикетка поверки (label)', waterType: '—', minStock: 100, isConsumable: true },
  { skuCode: 'SKU-023', groupId: 'consumable', name: 'Пломба', fullName: 'Пломба (seal)', waterType: '—', minStock: 100, isConsumable: true },
  { skuCode: 'SKU-024', groupId: 'consumable', name: 'Клеймо', fullName: 'Клеймо / штамп (stamp)', waterType: '—', minStock: 50, isConsumable: true },
];

async function seedProducts() {
  console.log(`🌱 Seeding ${catalog.length} products…`);
  const inserted = await db
    .insert(products)
    .values(
      catalog.map((p) => ({
        skuCode: p.skuCode,
        name: p.name,
        fullName: p.fullName,
        groupId: p.groupId,
        waterType: p.waterType,
        minStock: p.minStock,
        currentStock: 0,
        reserved: 0,
        price: '0',
        isConsumable: p.isConsumable ?? false,
        isActive: true,
      }))
    )
    .onConflictDoNothing({ target: products.skuCode })
    .returning();

  console.log(`   ✓ inserted ${inserted.length} new (skipped ${catalog.length - inserted.length} existing)`);
  console.log('✅ Products seed complete.');
}

seedProducts()
  .catch((err) => {
    console.error('❌ Products seed failed:', err);
    process.exit(1);
  })
  .then(() => process.exit(0));
