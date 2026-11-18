/** Draws a small colourful demo image so the app can be tried without a file. */
export async function createSampleImage(): Promise<Blob> {
  const w = 640, h = 420;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  g.fillStyle = '#fbf7ef';
  g.fillRect(0, 0, w, h);
  // sun
  g.fillStyle = '#f6b93b';
  g.beginPath(); g.arc(470, 120, 70, 0, Math.PI * 2); g.fill();
  // mountains
  g.fillStyle = '#4a69bd';
  g.beginPath(); g.moveTo(0, 330); g.lineTo(170, 130); g.lineTo(300, 290); g.lineTo(390, 190); g.lineTo(640, 360); g.lineTo(640, 420); g.lineTo(0, 420); g.fill();
  g.fillStyle = '#fbf7ef';
  g.beginPath(); g.moveTo(170, 130); g.lineTo(205, 172); g.lineTo(182, 165); g.lineTo(165, 182); g.lineTo(142, 163); g.fill();
  // hills
  g.fillStyle = '#38ada9';
  g.beginPath(); g.moveTo(0, 360); g.bezierCurveTo(160, 300, 300, 400, 640, 330); g.lineTo(640, 420); g.lineTo(0, 420); g.fill();
  // ring + square
  g.strokeStyle = '#e55039'; g.lineWidth = 22;
  g.beginPath(); g.arc(110, 95, 48, 0, Math.PI * 2); g.stroke();
  g.fillStyle = '#e55039';
  g.save(); g.translate(560, 300); g.rotate(0.3); g.fillRect(-30, -30, 60, 60); g.restore();
  // text
  g.fillStyle = '#1e272e';
  g.font = 'bold 56px system-ui, sans-serif';
  g.fillText('Vectorize', 210, 395);
  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('Sample failed'))), 'image/png'));
}
