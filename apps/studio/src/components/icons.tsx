import type { SVGProps } from 'react';

const base = (p: SVGProps<SVGSVGElement>) => ({
  width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
  strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true, ...p,
});

export const PlayIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M7 4.5v15l12.5-7.5z" fill="currentColor" stroke="none" /></svg>
);
export const PauseIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><rect x="6" y="4.5" width="4" height="15" rx="1" fill="currentColor" stroke="none" /><rect x="14" y="4.5" width="4" height="15" rx="1" fill="currentColor" stroke="none" /></svg>
);
export const RestartIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M5 5v14" /><path d="M19 5 9 12l10 7z" fill="currentColor" stroke="none" /></svg>
);
export const DownloadIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M12 4v11" /><path d="m7 10 5 5 5-5" /><path d="M5 20h14" /></svg>
);
export const DesktopIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><rect x="3" y="4" width="18" height="12" rx="1.5" /><path d="M9 20h6M12 16v4" /></svg>
);
export const LaptopIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><rect x="5" y="5" width="14" height="10" rx="1.2" /><path d="M3 19h18" /></svg>
);
export const TabletIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M11 18h2" /></svg>
);
export const PhoneIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><rect x="7" y="3" width="10" height="18" rx="2" /><path d="M11 18h2" /></svg>
);
export const ResetIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M4 12a8 8 0 1 0 2.4-5.7" /><path d="M4 4v4h4" /></svg>
);
export const UndoIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M9 14 4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" /></svg>
);
export const RedoIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="m15 14 5-5-5-5" /><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13" /></svg>
);
export const OpenIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></svg>
);
export const SaveIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M5 4h11l3 3v12a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1z" /><path d="M8 4v5h7V4M8 20v-6h8v6" /></svg>
);
/** The Unyson+ mark, as used across the AI Dev Kit. */
const UNYSONPLUS_MARK = 'M23.375 0c5.875 0 10.625 4.688 10.625 10.438v19.563l-4.969 2-5.031-2v-21.063c-0.031-1.188-0.281-1.563-1.188-2.188-0.906 0.594-0.75 1.063-0.813 2.188v13.063c-0.25 5.531-3.656 10-11.375 10-5.875 0-10.625-2.75-10.625-10v-20.031l4.969-1.969 5.031 2v19.469s-0.281 3.938 1.188 3.938c1.094-1.125 0.813-3.938 0.813-3.938v-11.469c0.25-5.531 5.688-10 11.375-10zM2.469 3.188l2.5 1.5 2.219-1.313-2.219-1.219zM9.281 30.031c6.688 0 6.5-8.156 6.5-8.156-0.031-0.281 0.219-11.563 0.219-11.875 0-3.781 1.688-6.094 3.75-7.719-2.875 1.438-5.594 4.375-5.75 7.719v13.75c-0.219 2.563-2.156 4.25-4.781 4.25-2.875 0-5.063-2.531-5.219-5.5v-15.875l-2-1.375v16.75s-0.188 6.813 5.75 7.875c0.5 0.094 1.031 0.156 1.531 0.156zM32 28.625v-18.625c0-4-2.125-6.063-5.781-7.281-0.469-0.094-1-0.156-1.5-0.156-4.219 0-6.719 3.281-6.719 7.438v12.219c0 3.094-1.344 6.969-4 7.781 4.531-1.344 6-4.938 6-8v-13.375c0.219-2.563 2.125-4.25 4.781-4.25s5 1.688 5.219 4.25v20.875zM8.938 26l0.375-0.031c-0.75-0.406-1.281-1.188-1.313-2.75v-17.969l-2 1.375v14.844s0.313 4.531 2.938 4.531zM28 29.5v-20.563c-0.125-1.813-1.313-2.781-3.219-2.781l-0.375 0.031c0.875 0.875 1.563 1.438 1.594 2.75v19.688z';

export const Logo = () => (
  <span className="mark" aria-hidden="true">
    <svg viewBox="0 0 34 32" fill="#ffffff"><path d={UNYSONPLUS_MARK} /></svg>
  </span>
);
