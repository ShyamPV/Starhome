import { Engine } from '@starhome/engine';
import { useEffect, useRef } from 'react';
import { useApp } from '../state/store';

/** Full-screen WebGL canvas plus the label layer; owns the engine's lifetime. */
export function Viewport() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const labelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const { quality, setHud, setSelected, setEngine } = useApp.getState();
    const engine = new Engine({
      canvas: canvasRef.current!,
      labelRoot: labelRef.current!,
      quality,
      hipparcosUrl: `${import.meta.env.BASE_URL}data/hipparcos.bin`,
      onHud: setHud,
      onSelect: setSelected,
    });
    engine.setLocation(useApp.getState().location);
    setEngine(engine);
    // Handle for end-to-end tests and console debugging in development.
    if (import.meta.env.DEV) (window as unknown as { starhome: Engine }).starhome = engine;
    return () => {
      engine.dispose();
      setEngine(null);
    };
  }, []);

  return (
    <div className="absolute inset-0">
      <canvas ref={canvasRef} className="block h-full w-full touch-none outline-none" aria-label="3D view of the Milky Way" />
      <div ref={labelRef} className="pointer-events-none absolute inset-0 overflow-hidden" />
    </div>
  );
}
