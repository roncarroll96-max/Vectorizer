import type { SVGProps } from 'react';

type P = SVGProps<SVGSVGElement>;
const b = (p: P) => ({
  width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8,
  strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true, ...p,
});

export const ISelect = (p: P) => <svg {...b(p)}><path d="M5 3l14 8-6 1.5L10 19z" /></svg>;
export const INode = (p: P) => <svg {...b(p)}><path d="M4 18C8 6 16 18 20 6" /><rect x="2.5" y="16.5" width="3" height="3" fill="currentColor" /><rect x="18.5" y="4.5" width="3" height="3" fill="currentColor" /><path d="M12 12l5-3" strokeDasharray="1.5 2" /><circle cx="17" cy="9" r="1.4" /></svg>;
export const IPen = (p: P) => <svg {...b(p)}><path d="M12 19l7-7 2 2-7 7z" /><path d="M18 13l-1.5-7.5L3 2l3.5 13.5L14 17z" /><path d="M3 2l7.6 7.6" /><circle cx="11" cy="11" r="2" /></svg>;
export const IRect = (p: P) => <svg {...b(p)}><rect x="4" y="5" width="16" height="14" rx="1.5" /></svg>;
export const IEllipse = (p: P) => <svg {...b(p)}><ellipse cx="12" cy="12" rx="9" ry="7" /></svg>;
export const ILine = (p: P) => <svg {...b(p)}><path d="M5 19L19 5" /></svg>;
export const IPolygon = (p: P) => <svg {...b(p)}><path d="M12 3l8.5 6.2-3.2 10H6.7L3.5 9.2z" /></svg>;
export const IText = (p: P) => <svg {...b(p)}><path d="M5 6V4h14v2M12 4v16M9 20h6" /></svg>;
export const IHand = (p: P) => <svg {...b(p)}><path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V12M11 11V4.5a1.5 1.5 0 0 1 3 0V12M14 11.5V6a1.5 1.5 0 0 1 3 0v8a7 7 0 0 1-7 7h-.5a6 6 0 0 1-5-2.7L3 15.5a1.5 1.5 0 0 1 2.4-1.8L8 16" /></svg>;
export const IUndo = (p: P) => <svg {...b(p)}><path d="M9 14L4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" /></svg>;
export const IRedo = (p: P) => <svg {...b(p)}><path d="M15 14l5-5-5-5" /><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13" /></svg>;
export const IMagnet = (p: P) => <svg {...b(p)}><path d="M6 15a6 6 0 0 0 12 0V4h-4v11a2 2 0 0 1-4 0V4H6z" /><path d="M6 8h4M14 8h4" /></svg>;
export const IKeyboard = (p: P) => <svg {...b(p)}><rect x="2" y="6" width="20" height="12" rx="2" /><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10" /></svg>;
export const IFile = (p: P) => <svg {...b(p)}><path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z" /><path d="M14 3v5h5M12 11v6M9 14h6" /></svg>;
export const IOpen = (p: P) => <svg {...b(p)}><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></svg>;
export const IDownload = (p: P) => <svg {...b(p)}><path d="M12 4v12m0 0-4-4m4 4 4-4M4 20h16" /></svg>;
export const ICopy = (p: P) => <svg {...b(p)}><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a1 1 0 0 1 1-1h10" /></svg>;
export const IImage = (p: P) => <svg {...b(p)}><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="10" r="2" /><path d="m21 16-5-5-9 9" /></svg>;
export const IEye = (p: P) => <svg {...b(p)}><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></svg>;
export const IEyeOff = (p: P) => <svg {...b(p)}><path d="M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4M6.6 6.6C3.9 8.4 2 12 2 12s3.6 7 10 7a9.6 9.6 0 0 0 5.4-1.6M9.9 9.9a3 3 0 0 0 4.2 4.2" /></svg>;
export const ILock = (p: P) => <svg {...b(p)}><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>;
export const IUnlock = (p: P) => <svg {...b(p)}><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 7.5-2" /></svg>;
export const IChevronR = (p: P) => <svg {...b(p)}><path d="m9 6 6 6-6 6" /></svg>;
export const IFolder = (p: P) => <svg {...b(p)}><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></svg>;
export const ITrash = (p: P) => <svg {...b(p)}><path d="M4 7h16M10 11v6M14 11v6M5 7l1 13h12l1-13M9 7V4h6v3" /></svg>;
export const IDuplicate = (p: P) => <svg {...b(p)}><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" /></svg>;
export const IGroup = (p: P) => <svg {...b(p)}><rect x="3" y="3" width="18" height="18" rx="2" strokeDasharray="3 2.5" /><rect x="7" y="7" width="6" height="6" /><rect x="11" y="11" width="6" height="6" /></svg>;
export const IUngroup = (p: P) => <svg {...b(p)}><rect x="3" y="3" width="8" height="8" /><rect x="13" y="13" width="8" height="8" /></svg>;
export const ISplit = (p: P) => <svg {...b(p)}><path d="M3 9a5 5 0 0 1 8-4M3 15a5 5 0 0 0 8 4" /><path d="M21 9a5 5 0 0 0-8-4M21 15a5 5 0 0 1-8 4" strokeDasharray="2.5 2" /><path d="M12 3v18" /></svg>;
export const ICombine = (p: P) => <svg {...b(p)}><rect x="3" y="3" width="11" height="11" rx="2" /><rect x="10" y="10" width="11" height="11" rx="2" fill="currentColor" fillOpacity=".35" /></svg>;
export const IToPath = (p: P) => <svg {...b(p)}><path d="M4 18C8 6 16 18 20 6" /><circle cx="4" cy="18" r="1.6" fill="currentColor" /><circle cx="20" cy="6" r="1.6" fill="currentColor" /></svg>;
export const IFront = (p: P) => <svg {...b(p)}><rect x="9" y="9" width="11" height="11" fill="currentColor" fillOpacity=".35" /><path d="M15 9V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h4" /></svg>;
export const IBack = (p: P) => <svg {...b(p)}><rect x="4" y="4" width="11" height="11" fill="currentColor" fillOpacity=".35" /><path d="M15 9h4a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1v-4" /></svg>;
export const IUp = (p: P) => <svg {...b(p)}><path d="M12 19V5M6 11l6-6 6 6" /></svg>;
export const IDown = (p: P) => <svg {...b(p)}><path d="M12 5v14M6 13l6 6 6-6" /></svg>;
export const IFlipH = (p: P) => <svg {...b(p)}><path d="M12 3v18" strokeDasharray="2 2" /><path d="M9 7 3 17h6zM15 7l6 10h-6z" /></svg>;
export const IFlipV = (p: P) => <svg {...b(p)}><path d="M3 12h18" strokeDasharray="2 2" /><path d="M7 9 17 3v6zM7 15l10 6v-6z" /></svg>;
export const IRotL = (p: P) => <svg {...b(p)}><path d="M4 12a8 8 0 1 0 2.3-5.7L4 8.5" /><path d="M4 4v4.5h4.5" /></svg>;
export const IRotR = (p: P) => <svg {...b(p)}><path d="M20 12a8 8 0 1 1-2.3-5.7L20 8.5" /><path d="M20 4v4.5h-4.5" /></svg>;
export const IAlignL = (p: P) => <svg {...b(p)}><path d="M4 3v18" /><rect x="7" y="6" width="12" height="4" /><rect x="7" y="14" width="7" height="4" /></svg>;
export const IAlignCH = (p: P) => <svg {...b(p)}><path d="M12 3v18" /><rect x="5" y="6" width="14" height="4" /><rect x="8" y="14" width="8" height="4" /></svg>;
export const IAlignR = (p: P) => <svg {...b(p)}><path d="M20 3v18" /><rect x="5" y="6" width="12" height="4" /><rect x="10" y="14" width="7" height="4" /></svg>;
export const IAlignT = (p: P) => <svg {...b(p)}><path d="M3 4h18" /><rect x="6" y="7" width="4" height="12" /><rect x="14" y="7" width="4" height="7" /></svg>;
export const IAlignCV = (p: P) => <svg {...b(p)}><path d="M3 12h18" /><rect x="6" y="5" width="4" height="14" /><rect x="14" y="8" width="4" height="8" /></svg>;
export const IAlignB = (p: P) => <svg {...b(p)}><path d="M3 20h18" /><rect x="6" y="5" width="4" height="12" /><rect x="14" y="10" width="4" height="7" /></svg>;
export const IZoomIn = (p: P) => <svg {...b(p)}><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4M11 8v6M8 11h6" /></svg>;
export const IZoomOut = (p: P) => <svg {...b(p)}><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4M8 11h6" /></svg>;
export const IFit = (p: P) => <svg {...b(p)}><path d="M4 9V5a1 1 0 0 1 1-1h4m6 0h4a1 1 0 0 1 1 1v4m0 6v4a1 1 0 0 1-1 1h-4m-6 0H5a1 1 0 0 1-1-1v-4" /></svg>;
export const IX = (p: P) => <svg {...b(p)}><path d="M18 6 6 18M6 6l12 12" /></svg>;
export const IChevronUp = (p: P) => <svg {...b(p)}><path d="m6 15 6-6 6 6" /></svg>;

import type { ToolId } from '../store';
export const TOOL_ICONS: Record<ToolId, (p: P) => JSX.Element> = {
  select: ISelect, node: INode, pen: IPen, rect: IRect, ellipse: IEllipse, line: ILine, polygon: IPolygon, text: IText, hand: IHand,
};
