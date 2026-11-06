// ================= Avatars: 12 built-in SVG presets plus optional uploads =================
const Avatars = (() => {
  const COLORS = ['#1f8fe0', '#e0322f', '#2f9e5b', '#8a4fd1', '#e08a1f', '#14868c', '#c2378a', '#4a5568', '#a0522d', '#2c64c8', '#6b8e23', '#c9a227'];
  const GLYPHS = ['\u2654', '\u2655', '\u2656', '\u2657', '\u2658', '\u2659', '\u265A', '\u265B', '\u265C', '\u265D', '\u265E', '\u265F'];
  const FONT = 'Segoe UI Symbol, Noto Sans Symbols 2, DejaVu Sans, Apple Symbols, serif';

  function presetSVG(n) {
    const i = Math.min(12, Math.max(1, n | 0)) - 1;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="${COLORS[i]}"/>` +
      `<circle cx="32" cy="32" r="23" fill="rgba(255,255,255,0.14)"/>` +
      `<text x="32" y="34" text-anchor="middle" dominant-baseline="middle" font-size="36" font-family="${FONT}" fill="#ffffff">${GLYPHS[i]}\uFE0E</text></svg>`;
  }
  const presetURL = (n) => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(presetSVG(n));

  // "preset:N" -> inline SVG; "upload:<uid>/avatar.webp?v=123" -> public Storage URL
  function src(avatar) {
    const a = String(avatar || '');
    let m = a.match(/^preset:(\d{1,2})$/);
    if (m && +m[1] >= 1 && +m[1] <= 12) return presetURL(+m[1]);
    m = a.match(/^upload:([A-Za-z0-9-]+\/avatar\.webp(?:\?v=\d+)?)$/);
    const base = (window.APP_CONFIG && window.APP_CONFIG.SUPABASE_URL) || '';
    if (m && base) return base.replace(/\/+$/, '') + '/storage/v1/object/public/avatars/' + m[1];
    return presetURL(1);
  }
  function img(avatar, size = 32, cls = '') {
    return `<img class="avatar ${cls}" src="${src(avatar).replace(/"/g, '&quot;')}" width="${size}" height="${size}" alt="">`;
  }

  // Crop to a centred square and resize to 256x256 WebP.
  function toWebP(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const im = new Image();
      im.onload = () => {
        const s = Math.min(im.naturalWidth, im.naturalHeight);
        const c = document.createElement('canvas'); c.width = c.height = 256;
        c.getContext('2d').drawImage(im, (im.naturalWidth - s) / 2, (im.naturalHeight - s) / 2, s, s, 0, 0, 256, 256);
        URL.revokeObjectURL(url);
        c.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not convert that image.'))), 'image/webp', 0.9);
      };
      im.onerror = () => { URL.revokeObjectURL(url); reject(new Error('That file is not an image we can read.')); };
      im.src = url;
    });
  }

  return { COUNT: 12, src, img, toWebP };
})();
