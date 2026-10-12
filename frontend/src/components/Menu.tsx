import { IconMap, IconSettings, IconUser } from "@tabler/icons-react";
import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { type LeaderboardEntry, type User, getLeaderboard } from "../api";
import type { Screen } from "../App";
import { randomRoomCode, untilTomorrow } from "../format";
import { dailySeed } from "../game/rng";
import { MAPS, seedLevel } from "../game/world/biomes";
import { Course } from "../game/world/course";
import { type Settings, clientId } from "../storage";
import { usePaletteTheme } from "../theme";
import SettingsPanel from "./SettingsPanel";
import MapSelect from "./MapSelect";
import { HelpButton } from "./Help";
import MenuBackdrop from "./MenuBackdrop";
import TodaysBest from "./TodaysBest";
import "./Menu.css";

interface MenuProps {
  me: User | null;
  settings: Settings;
  onSettings: (settings: Settings) => void;
  joinCode?: string;
  go: (screen: Screen) => void;
}

const Menu = ({ me, settings, onSettings, joinCode, go }: MenuProps) => {
  const [daily, setDaily] = useState(() => dailySeed());
  // Today's course: whichever map the daily seed stands for
  const course = useMemo(() => {
    const { biome, palette } = seedLevel(daily);
    return { map: biome.name, mood: palette.name, gates: new Course(daily).rings.length };
  }, [daily]);
  const [tab, setTab] = useState<"solo" | "friends">(joinCode ? "friends" : "solo");
  const [code, setCode] = useState(joinCode ?? "");
  const [board, setBoard] = useState<LeaderboardEntry[]>([]);
  const [panel, setPanel] = useState<"none" | "settings">("none");
  const [countdown, setCountdown] = useState(untilTomorrow);
  // The map select, for a time trial, a run or a new room: it shows its course behind the glass, and the UI
  // takes its colors
  const [picking, setPicking] = useState<"solo" | "room" | null>(null);
  const [preview, setPreview] = useState<number | null>(null);
  const shown = picking && preview !== null ? preview : daily;
  const shownPalette = useMemo(() => seedLevel(shown).palette, [shown]);
  // Pictures of the courses the backdrop has shown, for the map select's cards
  const [art, setArt] = useState<Record<number, string>>({});
  const keepArt = useCallback((seed: number, url: string) => setArt((all) => ({ ...all, [seed]: url })), []);
  // The course the backdrop has all in: the map select covers the others with their picture meanwhile
  const [live, setLive] = useState<number | null>(null);
  usePaletteTheme(shownPalette);

  // The map select's pictures (public/maps, about 0.8 MB), fetched while the landing page is up
  useEffect(() => {
    const timer = setTimeout(() => MAPS.forEach((biome) => (new Image().src = `/maps/${biome}.jpg`)), 1500);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    getLeaderboard(daily, clientId())
      .then(setBoard)
      .catch(() => {});
  }, [daily]);

  useEffect(() => {
    // Past UTC midnight the countdown starts over, and today's course becomes the new one
    const timer = setInterval(() => {
      setCountdown(untilTomorrow());
      setDaily(dailySeed());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    // Enter flies today's course (Solo), unless a field or button has the focus
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Enter" || e.target !== document.body || picking) return;
      if (tab === "solo") go({ kind: "solo", seed: daily });
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [daily, tab, picking, go]);

  const joinRoom = (e: FormEvent) => {
    e.preventDefault();
    const room = code.trim().toUpperCase();
    if (/^[A-Z0-9]{3,8}$/.test(room)) go({ kind: "room", code: room });
  };

  const closePicker = () => {
    setPicking(null);
    setPreview(null);
  };

  const pilotName = me?.verified ? me.name : settings.nickname || "Guest";

  return (
    <main className="menu">
      <MenuBackdrop seed={shown} mode="drift" onSnapshot={keepArt} onShown={setLive} settings={settings} />

      <HelpButton className="menu-help" />
      <button
        className="menu-icon glass settings-button"
        aria-label="Settings"
        onClick={() => setPanel(panel === "settings" ? "none" : "settings")}
      >
        <IconSettings size={22} />
      </button>
      {panel === "settings" && <SettingsPanel settings={settings} onSettings={onSettings} onClose={() => setPanel("none")} />}

      {picking ? (
        <MapSelect
          mode={picking}
          daily={daily}
          countdown={countdown}
          art={art}
          onPreview={setPreview}
          live={live}
          onPick={(seed) =>
            go(
              picking === "solo"
                ? { kind: "solo", seed }
                : { kind: "room", code: randomRoomCode(), seed },
            )
          }
          action={picking === "solo" ? "Fly" : "Create the room"}
          onBack={closePicker}
        />
      ) : (
        <>
          <header className="menu-title">
            <h1>WindRider</h1>
            <p>Race through floating islands</p>
          </header>

          <section className="menu-card glass">
            <div className="menu-tabs" role="tablist">
              <button role="tab" aria-selected={tab === "solo"} onClick={() => setTab("solo")}>
                Solo
              </button>
              <button role="tab" aria-selected={tab === "friends"} onClick={() => setTab("friends")}>
                With friends
              </button>
            </div>

            {tab === "solo" ? (
              <>
                <div className="menu-course">
                  <div>
                    <small>Today's course · #{daily}</small>
                    <b>{course.map}</b>
                  </div>
                  <span>{course.mood}</span>
                  <span>{course.gates} gates</span>
                  <span>New in {countdown}</span>
                </div>
                <button className="primary" onClick={() => go({ kind: "solo", seed: daily })}>
                  Fly today's course <kbd>Enter</kbd>
                </button>
                <div className="menu-more">
                  <button className="menu-link" onClick={() => setPicking("solo")}>
                    <IconMap size={18} /> Choose a course
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="menu-course">
                  <div>
                    <small>Race room</small>
                    <b>Same map, same time</b>
                  </div>
                  <span>Up to 12 pilots</span>
                </div>
                <button className="primary" onClick={() => setPicking("room")}>
                  Create a room
                </button>
                <form onSubmit={joinRoom} className="menu-join">
                  <input
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    placeholder="Room code"
                    maxLength={8}
                    aria-label="Room code"
                    autoFocus={!!joinCode}
                  />
                  <button type="submit" disabled={!/^[A-Za-z0-9]{3,8}$/.test(code.trim())}>
                    Join
                  </button>
                </form>
              </>
            )}
          </section>
        </>
      )}

      {!picking && <TodaysBest entries={board} />}

      <button className="menu-pilot glass" aria-label={pilotName}>
        <span className="menu-badge">
          <IconUser size={22} />
        </span>
        <span className="menu-pilot-text">
          {pilotName}
        </span>
      </button>
    </main>
  );
};

export default Menu;
