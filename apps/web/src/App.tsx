import { Hud, LoadingPill, ScaleBar } from './components/Hud';
import { InfoPanel } from './components/InfoPanel';
import { NavRail, useEngineSettings } from './components/NavRail';
import { Search } from './components/Search';
import { TimeBar } from './components/TimeBar';
import { Viewport } from './components/Viewport';

export function App() {
  useEngineSettings();
  return (
    <main className="relative h-full w-full select-none">
      <Viewport />
      <div className="pointer-events-none absolute inset-0 flex flex-col p-4">
        <header className="flex items-start gap-4">
          <div className="pointer-events-auto flex-1">
            <div className="flex items-center justify-center pl-16">
              <Search />
            </div>
          </div>
        </header>
        <div className="mt-3 flex min-h-0 flex-1">
          <NavRail />
        </div>
        <footer className="mt-3 flex items-end justify-between gap-4">
          <Hud />
          <div className="flex flex-col items-center gap-2">
            <LoadingPill />
            <TimeBar />
          </div>
          <ScaleBar />
        </footer>
      </div>
      <InfoPanel />
    </main>
  );
}
