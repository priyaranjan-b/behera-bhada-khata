"use client";

import { useEffect, useRef } from "react";
import SignaturePadLib from "signature_pad";

export interface SignaturePadHandle {
  isEmpty: () => boolean;
  clear: () => void;
  toPngDataUrl: () => string;
}

export default function SignaturePad({ onReady }: { onReady: (handle: SignaturePadHandle) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const padRef = useRef<SignaturePadLib | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = () => {
      const ratio = Math.max(window.devicePixelRatio || 1, 1);
      const { width, height } = canvas.getBoundingClientRect();
      canvas.width = width * ratio;
      canvas.height = height * ratio;
      canvas.getContext("2d")?.scale(ratio, ratio);
      padRef.current?.clear();
    };

    const pad = new SignaturePadLib(canvas, { backgroundColor: "#ffffff", penColor: "#111111" });
    padRef.current = pad;
    resize();
    window.addEventListener("resize", resize);

    onReady({
      isEmpty: () => pad.isEmpty(),
      clear: () => pad.clear(),
      toPngDataUrl: () => pad.toDataURL("image/png"),
    });

    return () => {
      window.removeEventListener("resize", resize);
      pad.off();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: "100%", height: 160, display: "block", touchAction: "none" }}
    />
  );
}
