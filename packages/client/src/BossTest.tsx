import { useEffect, useRef, useState } from "react";
import { Client, type Room } from "@colyseus/sdk";
import { BOSS_TEST_PORT, BOSS_TEST_ROOM_NAME, CLIENT_ACTION, SERVER_MESSAGES, type BossTestOptions, type ClientAction, type RoomView } from "@pbg/protocol";
import type { ReceivedView } from "./App";
import { Game } from "./Game";

export const BOSS_TEST_PRESETS = {
  human: { label: "Human encounter", challenger: "you", bossFixed: 4, defaultDie: 6, seed: 1, hint: "Choose any die to try a normal encounter." },
  win: { label: "Human win", challenger: "you", bossFixed: 4, defaultDie: 6, seed: 1, hint: "Choose the saved d12: you roll 8 against the boss's 5." },
  loss: { label: "Human loss", challenger: "you", bossFixed: 4, defaultDie: 4, seed: 1, hint: "The d4 penalty forces a loss, followed by knockback." },
  tie: { label: "Tie and reroll", challenger: "you", bossFixed: 4, defaultDie: 6, seed: 3, hint: "Choose the default d6: the first roll ties 5–5, then both sides reroll." },
  bot: { label: "Watch a bot", challenger: "bot", bossFixed: 4, defaultDie: 6, seed: 1, hint: "The bot picks its saved d12 after 1 second. Watch the full sequence." },
  both: { label: "Human + bot", challenger: "both", bossFixed: 4, defaultDie: 6, seed: 3, hint: "Choose the saved d12 to beat the boss alongside a bot and reach the showdown." },
  showdown2: { label: "2-player showdown", mode: "showdown", contenders: 2, challenger: "you", bossFixed: 4, defaultDie: 6, seed: 4, hint: "Jump directly to a head-to-head showdown." },
  showdown4: { label: "4-player free-for-all", mode: "showdown", contenders: 4, challenger: "you", bossFixed: 4, defaultDie: 6, seed: 4, hint: "Four contenders choose dice, then reveal rolls 2 seconds apart." },
  showdownTie: { label: "Showdown tie + elimination", mode: "showdown", contenders: 4, challenger: "you", bossFixed: 4, defaultDie: 6, seed: 21, hint: "Choose the saved d12: first rolls are 6, 6, 4, 5. Only the tied leaders reroll." },
  showdown12: { label: "12-player showdown", mode: "showdown", contenders: 12, challenger: "you", bossFixed: 4, defaultDie: 6, seed: 4, hint: "Test the full 12-card arena. Eliminated cards remain visible during rerolls." },
} as const;
type Preset = keyof typeof BOSS_TEST_PRESETS;
const presetConfig = (preset: Preset): BossTestOptions => {
  const p = BOSS_TEST_PRESETS[preset];
  const { challenger, bossFixed, defaultDie, seed } = p;
  return {
    challenger, bossFixed, defaultDie, seed, name: "Boss tester",
    mode: "mode" in p ? p.mode : "boss", contenders: "contenders" in p ? p.contenders : 4,
  };
};

