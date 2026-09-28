import type { CSSProperties } from 'react';
import type { Skin } from '../types';

interface BalloonProps {
  skin?: Pick<Skin, 'color' | 'accent'>;
  className?: string;
  style?: CSSProperties;
  expression?: 'happy' | 'focused' | 'surprised';
}

export function Balloon({
  skin = { color: '#ff6b8b', accent: '#8f3156' },
  className = '',
  style,
  expression = 'happy',
}: BalloonProps) {
  return (
    <div className={`balloon ${className}`} style={{ '--balloon': skin.color, '--accent': skin.accent, ...style } as CSSProperties} aria-hidden="true">
      <div className="balloon__shine" />
      <div className="balloon__face">
        <i className="balloon__eye" />
        <span className={`balloon__mouth balloon__mouth--${expression}`} />
        <i className="balloon__eye" />
      </div>
      <div className="balloon__knot" />
      <div className="balloon__string" />
    </div>
  );
}
