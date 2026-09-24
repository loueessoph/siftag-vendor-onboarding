"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import jsQR from "jsqr";

/**
 * Live camera view that reads QR codes in the page, so a phone is enough to
 * run the till. Keeps scanning after each read; the same tag is ignored for
 * a few seconds so holding it in frame doesn't add it twice. Needs HTTPS
 * (or localhost) for the browser to allow the camera at all.
 */

type Problem = {
  title: string;
  detail: string;
  /** Whether asking again can help; false when the page itself can't use a camera. */
  retryable: boolean;
};

function describe(err: unknown): Problem {
  const name = (err as { name?: string })?.name ?? "";
  if (name === "NotAllowedError" || name === "SecurityError") {
    return {
      title: "Camera is blocked for this site.",
      detail: isIOS()
        ? "Tap Try again and choose Allow. If nothing pops up, tap the “AA” (or “…”) button in Safari's address bar, open Website Settings, set Camera to Allow, then try again."
        : "Tap Try again and choose Allow. If nothing pops up, tap the lock icon next to the address, turn Camera on, then try again.",
      retryable: true,
    };
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") {
    return { title: "No camera was found on this device.", detail: "Type the code under the QR instead.", retryable: true };
  }
  if (name === "NotReadableError" || name === "AbortError") {
    return {
      title: "Another app is using the camera.",
      detail: "Close the other app or tab that has the camera open, then try again.",
      retryable: true,
    };
  }
  return { title: "The camera didn't start.", detail: "Try again, or type the code under the QR instead.", retryable: true };
}

function isIOS() {
  return typeof navigator !== "undefined" && /iPhone|iPad|iPod/.test(navigator.userAgent);
}

export function CameraScanner({ onCode, onClose }: { onCode: (code: string) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState<string>("Starting camera…");
  const [problem, setProblem] = useState<Problem | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  // Bumping this re-runs the effect, which asks the browser for the camera again.
  const [attempt, setAttempt] = useState(0);
  const onCodeRef = useRef(onCode);
  onCodeRef.current = onCode;

  const retry = useCallback(() => {
    setProblem(null);
    setStatus("Starting camera…");
    setAttempt((n) => n + 1);
  }, []);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let raf = 0;
    let stopped = false;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const recent = new Map<string, number>();

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        // Browsers only expose the camera on HTTPS (or localhost). A LAN
        // address or plain http never will, however many times we ask.
        const insecure = typeof window !== "undefined" && !window.isSecureContext;
        setProblem({
          title: insecure ? "The camera only works on the secure address." : "This browser can't open the camera.",
          detail: insecure
            ? "Open this page at https://popup.siftag.com instead of the http address, or type the code under the QR."
            : "Try Safari or Chrome, or type the code under the QR instead.",
          retryable: false,
        });
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
      } catch (err) {
        if (!stopped) setProblem(describe(err));
        return;
      }
      const video = videoRef.current;
      if (!video || stopped) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      video.srcObject = stream;
      try {
        await video.play();
      } catch {
        if (!stopped) setProblem({ title: "The camera didn't start.", detail: "Try again, or type the code instead.", retryable: true });
        return;
      }
      setStatus("Hold the QR in view.");
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
  }, [attempt]);

  return (
    <div className="space-y-3">
      <div className="relative overflow-hidden rounded-lg bg-black">
        <video ref={videoRef} playsInline muted className="aspect-[4/3] w-full object-cover" />
        {!problem && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="h-44 w-44 rounded-lg border-2 border-white/70" />
          </div>
        )}
        {problem && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-neutral-900/95 px-5 text-center text-white">
            <p className="text-sm font-medium">{problem.title}</p>
            <p className="text-xs leading-relaxed text-neutral-300">{problem.detail}</p>
            {problem.retryable && (
              <button
                type="button"
                onClick={retry}
                className="mt-1 rounded-full bg-white px-5 py-2 text-[11px] uppercase tracking-[0.15em] text-neutral-900"
              >
                Try again
              </button>
            )}
          </div>
        )}
        {flash && (
          <div className="absolute inset-x-0 bottom-0 bg-white/90 py-2 text-center text-sm tracking-widest text-neutral-900">
            Added {flash}
          </div>
        )}
      </div>
      {!problem && <p className="text-center text-xs text-neutral-500">{status}</p>}
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
