import bcrypt from 'bcryptjs';
import { db } from './index';
import { branches, users, certificates } from './schema';

// Default login password for all seeded users. Change after first login.
const DEFAULT_PASSWORD = 'admin123';

async function seed() {
  // Idempotency guard: if branches already exist, assume seeded and bail.
  const existing = await db.select({ id: branches.id }).from(branches).limit(1);
  if (existing.length > 0) {
    console.log('⏭  Data already present — skipping seed. Run with a clean DB to re-seed.');
    return;
  }

  console.log('🌱 Seeding branches…');
  const insertedBranches = await db
    .insert(branches)
    .values([
      { name: 'Алматы — Центр', city: 'Алматы', address: 'ул. Абая 10', invoiceType: 'Каспи' },
      { name: 'Астана — Филиал', city: 'Астана', address: 'пр. Кабанбай батыра 5', invoiceType: 'БЦК' },
    ])
    .returning();
  const [almaty, astana] = insertedBranches;
  console.log(`   ✓ ${insertedBranches.length} branches`);

  console.log('🌱 Seeding users…');
  const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, 10);
  const insertedUsers = await db
    .insert(users)
    .values([
      {
        email: 'admin@vertex.kz',
        name: 'Администратор',
        position: 'Директор',
        role: 'admin',
        branchId: almaty.id,
        passwordHash,
      },
      {
        email: 'manager@vertex.kz',
        name: 'Менеджер Алматы',
        position: 'Менеджер',
        role: 'manager',
        branchId: almaty.id,
        passwordHash,
      },
    ])
    .returning();
  const admin = insertedUsers.find((u) => u.email === 'admin@vertex.kz')!;
  console.log(`   ✓ ${insertedUsers.length} users (password: "${DEFAULT_PASSWORD}")`);

  console.log('🌱 Seeding certificates…');
  const insertedCerts = await db
    .insert(certificates)
    .values([
      {
        source: 'САМИ',
        branchId: almaty.id,
        fio: 'Иванов Иван Иванович',
        address: 'г. Алматы, ул. Достык 5, кв. 12',
        meterType: 'СВК-15',
        serialNo: 'SN-100001',
        yearMade: 2022,
        waterType: 'х/в',
        checkDate: '2026-01-15',
        nextCheckDate: '2031-01-15',
        readings: '123.45',
        operStatus: 'В работе',
        payStatus: 'В ожидании',
        invoiceType: 'Каспи',
        amount: '5000',
        createdBy: admin.id,
      },
      {
        source: 'ВДК',
        branchId: astana.id,
        fio: 'Петрова Мария Сергеевна',
        address: 'г. Астана, пр. Республики 44, кв. 88',
        meterType: 'СГВ-15',
        serialNo: 'SN-100002',
        yearMade: 2023,
        waterType: 'г/в',
        checkDate: '2026-02-20',
        nextCheckDate: '2031-02-20',
        readings: '67.80',
        operStatus: 'Внести в КТРМ',
        payStatus: 'Оплачено',
        invoiceType: 'БЦК',
        amount: '5500',
        createdBy: admin.id,
      },
      {
        source: 'Выездная',
        branchId: almaty.id,
        fio: 'Сидоров Пётр Николаевич',
        address: 'г. Алматы, мкр. Самал-2, д. 33',
        meterType: 'СВК-20',
        serialNo: 'SN-100003',
        yearMade: 2021,
        waterType: 'х/в',
        checkDate: '2026-03-10',
        nextCheckDate: '2031-03-10',
        readings: '0.00',
        operStatus: 'Внесён в КТРМ',
        payStatus: 'Оплачено',
        invoiceType: 'Наличка',
        amount: '6000',
        createdBy: admin.id,
      },
    ])
    .returning();
  console.log(`   ✓ ${insertedCerts.length} certificates`);

  console.log('✅ Seed complete.');
}

seed()
  .catch((err) => {
    console.error('❌ Seed failed:', err);
    process.exit(1);
  })
  .then(() => process.exit(0));
