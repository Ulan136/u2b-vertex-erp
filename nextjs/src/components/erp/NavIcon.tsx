// Единый набор SVG-иконок меню (P0-2 дизайн-брифа): эмодзи из конфига навигации
// маппятся на lucide-react, чтобы иконки были одинаковыми на всех ОС (16px, currentColor).
import {
  Home, ClipboardList, Building2, Wallet, FileText, TrendingDown, BookText,
  CreditCard, CheckSquare, Factory, Users, Receipt, Database, BarChart3,
  BookOpen, Settings, Car, Sparkles, Folder, Scroll, Wrench, ShoppingCart,
  Clock, FolderArchive, MailX, Smartphone, Circle, type LucideIcon,
} from 'lucide-react';

// Ключ — базовый codepoint эмодзи (без variation selector U+FE0F).
const MAP: Record<string, LucideIcon> = {
  '\u{1F3E0}': Home, '\u{1F4CB}': ClipboardList, '\u{1F3E2}': Building2, '\u{1F4B0}': Wallet, '\u{1F4C4}': FileText,
  '\u{1F4B8}': TrendingDown, '\u{1F4D2}': BookText, '\u{1F4B3}': CreditCard, '✅': CheckSquare, '\u{1F3ED}': Factory,
  '\u{1F465}': Users, '\u{1F9FE}': Receipt, '\u{1F5C4}': Database, '\u{1F4CA}': BarChart3, '\u{1F4D6}': BookOpen, '⚙': Settings,
  '\u{1F697}': Car, '\u{1F195}': Sparkles, '\u{1F4C1}': Folder, '\u{1F4DC}': Scroll, '\u{1F6E0}': Wrench, '\u{1F6D2}': ShoppingCart,
  '⏰': Clock, '\u{1F5C2}': FolderArchive, '\u{1F4ED}': MailX, '\u{1F4F1}': Smartphone,
};

type Props = { e?: string; size?: number; style?: React.CSSProperties; className?: string };

export default function NavIcon({ e, size = 16, style, className }: Props) {
  const key = (e || '').replace(/️/g, '');
  const C = MAP[key] || Circle;
  return <C size={size} strokeWidth={1.75} aria-hidden focusable="false" style={style} className={className} />;
}

// Отделить эмодзи от текста пункта меню (для замены на SVG). Ищем среди известных
// иконок (все эмодзи меню есть в MAP) — без \p{}/u-флага (не поддержан таргетом TS).
export function splitLabel(label: string): { emoji?: string; text: string } {
  let emoji: string | undefined;
  let text = label;
  for (const key of Object.keys(MAP)) {
    if (text.indexOf(key) !== -1) {
      if (!emoji) emoji = key;
      text = text.split(key).join('');
    }
  }
  text = text.replace(/️/g, '').replace(/\s{2,}/g, ' ').trim();
  return { emoji, text };
}
