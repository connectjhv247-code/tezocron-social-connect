/**
 * Client-side image preparation helpers for profile pictures.
 * Downscales and compresses a gallery photo before it is uploaded,
 * so uploads are fast and images load quickly everywhere in the app.
 */

export interface PreparedImage {
  blob: Blob;
  contentType: string;
  hash: string;
}

const MAX_DIMENSION = 512;
const JPEG_QUALITY = 0.86;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not read the selected photo.'));
    img.src = src;
  });
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Could not read the selected photo.'));
    reader.readAsDataURL(file);
  });
}

async function sha256Hex(buffer: ArrayBuffer): Promise<string> {
  const subtle = typeof crypto !== 'undefined' ? crypto.subtle : undefined;
  if (!subtle) {
    // Deterministic lightweight fallback when SubtleCrypto is unavailable
    const bytes = new Uint8Array(buffer);
    let h1 = 0x811c9dc5;
    for (let i = 0; i < bytes.length; i++) {
      h1 ^= bytes[i];
      h1 = Math.imul(h1, 0x01000193) >>> 0;
    }
    return `${h1.toString(16)}${bytes.length.toString(16)}`;
  }
  const digest = await subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Downscales and compresses an image file, returning the bytes plus a
 * stable content hash used to avoid re-uploading an identical picture.
 */
export async function prepareProfileImage(file: File): Promise<PreparedImage> {
  const dataUrl = await readAsDataUrl(file);
  const img = await loadImage(dataUrl);

  let { width, height } = img;
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

  const blob: Blob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      (result) => (result ? resolve(result) : reject(new Error('Could not process the selected photo.'))),
      'image/jpeg',
      JPEG_QUALITY
    );
  });

  const hash = await sha256Hex(await blob.arrayBuffer());
  return { blob, contentType: 'image/jpeg', hash };
}
