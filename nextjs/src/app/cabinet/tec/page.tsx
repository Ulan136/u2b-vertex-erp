import CabinetForm from '@/components/CabinetForm';

// ТЭЦ client cabinet. Orders created here get source=tec and appear only on
// the ТЭЦ → Заявки screen (never in Выездная поверка).
export default function CabinetTecPage() {
  return <CabinetForm source="tec" />;
}
