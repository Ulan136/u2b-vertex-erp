import {
  pgTable, pgEnum, uuid, varchar, text, boolean,
  timestamp, date, numeric, integer, smallint, jsonb
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// ── ENUMS ─────────────────────────────────────────────────────
export const userRoleEnum    = pgEnum('user_role',        ['admin','director','accountant','manager','master']);
export const operStatusEnum  = pgEnum('oper_status',      ['В работе','Готова к КТРМ','Внести в КТРМ','КТРМ 70%','Внесён в КТРМ']);
export const payStatusEnum   = pgEnum('pay_status',       ['В ожидании','Оплачено']);
export const invoiceTypeEnum = pgEnum('invoice_type',     ['Каспи','БЦК','Наличка','Каспи Голд']);
export const waterTypeEnum   = pgEnum('water_type',       ['х/в','г/в']);
export const certSourceEnum  = pgEnum('cert_source',      ['САМИ','ВДК','ТЭЦ','Выездная','Первичная','Астана','Первичная-КМ','Первичная-АК']);
export const stockMoveEnum   = pgEnum('stock_move_type',  ['IN','OUT','REV+','REV-']);
export const financeOpEnum   = pgEnum('finance_op_type',  ['Приход','Расход','Перевод']);
export const accountCatEnum  = pgEnum('account_category', ['kaspi','bck','nalichka','other']);
export const orderSourceEnum = pgEnum('order_source',     ['field_check','tec']);
export const debtTypeEnum    = pgEnum('debt_type',        ['debit','credit']);   // debit = нам должны, credit = мы должны
export const debtStatusEnum  = pgEnum('debt_status',      ['open','partial','closed']);
export const taskStatusEnum  = pgEnum('task_status',      ['new','accepted','in_progress','done']);

// ── BRANCHES ──────────────────────────────────────────────────
export const branches = pgTable('branches', {
  id          : uuid('id').primaryKey().default(sql`uuid_generate_v4()`),
  name        : varchar('name', { length: 100 }).notNull(),
  city        : varchar('city', { length: 100 }),
  address     : text('address'),
  invoiceType : invoiceTypeEnum('invoice_type').default('Каспи'),
  isActive    : boolean('is_active').default(true),
  createdAt   : timestamp('created_at', { withTimezone: true }).defaultNow(),
});

// ── USERS ─────────────────────────────────────────────────────
export const users = pgTable('users', {
  id           : uuid('id').primaryKey().default(sql`uuid_generate_v4()`),
  email        : varchar('email', { length: 150 }).notNull().unique(),
  name         : varchar('name', { length: 150 }).notNull(),
  position     : varchar('position', { length: 100 }),
  role         : userRoleEnum('role').notNull().default('manager'),
  branchId     : uuid('branch_id').references(() => branches.id),
  passwordHash : varchar('password_hash', { length: 255 }),
  isActive     : boolean('is_active').default(true),
  lastLogin    : timestamp('last_login', { withTimezone: true }),
  createdAt    : timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt    : timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

// ── CERTIFICATES ──────────────────────────────────────────────
export const certificates = pgTable('certificates', {
  id            : uuid('id').primaryKey().default(sql`uuid_generate_v4()`),
  source        : certSourceEnum('source').notNull().default('САМИ'),
  branchId      : uuid('branch_id').references(() => branches.id),
  fio           : varchar('fio', { length: 200 }).notNull(),
  address       : text('address').notNull(),
  meterType     : varchar('meter_type', { length: 50 }),
  serialNo      : varchar('serial_no', { length: 50 }),
  yearMade      : smallint('year_made'),
  waterType     : waterTypeEnum('water_type').default('х/в'),
  seal          : boolean('seal').default(true),
  checkDate     : date('check_date'),
  nextCheckDate : date('next_check_date'),
  stampNo       : varchar('stamp_no', { length: 20 }),
  readings      : numeric('readings', { precision: 10, scale: 2 }),
  note          : text('note'),
  phone         : varchar('phone', { length: 30 }),
  sealType      : varchar('seal_type', { length: 40 }),
  result        : varchar('result', { length: 20 }).default('Годен'),
  docType       : varchar('doc_type', { length: 10 }).default('cert'),   // 'cert' | 'izv'
  operStatus    : operStatusEnum('oper_status').default('В работе'),
  payStatus     : payStatusEnum('pay_status').default('В ожидании'),
  invoiceType   : invoiceTypeEnum('invoice_type').default('Каспи'),
  ktrmRegNo     : varchar('ktrm_reg_no', { length: 50 }),
  ktrmDoneAt    : timestamp('ktrm_done_at', { withTimezone: true }),
  ktrmError     : text('ktrm_error'),
  amount        : numeric('amount', { precision: 12, scale: 2 }).default('0'),
  isArchived    : boolean('is_archived').default(false),
  archivedAt    : timestamp('archived_at', { withTimezone: true }),
  createdBy     : uuid('created_by').references(() => users.id),
  updatedBy     : uuid('updated_by').references(() => users.id),
  createdAt     : timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt     : timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

// ── PRODUCTS ──────────────────────────────────────────────────
export const products = pgTable('products', {
  id           : uuid('id').primaryKey().default(sql`uuid_generate_v4()`),
  skuCode      : varchar('sku_code', { length: 20 }).notNull().unique(),
  name         : varchar('name', { length: 200 }).notNull(),
  fullName     : text('full_name'),
  groupId      : varchar('group_id', { length: 20 }),
  waterType    : varchar('water_type', { length: 10 }),
  minStock     : integer('min_stock').default(5),
  currentStock : integer('current_stock').default(0),
  reserved     : integer('reserved').default(0),
  price        : numeric('price', { precision: 12, scale: 2 }).default('0'),
  priceDiscount: numeric('price_discount', { precision: 12, scale: 2 }).default('0'),
  isConsumable : boolean('is_consumable').default(false),
  isActive     : boolean('is_active').default(true),
  createdAt    : timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt    : timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

// ── STOCK MOVEMENTS ───────────────────────────────────────────
export const stockMovements = pgTable('stock_movements', {
  id          : uuid('id').primaryKey().default(sql`uuid_generate_v4()`),
  productId   : uuid('product_id').references(() => products.id).notNull(),
  skuCode     : varchar('sku_code', { length: 20 }),
  productName : varchar('product_name', { length: 200 }),
  moveType    : stockMoveEnum('move_type').notNull(),
  qty         : integer('qty').notNull(),
  price       : numeric('price', { precision: 12, scale: 2 }).default('0'),
  totalSum    : numeric('total_sum', { precision: 12, scale: 2 }).default('0'),
  certId      : uuid('cert_id').references(() => certificates.id),
  docNo       : varchar('doc_no', { length: 50 }),
  supplier    : varchar('supplier', { length: 200 }),
  comment     : text('comment'),
  author      : varchar('author', { length: 150 }),
  moveDate    : date('move_date').default(sql`CURRENT_DATE`),
  createdAt   : timestamp('created_at', { withTimezone: true }).defaultNow(),
  createdBy   : uuid('created_by').references(() => users.id),
});

// ── SALES ─────────────────────────────────────────────────────
export const sales = pgTable('sales', {
  id          : uuid('id').primaryKey().default(sql`uuid_generate_v4()`),
  saleNo      : varchar('sale_no', { length: 20 }).unique(),
  saleDate    : date('sale_date').default(sql`CURRENT_DATE`),
  clientName  : varchar('client_name', { length: 200 }).notNull(),
  productId   : uuid('product_id').references(() => products.id),
  productName : varchar('product_name', { length: 200 }),
  skuCode     : varchar('sku_code', { length: 20 }),
  qty         : integer('qty').default(1),
  price       : numeric('price', { precision: 12, scale: 2 }).default('0'),
  totalSum    : numeric('total_sum', { precision: 12, scale: 2 }).default('0'),
  payStatus   : payStatusEnum('pay_status').default('В ожидании'),
  invoiceType : invoiceTypeEnum('invoice_type').default('Каспи'),
  comment     : text('comment'),
  createdBy   : uuid('created_by').references(() => users.id),
  createdAt   : timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt   : timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

// ── FINANCE ACCOUNTS ──────────────────────────────────────────
export const financeAccounts = pgTable('finance_accounts', {
  id        : uuid('id').primaryKey().default(sql`uuid_generate_v4()`),
  name      : varchar('name', { length: 100 }).notNull().unique(),
  category  : accountCatEnum('category').default('kaspi'),
  icon      : varchar('icon', { length: 10 }).default('💳'),
  balance   : numeric('balance', { precision: 14, scale: 2 }).default('0'),
  isActive  : boolean('is_active').default(true),
  sortOrder : integer('sort_order').default(0),
  createdAt : timestamp('created_at', { withTimezone: true }).defaultNow(),
});

// ── FINANCE OPERATIONS ────────────────────────────────────────
export const financeOperations = pgTable('finance_operations', {
  id          : uuid('id').primaryKey().default(sql`uuid_generate_v4()`),
  opDate      : date('op_date').default(sql`CURRENT_DATE`),
  name        : varchar('name', { length: 200 }).notNull(),
  accountId   : uuid('account_id').references(() => financeAccounts.id).notNull(),
  accountName : varchar('account_name', { length: 100 }),
  opType      : financeOpEnum('op_type').notNull(),
  amount      : numeric('amount', { precision: 14, scale: 2 }).notNull(),
  source      : varchar('source', { length: 50 }),
  certId      : uuid('cert_id').references(() => certificates.id),
  saleId      : uuid('sale_id').references(() => sales.id),
  comment     : text('comment'),
  createdBy   : uuid('created_by').references(() => users.id),
  createdAt   : timestamp('created_at', { withTimezone: true }).defaultNow(),
});

// ── EXPENSES ──────────────────────────────────────────────────
export const expenseCategories = pgTable('expense_categories', {
  id        : uuid('id').primaryKey().default(sql`uuid_generate_v4()`),
  name      : varchar('name', { length: 100 }).notNull(),
  parentId  : uuid('parent_id'),
  icon      : varchar('icon', { length: 10 }).default('📦'),
  color     : varchar('color', { length: 20 }).default('#6b7280'),
  sortOrder : integer('sort_order').default(0),
});

export const expenses = pgTable('expenses', {
  id          : uuid('id').primaryKey().default(sql`uuid_generate_v4()`),
  expDate     : date('exp_date').default(sql`CURRENT_DATE`),
  categoryId  : uuid('category_id').references(() => expenseCategories.id),
  subCat      : varchar('sub_cat', { length: 100 }),
  description : text('description').notNull(),
  amount      : numeric('amount', { precision: 12, scale: 2 }).notNull(),
  accountId   : uuid('account_id').references(() => financeAccounts.id),
  accountName : varchar('account_name', { length: 100 }),
  docNo       : varchar('doc_no', { length: 50 }),
  comment     : text('comment'),
  createdBy   : uuid('created_by').references(() => users.id),
  createdAt   : timestamp('created_at', { withTimezone: true }).defaultNow(),
});

// ── FIELD-SERVICE ORDERS (Заявки на выездную поверку) ─────────
export const orders = pgTable('orders', {
  id        : uuid('id').primaryKey().default(sql`uuid_generate_v4()`),
  orderNo   : varchar('order_no', { length: 20 }),
  orderDate : date('order_date'),
  clientName: varchar('client_name', { length: 150 }),
  address   : text('address'),
  phone     : varchar('phone', { length: 30 }),
  qty       : integer('qty').default(1),
  waterType : varchar('water_type', { length: 20 }),
  // positions: [{ address, qty, water }] — multiple meter locations per order
  positions : jsonb('positions').$type<Array<{ address: string; qty: number; water: string }>>().default([]),
  comment   : text('comment'),
  status    : varchar('status', { length: 20 }).default('В работе'),   // 'В работе' | 'Готова' | 'Отменён'
  // origin channel: 'field_check' (Выездная поверка) | 'tec' (ТЭЦ). Separate order streams + numbering.
  source    : orderSourceEnum('source').notNull().default('field_check'),
  createdAt : timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt : timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

// ── CLIENT CATEGORIES ─────────────────────────────────────────
// Organization-wide list of client categories (e.g. «ТЭЦ»).
export const clientCategories = pgTable('client_categories', {
  id        : uuid('id').primaryKey().default(sql`uuid_generate_v4()`),
  name      : varchar('name', { length: 100 }).notNull(),
  createdAt : timestamp('created_at', { withTimezone: true }).defaultNow(),
});

// ── CLIENTS ───────────────────────────────────────────────────
// Organization-wide clients; the only grouping is category_id.
// On category delete → set null («без категории»).
export const clients = pgTable('clients', {
  id         : uuid('id').primaryKey().default(sql`uuid_generate_v4()`),
  name       : varchar('name', { length: 150 }).notNull(),
  phone      : varchar('phone', { length: 20 }),            // normalized to +7XXXXXXXXXX
  categoryId : uuid('category_id').references(() => clientCategories.id, { onDelete: 'set null' }),
  createdAt  : timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt  : timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

// ── DEBTS (дебиторка / кредиторка) ────────────────────────────
// A debt owed to us (debit) or by us (credit). status is derived from
// paid_amount (see computeStatus in the debts service/DTO).
export const debts = pgTable('debts', {
  id                   : uuid('id').primaryKey().default(sql`uuid_generate_v4()`),
  type                 : debtTypeEnum('type').notNull(),
  // counterparty: either a client from the directory OR a free-text name (one required)
  counterpartyClientId : uuid('counterparty_client_id').references(() => clients.id, { onDelete: 'set null' }),
  counterpartyName     : varchar('counterparty_name', { length: 200 }),
  amount               : numeric('amount', { precision: 12, scale: 2 }).notNull(),
  paidAmount           : numeric('paid_amount', { precision: 12, scale: 2 }).notNull().default('0'),
  accountId            : uuid('account_id').references(() => financeAccounts.id, { onDelete: 'set null' }),
  dueDate              : date('due_date'),
  comment              : text('comment'),
  status               : debtStatusEnum('status').notNull().default('open'),
  createdAt            : timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt            : timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

// ── DEBT PAYMENTS (погашения) ─────────────────────────────────
// A payment against a debt. It reuses the finance ledger: each payment
// creates a finance_operation (Приход for debit, Расход for credit) whose id
// is stored here so deleting the payment rolls that operation back.
export const debtPayments = pgTable('debt_payments', {
  id          : uuid('id').primaryKey().default(sql`uuid_generate_v4()`),
  debtId      : uuid('debt_id').references(() => debts.id, { onDelete: 'cascade' }).notNull(),
  amount      : numeric('amount', { precision: 12, scale: 2 }).notNull(),
  accountId   : uuid('account_id').references(() => financeAccounts.id, { onDelete: 'set null' }),
  financeOpId : uuid('finance_op_id').references(() => financeOperations.id, { onDelete: 'set null' }),
  payDate     : date('pay_date').default(sql`CURRENT_DATE`),
  comment     : text('comment'),
  createdAt   : timestamp('created_at', { withTimezone: true }).defaultNow(),
});

// ── ROLE PERMISSIONS (доступ ролей к экранам) ─────────────────
// One row per (role, screen). No row = access allowed (default). The Админ
// role always has full access and is never restricted here.
export const rolePermissions = pgTable('role_permissions', {
  id        : uuid('id').primaryKey().default(sql`uuid_generate_v4()`),
  role      : varchar('role', { length: 40 }).notNull(),        // latin role key
  screenKey : varchar('screen_key', { length: 60 }).notNull(),
  allowed   : boolean('allowed').notNull().default(true),
  createdAt : timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt : timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

// ── TASKS (задачи сотрудникам) ────────────────────────────────
// status flow: new → accepted → in_progress → done.
// completed_at is stamped when a task moves to 'done'.
export const tasks = pgTable('tasks', {
  id          : uuid('id').primaryKey().default(sql`uuid_generate_v4()`),
  title       : varchar('title', { length: 200 }).notNull(),
  description : text('description'),
  assigneeId  : uuid('assignee_id').references(() => users.id, { onDelete: 'set null' }),
  dueDate     : date('due_date'),
  status      : taskStatusEnum('status').notNull().default('new'),
  createdBy   : uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt   : timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt   : timestamp('updated_at', { withTimezone: true }).defaultNow(),
  completedAt : timestamp('completed_at', { withTimezone: true }),
});

// ── TYPES ─────────────────────────────────────────────────────
export type Branch           = typeof branches.$inferSelect;
export type User             = typeof users.$inferSelect;
export type Certificate      = typeof certificates.$inferSelect;
export type Product          = typeof products.$inferSelect;
export type StockMovement    = typeof stockMovements.$inferSelect;
export type Sale             = typeof sales.$inferSelect;
export type FinanceAccount   = typeof financeAccounts.$inferSelect;
export type FinanceOperation = typeof financeOperations.$inferSelect;
export type Expense          = typeof expenses.$inferSelect;
export type ClientCategory   = typeof clientCategories.$inferSelect;
export type Client           = typeof clients.$inferSelect;
export type Debt             = typeof debts.$inferSelect;
export type DebtPayment      = typeof debtPayments.$inferSelect;
export type Task             = typeof tasks.$inferSelect;
export type RolePermission   = typeof rolePermissions.$inferSelect;

export type NewCertificate = typeof certificates.$inferInsert;
export type NewClient         = typeof clients.$inferInsert;
export type NewClientCategory = typeof clientCategories.$inferInsert;
export type NewProduct     = typeof products.$inferInsert;
export type NewSale        = typeof sales.$inferInsert;
export type NewStockMove   = typeof stockMovements.$inferInsert;
export type NewFinanceOp   = typeof financeOperations.$inferInsert;
