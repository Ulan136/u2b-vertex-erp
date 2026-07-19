import { documentsRepo } from '@/server/repositories/documents.repo';
import { orgRepo } from '@/server/repositories/org.repo';
import {
  documentCreateSchema, computeItems, amountInWordsKzt, nextDocNumber, type DocType,
} from '@/server/dto/documents.dto';
import { notFound } from '@/server/lib/errors';

const money = (n: number) => (Math.round((Number(n) || 0) * 100) / 100).toFixed(2);
const DOC_LABEL: Record<string, string> = {
  invoice: 'Счет на оплату', nakladnaya: 'Накладная', akt: 'Акт выполненных работ', kp: 'Коммерческое предложение',
};

export const documentsService = {
  list: () => documentsRepo.list(),
  org: () => orgRepo.get(),
  get: (id: string) => documentsRepo.findById(id),
  remove: (id: string) => documentsRepo.remove(id),

  async nextNumber(type: DocType) {
    const nums = await documentsRepo.numbersOf(type);
    return nextDocNumber(type, nums.map(n => n.number));
  },

  async create(input: unknown, actorId?: string | null) {
    const data = documentCreateSchema.parse(input);
    const { rows, total } = computeItems(data.items);
    const nums = await documentsRepo.numbersOf(data.type);
    const number = nextDocNumber(data.type, nums.map(n => n.number));
    return documentsRepo.create({
      type: data.type,
      number,
      docNo: `${DOC_LABEL[data.type]} № ${number}`,
      docDate: data.docDate || undefined,
      buyerName: data.buyerName,
      buyerBin: data.buyerBin || null,
      buyerAddress: data.buyerAddress || null,
      buyerRequisites: data.buyerRequisites || null,
      bank: data.bank || null,
      items: rows.map(r => ({ name: r.name, sku: (r.sku as string) || null, qty: r.qty, unit: (r.unit as string) || 'шт', price: r.price, sum: r.sum })),
      total: money(total),
      amountWords: amountInWordsKzt(total),
      withStamp: data.withStamp,
      withSign: data.withSign,
      comment: data.comment || null,
      createdBy: actorId || null,
    });
  },

  // Документ + реквизиты организации — для генераторов файлов.
  async withOrg(id: string) {
    const doc = await documentsRepo.findById(id);
    if (!doc) throw notFound('Документ не найден');
    const org = await orgRepo.get();
    return { doc, org };
  },
};
