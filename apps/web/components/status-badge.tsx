import type { StatusItem } from '@yt/shared';
import { Badge } from '@/components/ui/badge';

const ROTULO: Record<StatusItem, string> = {
  pendente: 'Pendente',
  gerado: 'Gerado',
  aprovado: 'Aprovado',
  desatualizado: 'Desatualizado',
};

export function StatusBadge({ status, temArquivo }: { status: StatusItem; temArquivo: boolean }) {
  // Sem arquivo, o status "gerado" não faz sentido: mostra pendente.
  const s: StatusItem = !temArquivo && status !== 'desatualizado' ? 'pendente' : status;
  const variant = s === 'aprovado' ? 'success' : s === 'desatualizado' ? 'warning' : s === 'gerado' ? 'ai' : 'default';
  return <Badge variant={variant}>{ROTULO[s]}</Badge>;
}
