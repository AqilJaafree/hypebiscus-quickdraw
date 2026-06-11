import { describe, it, expect } from "vitest";
import { DS, brutal, safetyColor } from "../styles";

describe("DS tokens", () => {
  it("has all required tokens", () => {
    expect(DS.bg).toBe("#181818");
    expect(DS.yellow).toBe("#f5e642");
    expect(DS.safe).toBe("#8bf542");
    expect(DS.caution).toBe("#f5c842");
    expect(DS.danger).toBe("#f54242");
  });
});

describe("brutal()", () => {
  it("returns neobrutalism CSS with default yellow bg", () => {
    const css = brutal();
    expect(css).toContain("background:#f5e642");
    expect(css).toContain("border:2px solid #000");
    expect(css).toContain("box-shadow:3px 3px 0 #333");
    expect(css).toContain("border-radius:0");
  });

  it("accepts a custom background color", () => {
    expect(brutal("#8bf542")).toContain("background:#8bf542");
  });
});

describe("safetyColor()", () => {
  it("returns safe color for score >= 80", () => {
    expect(safetyColor(80)).toBe("#8bf542");
    expect(safetyColor(95)).toBe("#8bf542");
  });

  it("returns caution color for score 50-79", () => {
    expect(safetyColor(50)).toBe("#f5c842");
    expect(safetyColor(75)).toBe("#f5c842");
  });

  it("returns danger color for score < 50", () => {
    expect(safetyColor(49)).toBe("#f54242");
    expect(safetyColor(0)).toBe("#f54242");
  });
});
