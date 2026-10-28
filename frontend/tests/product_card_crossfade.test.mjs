import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

// State machine simulating ProductCard.tsx image logic
function computeProductCardImages({
  product,
  primaryError = false,
  secondaryError = false,
  secondaryLoaded = false,
}) {
  const toImageUrl = (url) => {
    if (!url) return null;
    if (/\.(mp4|webm|mov|ogg|mkv)(\?.*)?$/i.test(url)) {
      return url.replace(/\.(mp4|webm|mov|ogg|mkv)(\?.*)?$/i, '.jpg');
    }
    return url;
  };

  const pureImageUrls = (product.images || [])
    .map((img) => img.url)
    .filter((url) => !/\.(mp4|webm|mov|ogg|mkv)(\?.*)?$/i.test(url));

  const rawPrimary =
    toImageUrl(product.primary_image) ||
    pureImageUrls[0] ||
    (product.images && product.images.length > 0 ? toImageUrl(product.images[0].url) : null);

  const rawSecondary =
    pureImageUrls.length > 1
      ? pureImageUrls[1]
      : (product.images && product.images.length > 1 ? toImageUrl(product.images[1].url) : null);

  const primaryImage = !primaryError
    ? rawPrimary
    : (!secondaryError ? rawSecondary : null);

  const secondaryImage = (!primaryError && !secondaryError && rawSecondary && rawSecondary !== rawPrimary)
    ? rawSecondary
    : null;

  const hasSecondary = Boolean(primaryImage && secondaryImage);
  const canCrossfade = Boolean(hasSecondary && secondaryLoaded);

  const shouldRenderPlaceholder = !primaryImage;

  return {
    rawPrimary,
    rawSecondary,
    primaryImage,
    secondaryImage,
    hasSecondary,
    canCrossfade,
    shouldRenderPlaceholder,
  };
}

describe('ProductCard Image Crossfade & Robust Fallback Tests', () => {
  const twoImageProduct = {
    id: 1,
    name: 'Riwayat Festive Kurti',
    slug: 'riwayat-festive-kurti',
    primary_image: 'https://res.cloudinary.com/demo/image/upload/v1/primary.jpg',
    images: [
      { id: 101, url: 'https://res.cloudinary.com/demo/image/upload/v1/primary.jpg', sort_order: 1 },
      { id: 102, url: 'https://res.cloudinary.com/demo/image/upload/v1/secondary.jpg', sort_order: 2 },
    ],
  };

  const oneImageProduct = {
    id: 2,
    name: 'Gulabi Rooh Kurti',
    slug: 'gulabi-rooh-kurti',
    primary_image: 'https://res.cloudinary.com/demo/image/upload/v1/single.jpg',
    images: [
      { id: 201, url: 'https://res.cloudinary.com/demo/image/upload/v1/single.jpg', sort_order: 1 },
    ],
  };

  const videoProduct = {
    id: 3,
    name: 'Zari Mahal Anarkali',
    slug: 'zari-mahal-anarkali',
    primary_image: 'https://res.cloudinary.com/demo/image/upload/v1/photo.jpg',
    images: [
      { id: 301, url: 'https://res.cloudinary.com/demo/image/upload/v1/photo.jpg', sort_order: 1 },
      { id: 302, url: 'https://res.cloudinary.com/demo/video/upload/v1/drape.mp4', sort_order: 2 },
    ],
  };

  test('1. Successful desktop hover crossfade when secondary image finishes loading', () => {
    // Before secondary image finishes loading in DOM
    const initial = computeProductCardImages({
      product: twoImageProduct,
      primaryError: false,
      secondaryError: false,
      secondaryLoaded: false,
    });
    assert.equal(initial.primaryImage, 'https://res.cloudinary.com/demo/image/upload/v1/primary.jpg');
    assert.equal(initial.secondaryImage, 'https://res.cloudinary.com/demo/image/upload/v1/secondary.jpg');
    assert.equal(initial.hasSecondary, true);
    // Crucial fix: canCrossfade is FALSE until secondaryLoaded is true, so no blank flash
    assert.equal(initial.canCrossfade, false);
    assert.equal(initial.shouldRenderPlaceholder, false);

    // After secondary image loads (onLoad event fires)
    const loaded = computeProductCardImages({
      product: twoImageProduct,
      primaryError: false,
      secondaryError: false,
      secondaryLoaded: true,
    });
    assert.equal(loaded.hasSecondary, true);
    assert.equal(loaded.canCrossfade, true);
  });

  test('2. Graceful fallback when secondary image fails to load', () => {
    const res = computeProductCardImages({
      product: twoImageProduct,
      primaryError: false,
      secondaryError: true, // secondary failed
      secondaryLoaded: false,
    });
    assert.equal(res.primaryImage, 'https://res.cloudinary.com/demo/image/upload/v1/primary.jpg');
    assert.equal(res.secondaryImage, null);
    assert.equal(res.hasSecondary, false);
    assert.equal(res.canCrossfade, false);
    assert.equal(res.shouldRenderPlaceholder, false);
  });

  test('3. Primary image fails: promotes secondary image to primary without blank card', () => {
    const res = computeProductCardImages({
      product: twoImageProduct,
      primaryError: true,
      secondaryError: false,
      secondaryLoaded: false,
    });
    assert.equal(res.primaryImage, 'https://res.cloudinary.com/demo/image/upload/v1/secondary.jpg');
    assert.equal(res.secondaryImage, null);
    assert.equal(res.hasSecondary, false);
    assert.equal(res.canCrossfade, false);
    assert.equal(res.shouldRenderPlaceholder, false);
  });

  test('4. Both primary and secondary images fail: displays branded luxury placeholder', () => {
    const res = computeProductCardImages({
      product: twoImageProduct,
      primaryError: true,
      secondaryError: true,
    });
    assert.equal(res.primaryImage, null);
    assert.equal(res.secondaryImage, null);
    assert.equal(res.hasSecondary, false);
    assert.equal(res.canCrossfade, false);
    assert.equal(res.shouldRenderPlaceholder, true);
  });

  test('5. Single image product: no crossfade and stable display', () => {
    const res = computeProductCardImages({
      product: oneImageProduct,
      primaryError: false,
      secondaryError: false,
    });
    assert.equal(res.primaryImage, 'https://res.cloudinary.com/demo/image/upload/v1/single.jpg');
    assert.equal(res.secondaryImage, null);
    assert.equal(res.hasSecondary, false);
    assert.equal(res.canCrossfade, false);
    assert.equal(res.shouldRenderPlaceholder, false);
  });

  test('6. Video gallery items: automatically transformed to jpg posters', () => {
    const res = computeProductCardImages({
      product: videoProduct,
      primaryError: false,
      secondaryError: false,
      secondaryLoaded: true,
    });
    assert.equal(res.primaryImage, 'https://res.cloudinary.com/demo/image/upload/v1/photo.jpg');
    assert.equal(res.secondaryImage, 'https://res.cloudinary.com/demo/video/upload/v1/drape.jpg');
    assert.equal(res.hasSecondary, true);
    assert.equal(res.canCrossfade, true);
  });
});

