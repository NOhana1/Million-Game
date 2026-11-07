// Lets a player choose a picture, then shrinks it to a small square JPEG,
// so it's quick to send and costs little to store.

const SIDE = 160; // pixels on each side
const QUALITY = 0.8;

/** Resolves with the picture as a data URL, or null if the player cancels or it can't be read. */
export function choosePhoto(): Promise<string | null> {
  const page = globalThis.document;
  if (!page) return Promise.resolve(null);

  return new Promise((resolve) => {
    const input = page.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.addEventListener('cancel', () => resolve(null));
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      const url = URL.createObjectURL(file);
      const picture = new globalThis.Image();
      picture.onload = () => {
        // Keep the middle square, so a tall or wide picture isn't squashed.
        const side = Math.min(picture.width, picture.height);
        const canvas = page.createElement('canvas');
        canvas.width = SIDE;
        canvas.height = SIDE;
        canvas
          .getContext('2d')
          ?.drawImage(picture, (picture.width - side) / 2, (picture.height - side) / 2, side, side, 0, 0, SIDE, SIDE);
        URL.revokeObjectURL(url);
        resolve(canvas.toDataURL('image/jpeg', QUALITY));
      };
      picture.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(null);
      };
      picture.src = url;
    });
    input.click();
  });
}
