import { describe, expect, it } from "vitest";
import { parseBossTestOptions } from "../src/bossTestRoom";

const valid = { name: "Tester", challenger: "you", bossFixed: 4, defaultDie: 6, seed: 1 };

describe("standalone boss test configuration", () => {
  it.each(["you", "bot", "both"])("accepts the %s challenger", (challenger) => {
    expect(parseBossTestOptions({ ...valid, challenger })).toEqual({ ...valid, challenger });
  });
  it.each([null, [], {}, { ...valid, challenger: "other" }, { ...valid, defaultDie: 12 },
    { ...valid, bossFixed: 0 }, { ...valid, bossFixed: 13 }, { ...valid, bossFixed: 1.5 },
    { ...valid, seed: -1 }, { ...valid, seed: Infinity }, { ...valid, seed: "1" }, { ...valid, seed: 0x1_0000_0000 },
  ])("rejects invalid options %#", (options) => {
    expect(() => parseBossTestOptions(options)).toThrow();
  });
});
