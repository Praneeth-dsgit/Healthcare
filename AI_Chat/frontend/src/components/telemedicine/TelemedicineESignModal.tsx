import React, { useRef, useState } from 'react';
import { PenLine, X } from 'lucide-react';

interface TelemedicineESignModalProps {
  open: boolean;
  onClose: () => void;
  onSign: () => void;
}

const TelemedicineESignModal: React.FC<TelemedicineESignModalProps> = ({ open, onClose, onSign }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [drawing, setDrawing] = useState(false);
  const [hasStroke, setHasStroke] = useState(false);

  if (!open) return null;

  const getPos = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    if ('touches' in e) {
      return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
    }
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const startDraw = (e: React.MouseEvent | React.TouchEvent) => {
    setDrawing(true);
    const ctx = canvasRef.current?.getContext('2d');
    const { x, y } = getPos(e);
    ctx?.beginPath();
    ctx?.moveTo(x, y);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!drawing) return;
    const ctx = canvasRef.current?.getContext('2d');
    const { x, y } = getPos(e);
    if (ctx) {
      ctx.strokeStyle = '#2dd4bf';
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.lineTo(x, y);
      ctx.stroke();
      setHasStroke(true);
    }
  };

  const clear = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (canvas && ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      setHasStroke(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4">
      <div className="premium-card w-full max-w-md p-6">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <PenLine className="h-5 w-5 text-teal-300" />
            <h3 className="font-bold text-slate-100">E-Sign Prescription</h3>
          </div>
          <button type="button" onClick={onClose} className="ghost-button rounded-lg p-1">
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="mb-3 text-sm text-slate-400">Sign below to authorize this prescription</p>
        <canvas
          ref={canvasRef}
          width={360}
          height={140}
          className="w-full cursor-crosshair rounded-xl border border-slate-600 bg-slate-950"
          onMouseDown={startDraw}
          onMouseMove={draw}
          onMouseUp={() => setDrawing(false)}
          onMouseLeave={() => setDrawing(false)}
          onTouchStart={startDraw}
          onTouchMove={draw}
          onTouchEnd={() => setDrawing(false)}
        />
        <div className="mt-4 flex gap-2">
          <button type="button" onClick={clear} className="ghost-button flex-1 rounded-xl py-2 text-sm">
            Clear
          </button>
          <button
            type="button"
            disabled={!hasStroke}
            onClick={onSign}
            className="primary-button flex-1 rounded-xl py-2 text-sm font-semibold disabled:opacity-40"
          >
            Sign & Submit
          </button>
        </div>
      </div>
    </div>
  );
};

export default TelemedicineESignModal;
