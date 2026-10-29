import type { SVGProps } from 'react';

const base = (props: SVGProps<SVGSVGElement>) => ({
  width: 20,
  height: 20,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
  ...props,
});

export const GalaxyIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M12 12c0-3 3.5-4.5 5.5-2.5S18 16 13.5 16.5 5 14 5 10s4-6.5 8.5-5.5" />
    <path d="M12 12c0 3-3.5 4.5-5.5 2.5S6 8 10.5 7.5 19 10 19 14s-4 6.5-8.5 5.5" opacity=".6" />
    <circle cx="12" cy="12" r="1.2" fill="currentColor" />
  </svg>
);

export const SkyIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M3 18h18" />
    <path d="M5 18a7 7 0 0 1 14 0" />
    <path d="M8 6l.5 1.5L10 8l-1.5.5L8 10l-.5-1.5L6 8l1.5-.5z" />
    <circle cx="17" cy="5" r=".8" fill="currentColor" />
  </svg>
);

export const ExploreIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <rect x="4" y="4" width="7" height="7" rx="1.5" />
    <rect x="13" y="4" width="7" height="7" rx="1.5" />
    <rect x="4" y="13" width="7" height="7" rx="1.5" />
    <circle cx="16.5" cy="16.5" r="3" />
    <path d="M18.7 18.7 21 21" />
  </svg>
);

export const SettingsIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
    <circle cx="16" cy="7" r="2" />
    <circle cx="10" cy="17" r="2" />
  </svg>
);

export const SearchIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <circle cx="11" cy="11" r="6" />
    <path d="m20 20-4.5-4.5" />
  </svg>
);

export const CloseIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M6 6l12 12M18 6 6 18" />
  </svg>
);

export const PlayIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M8 5.5v13l10-6.5z" fill="currentColor" stroke="none" />
  </svg>
);

export const PauseIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M8 5v14M16 5v14" strokeWidth={2.4} />
  </svg>
);

export const ReverseIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M11 6 5 12l6 6M19 6l-6 6 6 6" />
  </svg>
);

export const SlowerIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M6 12h12" />
  </svg>
);

export const FasterIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M6 12h12M12 6v12" />
  </svg>
);

export const ChevronIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="m15 6-6 6 6 6" />
  </svg>
);

export const DiceIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <rect x="4" y="4" width="16" height="16" rx="3" />
    <circle cx="9" cy="9" r="1.1" fill="currentColor" stroke="none" />
    <circle cx="15" cy="15" r="1.1" fill="currentColor" stroke="none" />
    <circle cx="15" cy="9" r="1.1" fill="currentColor" stroke="none" />
    <circle cx="9" cy="15" r="1.1" fill="currentColor" stroke="none" />
  </svg>
);

export const LinkIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" />
    <path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
  </svg>
);

export const StarIcon = ({ filled, ...p }: SVGProps<SVGSVGElement> & { filled?: boolean }) => (
  <svg {...base(p)}>
    <path d="M12 3.5l2.6 5.3 5.8.8-4.2 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.2-4.1 5.8-.8z" fill={filled ? 'currentColor' : 'none'} />
  </svg>
);

export const NextIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M7 6l7 6-7 6" />
    <path d="M17 6v12" />
  </svg>
);

export const PrevIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M17 6l-7 6 7 6" />
    <path d="M7 6v12" />
  </svg>
);
