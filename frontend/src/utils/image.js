// Resize + compress an image in the browser before uploading.
//
// Why this exists: phone cameras produce 4-12 MB images, base64 encoding
// inflates that by another ~33%, and Netlify Functions cap request bodies
// at roughly 6 MB. Downscaling to a sane display size first keeps typical
// uploads in the low hundreds of KB, which also makes the public showcase
// pages load quickly on mobile data.

const MAX_DIMENSION = 1600;
const QUALITY = 0.82;

export function resizeImage(file, { maxDimension = MAX_DIMENSION, quality = QUALITY } = {}) {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('That file isn’t an image.'));
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read that file.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Could not open that image — it may be corrupted.'));
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDimension || height > maxDimension) {
          const scale = Math.min(maxDimension / width, maxDimension / height);
          width = Math.round(width * scale);
          height = Math.round(height * scale);
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        // Always emit JPEG: it's the smallest of the allowed types for
        // photos, and normalising the type means the backend never has to
        // deal with HEIC/other formats the browser decoded for us.
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        resolve({ data: dataUrl.split(',')[1], contentType: 'image/jpeg' });
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}
