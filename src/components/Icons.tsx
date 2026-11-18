import type { SVGProps } from 'react';

type P = SVGProps<SVGSVGElement>;
const base = (p: P) => ({
  width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
  strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true, ...p,
});

export const IconUpload = (p: P) => <svg {...base(p)}><path d="M12 16V4m0 0-4 4m4-4 4 4M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" /></svg>;
export const IconDownload = (p: P) => <svg {...base(p)}><path d="M12 4v12m0 0-4-4m4 4 4-4M4 20h16" /></svg>;
export const IconCopy = (p: P) => <svg {...base(p)}><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a1 1 0 0 1 1-1h10" /></svg>;
export const IconImage = (p: P) => <svg {...base(p)}><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="10" r="2" /><path d="m21 16-5-5-9 9" /></svg>;
export const IconSun = (p: P) => <svg {...base(p)}><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>;
export const IconMoon = (p: P) => <svg {...base(p)}><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" /></svg>;
export const IconMonitor = (p: P) => <svg {...base(p)}><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M8 20h8m-4-4v4" /></svg>;
export const IconZoomIn = (p: P) => <svg {...base(p)}><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4M11 8v6M8 11h6" /></svg>;
export const IconZoomOut = (p: P) => <svg {...base(p)}><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4M8 11h6" /></svg>;
export const IconFit = (p: P) => <svg {...base(p)}><path d="M4 9V5a1 1 0 0 1 1-1h4m6 0h4a1 1 0 0 1 1 1v4m0 6v4a1 1 0 0 1-1 1h-4m-6 0H5a1 1 0 0 1-1-1v-4" /></svg>;
export const IconColumns = (p: P) => <svg {...base(p)}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M12 4v16" /></svg>;
export const IconSlider = (p: P) => <svg {...base(p)}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M12 2v20" /><path d="m9 10-2 2 2 2m6-4 2 2-2 2" /></svg>;
export const IconNodes = (p: P) => <svg {...base(p)}><path d="M5 19C7 9 17 15 19 5" /><rect x="3" y="17" width="4" height="4" /><rect x="17" y="3" width="4" height="4" /></svg>;
export const IconEye = (p: P) => <svg {...base(p)}><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></svg>;
export const IconEyeOff = (p: P) => <svg {...base(p)}><path d="M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4M6.6 6.6C3.9 8.4 2 12 2 12s3.6 7 10 7a9.6 9.6 0 0 0 5.4-1.6M9.9 9.9a3 3 0 0 0 4.2 4.2" /></svg>;
export const IconPipette = (p: P) => <svg {...base(p)}><path d="m14 4 6 6M17 7l-9.5 9.5L4 20l3.5-3.5M12.5 6.5l5 5" /></svg>;
export const IconReset = (p: P) => <svg {...base(p)}><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /></svg>;
export const IconX = (p: P) => <svg {...base(p)}><path d="M18 6 6 18M6 6l12 12" /></svg>;
export const IconChevron = (p: P) => <svg {...base(p)}><path d="m6 15 6-6 6 6" /></svg>;
export const IconSliders = (p: P) => <svg {...base(p)}><path d="M4 6h10m4 0h2M4 12h4m4 0h8M4 18h12m4 0h0" /><circle cx="16" cy="6" r="2" /><circle cx="10" cy="12" r="2" /><circle cx="18" cy="18" r="2" /></svg>;
export const IconEdit = (p: P) => <svg {...base(p)}><path d="M4 20h4L19 9l-4-4L4 16z" /><path d="m13.5 6.5 4 4" /></svg>;
