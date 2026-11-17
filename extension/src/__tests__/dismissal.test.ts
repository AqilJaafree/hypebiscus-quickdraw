import { describe, it, expect } from "vitest";
import { DismissGuard } from "../dismissal";

const CA = "7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr";

describe("DismissGuard", () => {
  it("allows everything before any dismiss", () => {
    const g = new DismissGuard();
    expect(g.allowSelection(CA, CA)).toBe(true);
    expect(g.allowPassive(CA)).toBe(true);
  });

  it("blocks the same, still-highlighted selection after cancel", () => {
    const g = new DismissGuard();
    g.dismiss(CA, CA);
    expect(g.allowSelection(CA, CA)).toBe(false);
  });

  it("re-arms once the selection collapses, so re-selecting the CA shows it again", () => {
    const g = new DismissGuard();
    g.dismiss(CA, CA);
    g.selectionChanged("");   // click to re-select collapses first
    g.selectionChanged(CA);   // then the same text is selected again
    expect(g.allowSelection(CA, CA)).toBe(true);
  });

  it("re-arms when a different range containing the CA is selected", () => {
    const g = new DismissGuard();
    g.dismiss(CA, CA);
    g.selectionChanged(`CA: ${CA}`);
    expect(g.allowSelection(CA, `CA: ${CA}`)).toBe(true);
  });

  it("ignores selectionchange events that leave the selection unchanged", () => {
    const g = new DismissGuard();
    g.dismiss(CA, CA);
    g.selectionChanged(CA);
    expect(g.allowSelection(CA, CA)).toBe(false);
  });

  it("re-arms on a fresh select gesture even if the highlighted text is unchanged", () => {
    const g = new DismissGuard();
    g.dismiss(CA, CA);
    g.rearm();
    expect(g.allowSelection(CA, CA)).toBe(true);
  });

  it("does not block selection of a different address", () => {
    const g = new DismissGuard();
    g.dismiss(CA, CA);
    expect(g.allowSelection("So11111111111111111111111111111111111111112", CA)).toBe(true);
  });

  it("keeps passive detection quiet for a dismissed address", () => {
    const g = new DismissGuard();
    g.dismiss(CA, "");
    g.selectionChanged("anything");
    expect(g.allowPassive(CA)).toBe(false);
    expect(g.allowSelection(CA, CA)).toBe(true); // nothing was highlighted at dismiss
  });
});
