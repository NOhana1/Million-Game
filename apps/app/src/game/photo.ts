// Choosing a profile picture and cutting the small round photo out of it.
// The picture is kept at a modest size, so the player can adjust the framing again later.

export type PhotoCrop = { zoom: number; x: number; y: number }; // x and y as a share of the frame

export const NO_CROP: PhotoCrop = { zoom: 1, x: 0, y: 0 };
export const MOST_ZOOM = 4;

const ORIGINAL_SIDE = 720; // the longest side of the kept picture, in pixels
const PHOTO_SIDE = 160; // the photo everyone sees
const QUALITY = 0.8;

/** Keeps the picture covering the whole frame, however far it was dragged. */
export function clampCrop(crop: PhotoCrop, width: number, height: number): PhotoCrop {
  const zoom = Math.min(MOST_ZOOM, Math.max(1, crop.zoom));
  const short = Math.min(width, height);
  const room = (side: number) => ((side / short) * zoom - 1) / 2;
  const limit = (value: number, most: number) => Math.min(most, Math.max(-most, value));
  return { zoom, x: limit(crop.x, room(width)), y: limit(crop.y, room(height)) };
}

/** Where the picture sits in a square frame of `frame` pixels: shared by the editor and the cut. */
export function placement(crop: PhotoCrop, width: number, height: number, frame: number) {
  const scale = (frame / Math.min(width, height)) * crop.zoom;
  const shownWidth = width * scale;
  const shownHeight = height * scale;
  return {
    left: (frame - shownWidth) / 2 + crop.x * frame,
    top: (frame - shownHeight) / 2 + crop.y * frame,
    width: shownWidth,
    height: shownHeight,
  };
}

function load(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const picture = new globalThis.Image();
    picture.onload = () => resolve(picture);
    picture.onerror = reject;
    picture.src = url;
  });
}

function draw(picture: HTMLImageElement, width: number, height: number, place: (c: CanvasRenderingContext2D) => void) {
  const canvas = globalThis.document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (context) place(context);
  return canvas.toDataURL('image/jpeg', QUALITY);
}

/** Lets the player choose a picture. Resolves with it as a smaller JPEG, or null if they cancel. */
export function choosePhoto(): Promise<string | null> {
  const page = globalThis.document;
  if (!page) return Promise.resolve(null);

  return new Promise((resolve) => {
    const input = page.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.addEventListener('cancel', () => resolve(null));
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      const url = URL.createObjectURL(file);
      try {
        const picture = await load(url);
        const shrink = Math.min(1, ORIGINAL_SIDE / Math.max(picture.width, picture.height));
        const width = Math.round(picture.width * shrink);
        const height = Math.round(picture.height * shrink);
        resolve(draw(picture, width, height, (c) => c.drawImage(picture, 0, 0, width, height)));
      } catch {
        resolve(null);
      } finally {
        URL.revokeObjectURL(url);
      }
    });
    input.click();
  });
}

/** Cuts the small square photo out of the picture, framed the way the player chose. */
export async function cutPhoto(original: string, crop: PhotoCrop): Promise<string> {
  const picture = await load(original);
  const at = placement(clampCrop(crop, picture.width, picture.height), picture.width, picture.height, PHOTO_SIDE);
  return draw(picture, PHOTO_SIDE, PHOTO_SIDE, (c) => c.drawImage(picture, at.left, at.top, at.width, at.height));
}
