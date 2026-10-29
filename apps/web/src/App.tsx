import { Hud, LoadingPill, ScaleBar, WarpPill } from './components/Hud';
import { InfoPanel } from './components/InfoPanel';
import { NavRail, useEngineSettings } from './components/NavRail';
import { Search } from './components/Search';
import { Shortcuts } from './components/Shortcuts';
import { TimeBar } from './components/TimeBar';
import { AppNotices, Toast, TopActions } from './components/TopActions';
import { TourPlayer } from './components/TourPlayer';
import { Viewport } from './components/Viewport';
import { useUrlSync } from './state/urlSync';

export function App() {
  useEngineSettings();
  useUrlSync();
  return (
    <main className="relative h-full w-full select-none">
      <Viewport />
      <div className="pointer-events-none absolute inset-0 flex flex-col p-4">
        <header className="flex items-start gap-4">
          <div className="pointer-events-auto flex-1">
            <div className="flex items-center justify-center gap-2 pl-16">
              <Search />
              <TopActions />
            </div>
          </div>
        </header>
        <div className="mt-3 flex min-h-0 flex-1">
          <NavRail />
        </div>
        <footer className="mt-3 flex items-end justify-between gap-4">
          <Hud />
          <div className="flex flex-col items-center gap-2">
            <TourPlayer />
            <AppNotices />
            <Toast />
            <WarpPill />
            <LoadingPill />
            <TimeBar />
          </div>
          <ScaleBar />
        </footer>
      </div>
      <InfoPanel />
      <Shortcuts />
    </main>
  );
}
