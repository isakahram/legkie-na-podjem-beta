import { Wind } from 'lucide-react';
import { Link } from 'react-router-dom';

export function Brand({ to = '/' }: { to?: string }) {
  return (
    <Link to={to} className="brand" aria-label="Лёгкие на подъём — на главную">
      <span className="brand__mark"><Wind size={24} strokeWidth={2.4} /></span>
      <span className="brand__text">Лёгкие <b>на подъём</b></span>
    </Link>
  );
}
