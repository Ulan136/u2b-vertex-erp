import { db } from '@/db';
import { employeeSalary, salaryPayments, users, branches } from '@/db/schema';
import { and, asc, desc, eq, isNull } from 'drizzle-orm';

type SalaryInsert = typeof employeeSalary.$inferInsert;
type PaymentInsert = typeof salaryPayments.$inferInsert;

export const employeesRepo = {
  // Сотрудники = пользователи с заведённым окладом (employee_salary).
  listEmployees: () =>
    db.select({
      userId: employeeSalary.userId,
      name: users.name,
      position: users.position,
      role: users.role,
      branchId: users.branchId,
      branchName: branches.name,
      email: users.email,
      isActive: users.isActive,
      fixedSalary: employeeSalary.fixedSalary,
      salaryUpdatedAt: employeeSalary.updatedAt,
    })
      .from(employeeSalary)
      .innerJoin(users, eq(users.id, employeeSalary.userId))
      .leftJoin(branches, eq(branches.id, users.branchId))
      .orderBy(asc(users.name)),

  // Активные пользователи, ещё НЕ добавленные в кадры — для «+ Добавить сотрудника».
  candidates: () =>
    db.select({
      id: users.id,
      name: users.name,
      position: users.position,
      role: users.role,
      branchName: branches.name,
    })
      .from(users)
      .leftJoin(employeeSalary, eq(employeeSalary.userId, users.id))
      .leftJoin(branches, eq(branches.id, users.branchId))
      .where(and(eq(users.isActive, true), isNull(employeeSalary.userId)))
      .orderBy(asc(users.name)),

  // Директория (для экрана «Руководитель»): все пользователи, реальные данные.
  directory: () =>
    db.select({
      id: users.id,
      name: users.name,
      position: users.position,
      role: users.role,
      phone: users.phone,
      email: users.email,
      branchName: branches.name,
      isActive: users.isActive,
    })
      .from(users)
      .leftJoin(branches, eq(branches.id, users.branchId))
      .orderBy(asc(users.name)),

  // Все выплаты (для расчёта статуса за месяц по всем сотрудникам).
  allPayments: () =>
    db.select({ userId: salaryPayments.userId, amount: salaryPayments.amount, payDate: salaryPayments.payDate })
      .from(salaryPayments),

  // Полные выплаты одного сотрудника.
  paymentsFor: (userId: string) =>
    db.select().from(salaryPayments)
      .where(eq(salaryPayments.userId, userId))
      .orderBy(desc(salaryPayments.payDate), desc(salaryPayments.createdAt)),

  async findSalary(userId: string) {
    const [row] = await db.select().from(employeeSalary).where(eq(employeeSalary.userId, userId)).limit(1);
    return row ?? null;
  },

  // Найти пользователя (роль/имя/филиал) — для приватности и построения операции.
  async findUser(userId: string) {
    const [row] = await db.select({
      id: users.id, name: users.name, role: users.role, position: users.position, branchId: users.branchId,
    }).from(users).where(eq(users.id, userId)).limit(1);
    return row ?? null;
  },

  async upsertSalary(userId: string, fixedSalary: string) {
    const [row] = await db.insert(employeeSalary)
      .values({ userId, fixedSalary } as SalaryInsert)
      .onConflictDoUpdate({ target: employeeSalary.userId, set: { fixedSalary, updatedAt: new Date() } })
      .returning();
    return row;
  },

  async updateSalary(userId: string, fixedSalary: string) {
    const [row] = await db.update(employeeSalary)
      .set({ fixedSalary, updatedAt: new Date() })
      .where(eq(employeeSalary.userId, userId)).returning();
    return row ?? null;
  },

  removeSalary: (userId: string) =>
    db.delete(employeeSalary).where(eq(employeeSalary.userId, userId)),

  async createPayment(data: Record<string, unknown>) {
    const [row] = await db.insert(salaryPayments).values(data as unknown as PaymentInsert).returning();
    return row;
  },
};
