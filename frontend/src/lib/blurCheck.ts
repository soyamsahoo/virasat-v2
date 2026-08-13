/** Local image-quality pre-validation mirroring the server-side CV gate.
 *
 * Computes the variance of the Laplacian on a downsampled grayscale frame
 * exactly like the backend (threshold 100), so field agents are warned
 * about blurry captures before the rural network is ever used.
 */
export interface BlurReport {
  score: number;
  pass: boolean;
}

export async function checkBlur(source: Blob): Promise<BlurReport> {
  const bitmap = await createImageBitmap(source);
  const targetW = 160;
  const scale = targetW / bitmap.width;
  const targetH = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas 2D context unavailable");
  ctx.drawImage(bitmap, 0, 0, targetW, targetH);
  const data = ctx.getImageData(0, 0, targetW, targetH).data;

  const gray = new Float32Array(targetW * targetH);
  for (let i = 0; i < gray.length; i++) {
    gray[i] = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
  }

  const lap = new Float32Array(gray.length);
  const k = [
    [0, 1, 0],
    [1, -4, 1],
    [0, 1, 0],
  ];
  for (let y = 1; y < targetH - 1; y++) {
    for (let x = 1; x < targetW - 1; x++) {
      let acc = 0;
      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          acc += gray[(y + ky) * targetW + (x + kx)] * k[ky + 1][kx + 1];
        }
      }
      lap[y * targetW + x] = acc;
    }
  }

  let sum = 0;
  let sumSq = 0;
  let n = 0;
  for (let i = 0; i < lap.length; i++) {
    sum += lap[i];
    sumSq += lap[i] * lap[i];
    n++;
  }
  const mean = sum / n;
  const variance = sumSq / n - mean * mean;
  const score = Number(variance.toFixed(2));
  return { score, pass: score >= 100 };
}