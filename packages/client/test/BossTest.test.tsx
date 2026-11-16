import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BossTest, BOSS_TEST_PRESETS } from "../src/BossTest";

describe("standalone boss test setup", () => {
  it("renders the separate setup with human, bot, win, loss, tie, and simultaneous presets", () => {
    const html = renderToStaticMarkup(<BossTest />);
    expect(html).toContain("Final boss &amp; showdown test");
    expect(html).toContain("No board race or minigames required");
    expect(html).toContain("Start boss test");
    for (const preset of Object.values(BOSS_TEST_PRESETS)) expect(html).toContain(preset.label);
    expect(html).not.toContain('role="dialog"');
  });
});
