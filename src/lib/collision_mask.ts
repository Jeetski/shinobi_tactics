export type OpaqueBounds = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};

export type NormalizedBounds = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};

export type CollisionMask = {
  width: number;
  height: number;
  alphaThreshold: number;
  solid: Uint8Array;
  bounds: OpaqueBounds;
};

type CollisionSource = string | HTMLImageElement;
type PixelPredicate = (red: number, green: number, blue: number, alpha: number) => boolean;

export async function loadCollisionMask(
  source: CollisionSource,
  alphaThreshold = 8,
): Promise<CollisionMask> {
  const image = typeof source === 'string' ? await loadImage(source) : source;
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;

  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) {
    throw new Error('Could not create a 2D canvas context for collision mask generation.');
  }

  context.drawImage(image, 0, 0);
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);

  return buildCollisionMask(imageData, alphaThreshold);
}

export async function loadCollisionMaskWithPredicate(
  source: CollisionSource,
  predicate: PixelPredicate,
  alphaThreshold = 8,
): Promise<CollisionMask> {
  const image = typeof source === 'string' ? await loadImage(source) : source;
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;

  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) {
    throw new Error('Could not create a 2D canvas context for collision mask generation.');
  }

  context.drawImage(image, 0, 0);
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);

  return buildCollisionMaskWithPredicate(imageData, predicate, alphaThreshold);
}

export function buildCollisionMask(imageData: ImageData, alphaThreshold = 8): CollisionMask {
  return buildCollisionMaskWithPredicate(
    imageData,
    (_red, _green, _blue, alpha) => alpha >= alphaThreshold,
    alphaThreshold,
  );
}

export function buildCollisionMaskWithPredicate(
  imageData: ImageData,
  predicate: PixelPredicate,
  alphaThreshold = 8,
): CollisionMask {
  const { width, height, data } = imageData;
  const solid = new Uint8Array(width * height);
  let left = width;
  let right = -1;
  let top = height;
  let bottom = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      const red = data[index * 4];
      const green = data[index * 4 + 1];
      const blue = data[index * 4 + 2];
      const alpha = data[index * 4 + 3];

      if (alpha < alphaThreshold || !predicate(red, green, blue, alpha)) {
        continue;
      }

      solid[index] = 1;
      if (x < left) left = x;
      if (x > right) right = x;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
    }
  }

  if (right === -1 || bottom === -1) {
    left = 0;
    right = 0;
    top = 0;
    bottom = 0;
  }

  return {
    width,
    height,
    alphaThreshold,
    solid,
    bounds: { left, right, top, bottom },
  };
}

export function normalizeBounds(mask: CollisionMask): NormalizedBounds {
  const widthBase = Math.max(mask.width - 1, 1);
  const heightBase = Math.max(mask.height - 1, 1);

  return {
    left: mask.bounds.left / widthBase,
    right: mask.bounds.right / widthBase,
    top: mask.bounds.top / heightBase,
    bottom: mask.bounds.bottom / heightBase,
  };
}

export function getRenderedOpaqueBounds(
  mask: CollisionMask,
  renderedWidth: number,
  renderedHeight: number,
): OpaqueBounds {
  const normalized = normalizeBounds(mask);

  return {
    left: normalized.left * renderedWidth,
    right: normalized.right * renderedWidth,
    top: normalized.top * renderedHeight,
    bottom: normalized.bottom * renderedHeight,
  };
}

export function getContainedOpaqueBounds(
  mask: CollisionMask,
  containerWidth: number,
  containerHeight: number,
): OpaqueBounds {
  const fit = getContainFitBox(mask.width, mask.height, containerWidth, containerHeight);
  const opaque = getRenderedOpaqueBounds(mask, fit.width, fit.height);

  return {
    left: fit.x + opaque.left,
    right: fit.x + opaque.right,
    top: fit.y + opaque.top,
    bottom: fit.y + opaque.bottom,
  };
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Failed to load image: ${src}`));
    image.src = src;
  });
}

function getContainFitBox(
  sourceWidth: number,
  sourceHeight: number,
  containerWidth: number,
  containerHeight: number,
) {
  const scale = Math.min(containerWidth / sourceWidth, containerHeight / sourceHeight);
  const width = sourceWidth * scale;
  const height = sourceHeight * scale;

  return {
    x: (containerWidth - width) / 2,
    y: (containerHeight - height) / 2,
    width,
    height,
  };
}
