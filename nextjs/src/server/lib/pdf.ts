import { execFile } from 'child_process';
import { promisify } from 'util';
import { writeFile, readFile, mkdtemp, rm } from 'fs/promises';
import { existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const pexec = promisify(execFile);

// PDF = конвертация ЗАПОЛНЕННОГО файла-шаблона через LibreOffice (не отдельная
// вёрстка). Работает там, где установлен LibreOffice (терминал/ПК). Путь можно
// задать через SOFFICE_PATH.
function findSoffice(): string {
  const cands = [
    process.env.SOFFICE_PATH,
    'C:/Program Files/LibreOffice/program/soffice.exe',
    'C:/Program Files (x86)/LibreOffice/program/soffice.exe',
    '/usr/bin/soffice', '/usr/bin/libreoffice', '/opt/libreoffice/program/soffice',
  ].filter(Boolean) as string[];
  for (const c of cands) if (existsSync(c)) return c;
  return 'soffice'; // надежда на PATH
}

// Конвертирует xlsx/docx (Buffer) в PDF, сохраняя вёрстку 1-в-1.
export async function officeToPdf(input: Buffer, ext: 'xlsx' | 'docx'): Promise<Buffer> {
  const soffice = findSoffice();
  const dir = await mkdtemp(join(tmpdir(), 'doc2pdf-'));
  const inFile = join(dir, `doc.${ext}`);
  const outFile = join(dir, 'doc.pdf');
  // уникальный профиль LibreOffice — чтобы параллельные конвертации не ловили lock
  const profile = 'file:///' + join(dir, 'loprofile').replace(/\\/g, '/');
  await writeFile(inFile, input);
  try {
    await pexec(soffice, [`-env:UserInstallation=${profile}`, '--headless', '--convert-to', 'pdf', '--outdir', dir, inFile], { timeout: 90_000, windowsHide: true });
    return await readFile(outFile);
  } catch (e) {
    throw new Error('PDF недоступен: не удалось запустить LibreOffice. Установите LibreOffice (или задайте SOFFICE_PATH). ' + (e as Error).message);
  } finally {
    rm(dir, { recursive: true, force: true }).catch(() => { /* temp cleanup best-effort */ });
  }
}
