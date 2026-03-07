import React, { useRef } from "react";
import useTraccarStore from "../store/useTraccarStore.js";
import { resizeImageFile } from "../utils/devicePhotos.js";

export default function PhotoEditor({ deviceId }) {
  const inputRef = useRef(null);
  const photo = useTraccarStore((s) => s.devicePhotos[deviceId]);
  const { setDevicePhoto, removeDevicePhoto } = useTraccarStore();

  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await resizeImageFile(file, 96);
      setDevicePhoto(deviceId, dataUrl);
    } catch {
      // silently fail — user can retry
    }
    e.target.value = "";
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => inputRef.current?.click()}
        className="text-xs text-brand-500 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300 font-medium"
      >
        {photo ? "Change photo" : "Add photo"}
      </button>
      {photo && (
        <button
          onClick={() => removeDevicePhoto(deviceId)}
          className="text-xs text-gray-400 hover:text-red-500"
        >
          Remove
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        onChange={handleFile}
        className="hidden"
      />
    </div>
  );
}
