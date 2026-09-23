/**
 * Client-side image preparation helpers for profile pictures.
 * A gallery photo is resized and compressed in the browser and kept as an
 * inline base64 image, so it can be saved and shown instantly.
 */

const MAX_DIMENSION = 300;
const BASE_QUALITY = 0.7;
const MAX_BYTES = 500 * 1024;

export function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Could not read the selected photo.'));
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not read the selected photo.'));
    img.src = src;
  });
}

function approxBytes(dataUrl: string): number {
  const base64 = dataUrl.split(',')[1] || '';
  return Math.ceil((base64.length * 3) / 4);
}

/**
 * Resizes a photo to at most 300x300 and compresses it until it is
 * comfortably under 500KB. Returns a ready-to-store base64 image string.
 */
export async function prepareProfileImageBase64(file: File): Promise<string> {
  const original = await toBase64(file);
  const img = await loadImage(original);

  let width = img.width;
  let height = img.height;
  if (width >= height && width > MAX_DIMENSION) {
    height = Math.round((height * MAX_DIMENSION) / width);
    width = MAX_DIMENSION;
  } else if (height > width && height > MAX_DIMENSION) {
    width = Math.round((width * MAX_DIMENSION) / height);
    height = MAX_DIMENSION;
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not process the selected photo.');
  ctx.drawImage(img, 0, 0, width, height);

  let quality = BASE_QUALITY;
  let dataUrl = canvas.toDataURL('image/jpeg', quality);
  while (approxBytes(dataUrl) > MAX_BYTES && quality > 0.3) {
    quality -= 0.1;
    dataUrl = canvas.toDataURL('image/jpeg', quality);
  }

  if (approxBytes(dataUrl) > MAX_BYTES) {
    throw new Error('That photo is too large to use. Please try a different one.');
  }

  return dataUrl;
}
