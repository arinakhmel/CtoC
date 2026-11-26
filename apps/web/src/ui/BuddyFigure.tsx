/** What «Лупик» holds: a different thing for each step of the deal. */
export type BuddyProp = 'magnifier' | 'glasses' | 'pen' | 'coin';

/** The character: a soft paper square with a face and one prop. Drawn inline, always decorative. */
export function BuddyFigure({ prop = 'magnifier', size = 64 }: { prop?: BuddyProp; size?: number }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden="true" className="buddy__svg">
      <rect x="8" y="14" width="40" height="40" rx="12" className="buddy__body" />
      <rect x="14" y="38" width="6" height="3" rx="1.5" className="buddy__cheek" />
      <rect x="34" y="38" width="6" height="3" rx="1.5" className="buddy__cheek" />
      {prop === 'glasses' ? (
        <g className="buddy__prop">
          <rect x="14" y="26" width="12" height="10" rx="4" className="buddy__lens-flat" />
          <rect x="30" y="26" width="12" height="10" rx="4" className="buddy__lens-flat" />
          <path d="M26 30 h4" className="buddy__line" />
          <rect x="19" y="29" width="3" height="5" rx="1.5" className="buddy__ink" />
          <rect x="35" y="29" width="3" height="5" rx="1.5" className="buddy__ink" />
        </g>
      ) : (
        <>
          <rect x="19" y="28" width="4" height="7" rx="2" className="buddy__ink" />
          <rect x="33" y="28" width="4" height="7" rx="2" className="buddy__ink" />
        </>
      )}
      <path d="M24 42 q4 3 8 0" className="buddy__line" />
      <path d="M26 14 q2 -6 6 -5" className="buddy__line" />
      {prop === 'magnifier' && (
        <g className="buddy__glass buddy__prop">
          <line x1="50" y1="44" x2="58" y2="54" className="buddy__handle" />
          <circle cx="46" cy="38" r="9" className="buddy__lens" />
          <path d="M41 35 q2 -3 5 -3" className="buddy__shine" />
        </g>
      )}
      {prop === 'pen' && (
        <g transform="rotate(35 52 40)">
          <g className="buddy__prop">
            <rect x="49" y="24" width="6" height="24" rx="1.5" className="buddy__pen" />
            <path d="M49 48 l3 6 l3 -6 z" className="buddy__pen-tip" />
            <rect x="49" y="24" width="6" height="4" className="buddy__pen-cap" />
          </g>
        </g>
      )}
      {prop === 'coin' && (
        <g className="buddy__prop">
          <circle cx="52" cy="42" r="9" className="buddy__coin" />
          <path d="M49 39.5 h6 M49 43 h6 M53 37 q-3 0 -3 3 v5 q0 2 3 2" className="buddy__coin-mark" />
        </g>
      )}
    </svg>
  );
}
