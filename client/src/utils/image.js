// Client-side image compression: returns JPEG data URLs small enough to store in a Firestore doc.
const MAX_CHARS = 950000; // under the 1 MiB Firestore document limit, with headroom

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('bad image')); };
    img.src = url;
  });
}

function draw(img, maxSide) {
  const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff'; // flatten transparent PNGs onto white
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  return canvas;
}

function encode(img, maxSide, quality) {
  let side = maxSide;
  let q = quality;
  let data = draw(img, side).toDataURL('image/jpeg', q);
  while (data.length > MAX_CHARS && (q > 0.45 || side > 600)) {
    if (q > 0.45) q -= 0.1;
    else side = Math.round(side * 0.8);
    data = draw(img, side).toDataURL('image/jpeg', q);
  }
  return data;
}

export async function compressImage(file) {
  const img = await loadImage(file);
  return {
    full: encode(img, 1600, 0.82),
    thumb: encode(img, 420, 0.7),
    width: img.naturalWidth,
    height: img.naturalHeight,
    name: file.name || '',
  };
}
