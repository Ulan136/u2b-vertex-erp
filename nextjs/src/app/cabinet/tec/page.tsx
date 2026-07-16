import type { Metadata } from 'next';
import CabinetForm from '@/components/CabinetForm';

// ТЭЦ client cabinet. Orders created here get source=tec and appear only on
// the ТЭЦ → Заявки screen (never in Выездная поверка).
// Own manifest so a ТЭЦ client installs a shortcut that opens /cabinet/tec.
export const metadata: Metadata = {
  manifest: '/cabinet-tec.webmanifest',
};

export default function CabinetTecPage() {
  return <CabinetForm source="tec" />;
}
