"use client";

import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";

/**
 * Live camera view that reads QR codes in the page, so a phone is enough to
 * run the till. Keeps scanning after each read; the same tag is ignored for
 * a few seconds so holding it in frame doesn't add it twice. Needs HTTPS
 * (or localhost) for the browser to allow the camera at all.
 */
export function CameraScanner({ onCode, onClose }: { onCode: (code: string) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState<string>("Starting camera…");
  const [flash, setFlash] = useState<string | null>(null);
  const onCodeRef = useRef(onCode);
  onCodeRef.current = onCode;

  useEffect(() => {
    let stream: MediaStream | null = null;
    let raf = 0;
    let stopped = false;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const recent = new Map<string, number>();

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setStatus("This browser can't open the camera here. Use the code under the QR instead.");
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
      } catch {
        setStatus("Camera permission was refused. Allow it in the browser, or type the code instead.");
        return;
      }
      const video = videoRef.current;
      if (!video || stopped) return;
      video.srcObject = stream;
      await video.play();
      setStatus("Hold a tag's QR in view.");
      let last = 0;
      const tick = (now: number) => {
        if (stopped) return;
        raf = requestAnimationFrame(tick);
        if (now - last < 120 || !ctx || video.readyState < 2) return;
        last = now;
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0);
        const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const found = jsQR(image.data, image.width, image.height, { inversionAttempts: "dontInvert" });
        if (!found?.data) return;
        const seen = recent.get(found.data) ?? 0;
        if (now - seen < 4000) return;
        recent.set(found.data, now);
        setFlash(found.data.split("/").pop() ?? found.data);
        setTimeout(() => setFlash(null), 1200);
        onCodeRef.current(found.data);
      };
      raf = requestAnimationFrame(tick);
    }
    start();

    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return (
    <div className="space-y-3">
      <div className="relative overflow-hidden rounded-lg bg-black">
        <video ref={videoRef} playsInline muted className="aspect-[4/3] w-full object-cover" />
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="h-44 w-44 rounded-lg border-2 border-white/70" />
        </div>
        {flash && (
          <div className="absolute inset-x-0 bottom-0 bg-white/90 py-2 text-center text-sm tracking-widest text-neutral-900">
            Added {flash}
          </div>
        )}
      </div>
      <p className="text-center text-xs text-neutral-500">{status}</p>
      <button
        type="button"
        onClick={onClose}
        className="w-full rounded-full border border-neutral-300 py-3 text-sm uppercase tracking-wide text-neutral-700"
      >
        Close camera
      </button>
    </div>
  );
}
