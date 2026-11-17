import { notFound } from 'next/navigation';

/** As 9 etapas têm página própria; qualquer outro endereço é inválido. */
export default function EtapaInvalida() {
  notFound();
}
