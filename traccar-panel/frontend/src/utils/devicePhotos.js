const STORAGE_KEY = "devicePhotos";

function loadAll() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

export function getDevicePhoto(deviceId) {
  return loadAll()[String(deviceId)] || null;
}

export function getAllDevicePhotos() {
  return loadAll();
}

export function setDevicePhoto(deviceId, dataUrl) {
  const photos = loadAll();
  photos[String(deviceId)] = dataUrl;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(photos));
}

export function removeDevicePhoto(deviceId) {
  const photos = loadAll();
  delete photos[String(deviceId)];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(photos));
}

/**
 * Resize an image file to a square thumbnail before storing.
 * Returns a promise resolving to a base64 data URL.
 */
export function resizeImageFile(file, size = 96) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        // Center-crop to square
        const min = Math.min(img.width, img.height);
        const sx = (img.width - min) / 2;
        const sy = (img.height - min) / 2;
        ctx.drawImage(img, sx, sy, min, min, 0, 0, size, size);
        resolve(canvas.toDataURL("image/jpeg", 0.85));
      };
      img.onerror = reject;
      img.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
