// The archive's sprite strips have no alpha channel: each uses a solid
// background color (it varies per file). Key out the top-left pixel's color
// once per image and cache the result as an object URL.

import { useEffect, useState } from "react";

const cache = new Map<string, Promise<string>>();

/** The image at `src` with its background color keyed out, as an object URL; once per image. */
export function keyedUrl(src: string): Promise<string> {
  let result = cache.get(src);
  if (!result) {
    result = new Promise<string>((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(img, 0, 0);
        const data = ctx.getImageData(0, 0, img.width, img.height);
        const px = data.data;
        const [r, g, b] = [px[0], px[1], px[2]];
        for (let i = 0; i < px.length; i += 4) {
          if (px[i] === r && px[i + 1] === g && px[i + 2] === b) px[i + 3] = 0;
        }
        ctx.putImageData(data, 0, 0);
        canvas.toBlob((blob) => (blob ? resolve(URL.createObjectURL(blob)) : reject(new Error("toBlob failed"))));
      };
      img.onerror = () => reject(new Error(`Failed to load ${src}`));
      img.src = src;
    });
    cache.set(src, result);
  }
  return result;
}

/** Returns the keyed image URL, or undefined while it is being processed. */
export function useKeyedSprite(src: string): string | undefined {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    let live = true;
    keyedUrl(src).then((u) => live && setUrl(u), () => live && setUrl(src));
    return () => {
      live = false;
    };
  }, [src]);
  return url;
}
