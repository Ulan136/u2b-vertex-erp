import CabinetForm from '@/components/CabinetForm';

// Public client cabinet (Выездная поверка). Orders created here get source=field_check.
export default function CabinetPage() {
  return <CabinetForm source="field_check" />;
}
