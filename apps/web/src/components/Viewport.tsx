import { Engine } from '@starhome/engine';
import { useEffect, useRef, useState } from 'react';
import { useApp } from '../state/store';

/** Full-screen WebGL canvas plus the label layer; owns the engine's lifetime. */
export function Viewport() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const labelRef = useRef<HTMLDivElement>(null);
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    // Probe on a scratch canvas: a canvas keeps the first context type it is asked for.
    if (!document.createElement('canvas').getContext('webgl2')) {
      setFailure('This browser or graphics driver does not provide WebGL 2, which Starhome needs to draw the Galaxy.');
      return;
    }
    const { quality, setHud, setSelected, setEngine, setTargets, setExoplanets, markVisited, loadUser } = useApp.getState();
    void loadUser();
    let engine: Engine;
    try {
      engine = new Engine({
        canvas: canvasRef.current!,
        labelRoot: labelRef.current!,
        quality,
        hipparcosUrl: `${import.meta.env.BASE_URL}data/hipparcos.bin`,
        onHud: setHud,
        onSelect: setSelected,
        exoplanetsUrl: `${import.meta.env.BASE_URL}data/exoplanets.json`,
        texturesUrl: `${import.meta.env.BASE_URL}textures/`,
        onTargetsChanged: setTargets,
        onExoplanets: setExoplanets,
        onArrive: markVisited,
      });
    } catch (err) {
      console.error(err);
      setFailure('The 3D view could not start (WebGL failed to initialise).');
      return;
    }
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
      {failure && (
        <div className="absolute inset-0 z-10 grid place-items-center p-8" role="alert">
          <div className="glass max-w-md rounded-2xl p-6 text-sm leading-relaxed text-ink-dim">
            <h1 className="mb-2 text-lg font-semibold text-ink">Starhome can’t draw here</h1>
            <p>{failure}</p>
            <p className="mt-2">Try a current version of Chrome, Edge, Firefox or Safari, and check that hardware acceleration is switched on in the browser’s settings.</p>
          </div>
        </div>
      )}
      <canvas ref={canvasRef} className="block h-full w-full touch-none outline-none" aria-label="3D view of the Milky Way" />
      {/* isolate: the label renderer sets z-index per label; keep those inside this layer. */}
      <div ref={labelRef} className="pointer-events-none absolute inset-0 isolate overflow-hidden" />
    </div>
  );
}