/** A real Colyseus test room, completely separate from the normal match and its reconnection token. */
export function BossTest() {
  const [preset, setPreset] = useState<Preset>("human");
  const [config, setConfig] = useState<BossTestOptions>(() => presetConfig("human"));
  const [received, setReceived] = useState<ReceivedView | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const roomRef = useRef<Room | null>(null);
  const generation = useRef(0);

  useEffect(() => {
    const title = document.title;
    document.title = "Final battle test · Beach Party";
    return () => {
      document.title = title;
      generation.current++;
      void roomRef.current?.leave();
      roomRef.current = null;
    };
  }, []);

  const stop = () => {
    generation.current++;
    const room = roomRef.current;
    roomRef.current = null;
    setReceived(null);
    setBusy(false);
    void room?.leave();
  };

  const launch = async () => {
    const run = ++generation.current;
    const previous = roomRef.current;
    roomRef.current = null;
    setBusy(true);
    setError(null);
    setReceived(null);
    try {
      await previous?.leave();
      const endpoint = import.meta.env.DEV ? `http://${location.hostname}:${BOSS_TEST_PORT}` : location.origin;
      const room = await new Client(endpoint).create(BOSS_TEST_ROOM_NAME, config);
      if (generation.current !== run) {
        void room.leave();
        return;
      }
      roomRef.current = room;
      room.onMessage(SERVER_MESSAGES.view, (view: RoomView) => {
        if (generation.current === run) setReceived({ view, clockOffset: view.serverNow - Date.now() });
      });
      room.onMessage(SERVER_MESSAGES.error, (message: string) => {
        if (generation.current === run) setError(message);
      });
      room.onLeave(() => {
        if (generation.current !== run) return;
        roomRef.current = null;
        setReceived(null);
        setError("Test room disconnected. Start the test again.");
      });
    } catch (cause) {
      if (generation.current === run) setError(cause instanceof Error ? cause.message : "Could not start the boss test.");
    } finally {
      if (generation.current === run) setBusy(false);
    }
  };

  const act = (action: ClientAction) => {
    if (action.type === "playAgain") void launch();
    else roomRef.current?.send(CLIENT_ACTION, action);
  };
  const match = received?.view.match;
  const inEncounter = match?.phase.kind === "boss" || match?.phase.kind === "showdown";
  const complete = match?.phase.kind === "gameOver" ||
    (match?.phase.kind === "minigame" && match.step.kind === "revealing");
  const valid = Number.isInteger(config.bossFixed) && config.bossFixed >= 1 && config.bossFixed <= 12 &&
    Number.isInteger(config.seed) && config.seed >= 0 && config.seed <= 0xffff_ffff &&
    Number.isInteger(config.contenders) && config.contenders! >= 2 && config.contenders! <= 12;

  return (
    <>
      <section className="panel boss-test-setup" inert={inEncounter} aria-hidden={inEncounter ? true : undefined}>
        <h1>Final boss &amp; showdown test</h1>
        <p>Jump straight into a real boss encounter or free-for-all showdown. No board race or minigames required.</p>
        <form onSubmit={(e) => { e.preventDefault(); if (valid && !busy) void launch(); }}>
          <div className="boss-test-fields">
            <label className="field">
              Preset
              <select value={preset} onChange={(e) => {
                const key = e.target.value as Preset;
                setPreset(key);
                setConfig(presetConfig(key));
              }}>
                {Object.entries(BOSS_TEST_PRESETS).map(([key, p]) => <option key={key} value={key}>{p.label}</option>)}
              </select>
            </label>
            <label className="field">
              Encounter
              <select value={config.mode} onChange={(e) => setConfig({ ...config, mode: e.target.value as "boss" | "showdown" })}>
                <option value="boss">Final boss</option><option value="showdown">Free-for-all showdown</option>
              </select>
            </label>
            <label className="field">
              Challenger
              <select value={config.challenger} disabled={config.mode === "showdown"} onChange={(e) => setConfig({ ...config, challenger: e.target.value as BossTestOptions["challenger"] })}>
                <option value="you">You</option><option value="bot">Bot</option><option value="both">You + bot</option>
              </select>
            </label>
            {config.mode === "showdown" && <label className="field">
              Contenders (2–12)
              <input type="number" min={2} max={12} step={1} value={Number.isNaN(config.contenders) ? "" : config.contenders}
                onChange={(e) => setConfig({ ...config, contenders: e.target.valueAsNumber })} />
            </label>}
            <label className="field">
              Boss fixed bonus
              <input type="number" min={1} max={12} step={1} disabled={config.mode === "showdown"} value={Number.isNaN(config.bossFixed) ? "" : config.bossFixed}
                onChange={(e) => setConfig({ ...config, bossFixed: e.target.valueAsNumber })} />
            </label>
            <label className="field">
              Default die
              <select value={config.defaultDie} onChange={(e) => setConfig({ ...config, defaultDie: Number(e.target.value) as 4 | 6 })}>
                <option value={6}>d6</option><option value={4}>d4 penalty</option>
              </select>
            </label>
            <label className="field">
              Seed
              <input type="number" min={0} max={0xffff_ffff} step={1} value={Number.isNaN(config.seed) ? "" : config.seed}
                onChange={(e) => setConfig({ ...config, seed: e.target.valueAsNumber })} />
            </label>
          </div>
          <p className="muted small-text">{BOSS_TEST_PRESETS[preset].hint} Preset results require the original settings.</p>
          <p className="small-text">Saved d8, d10 and d12 are available unless the d4 penalty applies. Rolls are server-controlled.</p>
          <div className="row">
            <button className="primary" disabled={busy || !valid}>{busy ? "Starting…" : received ? "Replay boss test" : "Start boss test"}</button>
            {received && <button type="button" onClick={stop}>End test</button>}
          </div>
        </form>
        {complete && <p role="status" className="boss-test-complete">Test complete. The encounter is paused here; no minigames will start. Replay whenever you like.</p>}
        {error && <p role="alert">{error} Run <code>pnpm boss:test</code> to start the separate test server.</p>}
      </section>
      {received?.view.match && <Game received={received} act={act} onLeave={stop} playAgainLabel="Replay boss test" />}
    </>
  );
}
