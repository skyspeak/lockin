import { useRef, useState, type ReactNode } from "react";

type SwipeTaskProps = {
  onDone: () => void;
  onDelete: () => void;
  children: ReactNode;
};

export function SwipeTask({ onDone, onDelete, children }: SwipeTaskProps) {
  const startX = useRef(0);
  const dragging = useRef(false);
  const [dx, setDx] = useState(0);

  const reset = () => {
    dragging.current = false;
    setDx(0);
  };

  return (
    <div className="relative overflow-hidden rounded-2xl">
      <div className="pointer-events-none absolute inset-0 flex">
        <div className="flex flex-1 items-center bg-[#5d7a4a] px-4 text-sm font-semibold text-white">
          Done
        </div>
        <div className="flex flex-1 items-center justify-end bg-[#c0392b] px-4 text-sm font-semibold text-white">
          Delete
        </div>
      </div>
      <div
        className="relative bg-white"
        style={{ transform: `translateX(${dx}px)`, transition: dragging.current ? "none" : "transform 160ms ease" }}
        onPointerDown={(e) => {
          dragging.current = true;
          startX.current = e.clientX;
          (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (!dragging.current) return;
          const next = Math.max(-140, Math.min(140, e.clientX - startX.current));
          setDx(next);
        }}
        onPointerUp={() => {
          if (dx > 72) onDone();
          else if (dx < -72) onDelete();
          reset();
        }}
        onPointerCancel={reset}
      >
        {children}
      </div>
    </div>
  );
}
