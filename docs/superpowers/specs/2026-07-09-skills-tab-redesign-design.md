# SKILLS Tab Redesign + AI Mode Lock — Design

**Date:** 2026-07-09
**Scope:** Browser extension popup UI only (`extension/popup.html`, `extension/src/popup.ts`). No backend/service-worker changes.

## Goals

1. Lock AI Mode to **Auto** — user cannot select Cloud or Local.
2. Redesign the **SKILLS** tab as a DeFi-protocol skill list with toggle switches, matching the reference mockup.

## 1. AI Mode lock (STATE pane)

- Keep all three buttons (`Auto` / `Cloud` / `Local`) visible.
- `Cloud` and `Local`: add `disabled` attribute, dim them (reduced opacity, `cursor:not-allowed`), and skip their click behavior in `popup.ts`.
- `Auto` stays active. Backend already defaults `aiMode: "auto"` (`DEFAULT_SKILL_SETTINGS`), so no persistence change is required.

## 2. SKILLS pane → protocol list

Replace the entire current SKILLS pane content (the static **AI Narration** status label and the **Site Detection** All/Select/Off controls) with a skill list:

| Skill | Tag | Default toggle | Behavior |
|---|---|---|---|
| Jupiter Swap | `DEX` | ON (green) | **Real** — bound to existing `SkillSettings.trade`; persists via `set_skill_settings` |
| Drift Protocol | `PERPS` | OFF | Disabled placeholder |
| MarginFi Lend | `LENDING` | OFF | Disabled placeholder |
| Kamino Earn | `YIELD` | OFF | Disabled placeholder |

Below the list: a dashed **`+ Browse plugins`** button, disabled (placeholder). The existing global `v0.1.0` footer is unchanged.

### Layout & styling (new CSS in `popup.html`)

- **Skill row:** `display:flex; justify-content:space-between; align-items:center`. Left = bold skill name + a yellow-bordered uppercase tag badge. Right = toggle switch.
- **Tag badge:** small uppercase, yellow text (`#f5e642`), 1px yellow border, tight padding.
- **Toggle switch:** iOS-style pill (~34×18px). ON = green track (`#8bf542`) with knob right. OFF = grey track (`#444`) with knob left. Pure CSS, no images.
- **Disabled rows:** ~0.5 opacity, `cursor:not-allowed`, toggle inert.
- **Browse plugins:** full-width dashed border, muted grey text, centered, disabled.

## 3. `popup.ts` changes

- **Remove:** all `site-*` (hostname, aggressive/selection/off) wiring and any `ai-narration` references. Drop now-unused imports (`getSiteMode`, `setSiteMode`, `SiteMode`) and `currentHostname`.
- **AI Mode:** only bind a click handler to the `Auto` button (or guard handlers so disabled buttons do nothing). Keep the load-time `renderAiMode` call.
- **Skills:** on load, `get_skill_settings` → set the Jupiter toggle from `settings.trade`. On Jupiter toggle click, `set_skill_settings` with `{ ...settings, trade: <new> }`. Placeholder toggles have no handlers.

## What is explicitly preserved (untouched)

- ✅ **AI narration on token select** — driven by `content.ts` (`narration` port → background → inline popup in `popup-ui.ts`). The removed SKILLS label was a static display only; the feature is not gated by it.
- ✅ **Site detection logic** — lives in `content.ts` / `detection-rules`. Only its popup UI control is removed; detection continues at its default behavior.

## Out of scope

- No new backend fields, no `SkillSettings` schema changes.
- No real functionality for Drift/MarginFi/Kamino/Browse plugins (visual placeholders).
- No relocation of Site Detection controls (removed per "keep it simple").

## Testing

- `npm test` must still pass (85 tests).
- Manual: build, load popup — Auto locked; Cloud/Local un-clickable; SKILLS shows 4 rows matching the mockup; Jupiter toggle persists across popup reopen; narration still streams on token select.
