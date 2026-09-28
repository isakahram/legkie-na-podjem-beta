import type { CSSProperties } from 'react';
import { skinDefinition } from '../skins/catalog';

/** Шарику достаточно знать id скина — остальные визуальные детали берутся из каталога. */
interface BalloonSkin { id: string; }

interface BalloonProps { skin?: BalloonSkin; className?: string; style?: CSSProperties; expression?: 'normal' | 'happy' | 'blush' | 'closed' | 'focused' | 'surprised'; }

export function Balloon({ skin, className = '', style, expression = 'happy' }: BalloonProps) {
  const definition = skinDefinition(skin?.id ?? 'berry');
  const patternId = `pattern-${definition.id}`;
  const face = expression === 'surprised' ? 'focused' : expression;
  return (
    <svg className={`balloon ${className}`} style={style} viewBox="0 0 126 181" role="img" aria-label={definition.name}>
      <defs>
        <linearGradient id={`body-${definition.id}`} x1="0" y1="0" x2="1" y2="1"><stop stopColor={definition.color} stopOpacity=".76" /><stop offset=".56" stopColor={definition.color} /><stop offset="1" stopColor={definition.accent} /></linearGradient>
        <radialGradient id={`shine-${definition.id}`} cx="34%" cy="20%"><stop stopColor="#fff" stopOpacity=".65" /><stop offset=".38" stopColor="#fff" stopOpacity=".12" /><stop offset="1" stopColor="#fff" stopOpacity="0" /></radialGradient>
        <pattern id={patternId} width="24" height="24" patternUnits="userSpaceOnUse">
          {definition.pattern === 'stripes' && <path d="M-6 6L6-6M0 24L24 0M18 30L30 18" stroke="#fff" strokeOpacity=".34" strokeWidth="7" />}
          {definition.pattern === 'dots' && <circle cx="6" cy="6" r="3.5" fill="#fff" fillOpacity=".38" />}
          {definition.pattern === 'clouds' && <path d="M2 17c2-5 8-5 10-1 4-7 13-4 12 3H2" fill="#fff" fillOpacity=".3" />}
          {definition.pattern === 'stars' && <path d="M12 2l2.2 6.5 6.8.2-5.4 4.1 1.8 6.7-5.4-3.9-5.4 3.9 1.8-6.7L3 8.7l6.8-.2z" fill="#fff" fillOpacity=".42" />}
          {definition.pattern === 'waves' && <path d="M0 8c6-6 12 6 18 0s12 6 18 0M0 20c6-6 12 6 18 0s12 6 18 0" fill="none" stroke="#fff" strokeOpacity=".35" strokeWidth="3" />}
          {definition.pattern === 'rainbow' && <path d="M0 24A24 24 0 0 1 48 24" fill="none" stroke="#fff" strokeOpacity=".45" strokeWidth="4" />}
        </pattern>
        <filter id={`glow-${definition.id}`}><feGaussianBlur stdDeviation="5" result="blur" /><feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
      </defs>
      {definition.effect === 'glow' && <ellipse className="balloon__glow" cx="63" cy="68" rx="55" ry="67" fill={definition.color} opacity=".38" filter={`url(#glow-${definition.id})`} />}
      <path d="M63 5C29 5 8 25 8 62c0 30 19 58 45 70l10 6 10-6c26-12 45-40 45-70C118 25 97 5 63 5Z" fill={`url(#body-${definition.id})`} />
      {definition.pattern && <path d="M63 5C29 5 8 25 8 62c0 30 19 58 45 70l10 6 10-6c26-12 45-40 45-70C118 25 97 5 63 5Z" fill={`url(#${patternId})`} />}
      <ellipse cx="63" cy="57" rx="53" ry="55" fill={`url(#shine-${definition.id})`} />
      {definition.effect === 'iridescent' && <path className="balloon__iridescent" d="M15 58Q63 15 111 58Q99 119 63 136Q27 119 15 58Z" fill={`url(#${patternId})`} opacity=".32" />}
      {definition.effect === 'sparkles' && <g fill="#fff"><path className="balloon__spark" d="M20 33l2 6 6 2-6 2-2 6-2-6-6-2 6-2z" /><path className="balloon__spark balloon__spark--b" d="M106 43l2 7 7 2-7 2-2 7-2-7-7-2 7-2z" /><path className="balloon__spark balloon__spark--c" d="M96 94l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" /></g>}
      <g fill={definition.accent}>
        {face === 'closed' ? <><path d="M35 69q6 6 12 0" fill="none" stroke={definition.accent} strokeWidth="3" /><path d="M79 69q6 6 12 0" fill="none" stroke={definition.accent} strokeWidth="3" /></> : <><ellipse cx="42" cy="68" rx="4" ry={face === 'focused' ? 6 : 5} /><ellipse cx="84" cy="68" rx="4" ry={face === 'focused' ? 6 : 5} /></>}
        {face === 'focused' ? <circle cx="63" cy="82" r="6" fill="none" stroke={definition.accent} strokeWidth="3" /> : <path d="M52 83q11 11 22 0" fill="none" stroke={definition.accent} strokeWidth="3" strokeLinecap="round" />}
      </g>
      {face === 'blush' && <g fill="#ee7182" opacity=".55"><ellipse cx="29" cy="81" rx="8" ry="4" /><ellipse cx="97" cy="81" rx="8" ry="4" /></g>}
      <path d="M53 135l10 11 10-11-10 5z" fill={definition.accent} /><path d="M63 146q-5 17 7 29" fill="none" stroke="#64708f" strokeWidth="2" />
    </svg>
  );
}
