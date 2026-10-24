// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Jonathan D.A. Jewell (hyperpolymath) <j.d.a.jewell@open.ac.uk>

import { describe, expect, test } from "bun:test";
import { Window } from "happy-dom";

// `@vue/runtime-dom` captures `document` when first imported; install a happy-dom
// Window on `globalThis` BEFORE dynamically importing `vue` and `App.vue`.
const sharedWin = new Window({ url: "http://127.0.0.1:8000/" });
globalThis.window = sharedWin;
globalThis.document = sharedWin.document;
globalThis.HTMLElement = sharedWin.HTMLElement;
globalThis.Element = sharedWin.Element;
globalThis.Node = sharedWin.Node;
globalThis.SVGElement = sharedWin.SVGElement;
globalThis.Event = sharedWin.Event;
globalThis.KeyboardEvent = sharedWin.KeyboardEvent;
globalThis.CustomEvent = sharedWin.CustomEvent;

const { createApp, effectScope, nextTick } = await import("vue");
const { default: App } = await import("../../src/App.vue");
const { useVaultGame } = await import("../../src/composables/useVaultGame.js");
const { EXPECTED_PASSCODE } = await import("../../src/engine/befunge93.js");

describe("Vue 3 SFC Game System & Composable Lifecycle (Categories 2, 3, 7)", () => {
  test("useVaultGame schedules ZERO timers when idle and cleans up on Pause, completion, and dispose", async () => {
    const timers = new Map();
    let seq = 1;
    const scheduleInterval = (fn, delay) => {
      const id = seq++;
      timers.set(id, { fn, delay });
      return id;
    };
    const cancelInterval = (id) => {
      timers.delete(id);
    };

    const scope = effectScope();
    const game = scope.run(() => useVaultGame({ scheduleInterval, cancelInterval }));

    // Regression R-05: NO idle polling timer when paused/initial, and no frozen non-reactive activeTimer!
    expect(timers.size).toBe(0);
    expect("activeTimer" in game).toBe(false);

    game.dispatch({ type: "Start" });
    await nextTick();
    expect(timers.size).toBe(1);
    const firstEntry = [...timers.values()][0];
    expect(firstEntry.delay).toBe(420);

    // Changing tempo while running replaces the timer cleanly
    game.dispatch({ type: "SetTempo", tempo: "ludicrous" });
    await nextTick();
    expect(timers.size).toBe(1);
    expect([...timers.values()][0].delay).toBe(120);

    // Advance 18 ticks via timer callback -> auto-halts and clears timer!
    for (let i = 0; i < 18; i += 1) {
      const current = [...timers.values()][0];
      current.fn();
    }
    await nextTick();
    expect(game.state.value.completed).toBe(true);
    expect(timers.size).toBe(0);

    // Reset + Start + scope.stop() guarantees unmount cleanup
    game.dispatch({ type: "Reset" });
    game.dispatch({ type: "Start" });
    await nextTick();
    expect(timers.size).toBe(1);

    scope.stop();
    expect(timers.size).toBe(0);
  });

  test("mounts App.vue, renders accessible 10x10 torus grid, steps all 18 stages, and unlocks vault", async () => {
    document.body.replaceChildren();
    const host = document.createElement("div");
    host.id = "app";
    document.body.appendChild(host);

    const app = createApp(App);
    app.mount(host);
    await nextTick();

    try {
      // 1. Verify 10 ARIA rows, 100 grid cells, roving tabindex, and accessible roles/labels
      const rows = host.querySelectorAll('[role="grid"] > [role="row"]');
      expect(rows.length).toBe(10);
      const cells = host.querySelectorAll('[role="gridcell"]');
      expect(cells.length).toBe(100);
      const tabbableCells = [...cells].filter((c) => c.getAttribute("tabindex") === "0");
      expect(tabbableCells.length).toBe(1);
      expect(tabbableCells[0].getAttribute("data-cell")).toBe("0,0");
      expect(host.querySelector('[role="tablist"]')).not.toBeNull();
      expect(host.querySelector('label[for="vault-passcode-input"]')).not.toBeNull();
      expect(host.querySelector('[role="progressbar"]')?.getAttribute("aria-valuenow")).toBe("0");

      // Non-submit buttons must carry explicit type="button"
      const actionButtons = host.querySelectorAll(".bf-controls button, .bf-tabs button");
      for (const btn of actionButtons) {
        expect(btn.getAttribute("type")).toBe("button");
      }

      // 2. Click cell (9, 9) and verify opcode inspector updates to '@'
      const terminatorBtn = host.querySelector('[data-cell="9,9"]');
      terminatorBtn.click();
      await nextTick();
      expect(host.querySelector(".bf-inspector")?.textContent).toContain("(9, 9)");
      expect(host.querySelector(".bf-inspector")?.textContent).toContain("halt");

      // 3. Keyboard arrow navigation on playfield wraps around torus (9,9) -> Right -> (9,0) and moves focus
      const gridEl = host.querySelector('[role="grid"]');
      gridEl.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
      await nextTick();
      expect(host.querySelector(".bf-inspector")?.textContent).toContain("(9, 0)");
      expect(document.activeElement?.getAttribute("data-cell")).toBe("9,0");

      // 4. Step through all 18 stages bit by bit via the Step button
      const stepBtn = host.querySelector('[data-action="step"]');
      for (let s = 0; s < 18; s += 1) {
        expect(stepBtn.disabled).toBe(false);
        stepBtn.click();
        await nextTick();
      }
      expect(stepBtn.disabled).toBe(true);
      expect(host.querySelector('[data-action="start"]').disabled).toBe(true);
      expect(host.querySelector('[role="progressbar"]')?.getAttribute("aria-valuenow")).toBe("100");
      expect(host.querySelector('[data-testid="vm-output"]')?.textContent).toBe(EXPECTED_PASSCODE);

      // 5. Submit wrong passcode first, then submit recovered passcode to unlock vault
      const passInput = host.querySelector("#vault-passcode-input");
      const passForm = host.querySelector("form.bf-pass-block");

      passInput.value = "98200000";
      passInput.dispatchEvent(new Event("input", { bubbles: true }));
      await nextTick();
      passForm.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      await nextTick();
      expect(host.querySelector('[data-testid="passcode-status"]')?.textContent).toContain("3/8");

      passInput.value = EXPECTED_PASSCODE;
      passInput.dispatchEvent(new Event("input", { bubbles: true }));
      await nextTick();
      passForm.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      await nextTick();
      expect(host.querySelector('[data-testid="passcode-status"]')?.textContent).toContain(
        "Vault unlocked",
      );

      // 6. Navigate tabs via keyboard ArrowRight (vault -> trace -> about)
      const tablist = host.querySelector('[role="tablist"]');
      tablist.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
      await nextTick();
      expect(host.querySelector("#panel-trace")).not.toBeNull();
      expect(host.querySelectorAll(".bf-check-item").length).toBe(5);

      tablist.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
      await nextTick();
      expect(host.querySelector("#panel-about")?.textContent).toContain("Vue 3 Single-File Components");

      // Saturation: End, Home, ArrowLeft wraparound, and Re-run Self-Checks button
      tablist.dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true }));
      await nextTick();
      expect(host.querySelector("#panel-workshop")).not.toBeNull();

      tablist.dispatchEvent(new KeyboardEvent("keydown", { key: "Home", bubbles: true }));
      await nextTick();
      expect(host.querySelector("#panel-vault")).not.toBeNull();

      tablist.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }));
      await nextTick();
      expect(host.querySelector("#panel-workshop")).not.toBeNull();

      // Switch to trace tab and invoke Re-run Self-Checks
      host.querySelector("#tab-trace").click();
      await nextTick();
      const selfCheckBtn = host.querySelector('[data-action="selfcheck"]');
      expect(selfCheckBtn).not.toBeNull();
      const entriesBefore = host.querySelectorAll(".bf-log-full > div").length;
      selfCheckBtn.click();
      await nextTick();
      expect(host.querySelectorAll(".bf-log-full > div").length).toBe(entriesBefore + 1);
    } finally {
      app.unmount();
    }
  });

  test("Saturation: PlayfieldGrid keyboard navigation wraps across all 4 torus borders", async () => {
    document.body.replaceChildren();
    const host = document.createElement("div");
    document.body.appendChild(host);
    const app = createApp(App);
    app.mount(host);
    await nextTick();

    try {
      const gridEl = host.querySelector('[role="grid"]');
      // Starts at (0, 0) -> ArrowUp -> (9, 0) -> ArrowDown -> (0, 0) -> ArrowLeft -> (0, 9)
      gridEl.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }));
      await nextTick();
      expect(host.querySelector(".bf-inspector")?.textContent).toContain("(9, 0)");

      gridEl.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
      await nextTick();
      expect(host.querySelector(".bf-inspector")?.textContent).toContain("(0, 0)");

      gridEl.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }));
      await nextTick();
      expect(host.querySelector(".bf-inspector")?.textContent).toContain("(0, 9)");

      // Switch puzzle level to self-mod-cipher and verify live `p` mutation renders ',' at (4, 3)
      const levelSelect = host.querySelector("#vault-level-select");
      levelSelect.value = "self-mod-cipher";
      levelSelect.dispatchEvent(new Event("change", { bubbles: true }));
      await nextTick();
      expect(host.querySelector('[data-cell="4,3"]')?.textContent?.trim()).toBe("·");

      const stepBtn = host.querySelector('[data-action="step"]');
      for (let s = 0; s < 40 && !stepBtn.disabled; s += 1) {
        stepBtn.click();
        await nextTick();
      }
      expect(host.querySelector('[data-cell="4,3"]')?.textContent?.trim()).toBe(",");
      host.querySelector('[data-cell="4,3"]').click();
      await nextTick();
      expect(host.querySelector(".bf-inspector")?.textContent).toContain("ASCII character");
    } finally {
      app.unmount();
    }
  });

  test("Workshop tab renders an editable ARIA authoring grid that cycles glyphs and navigates the torus", async () => {
    document.body.replaceChildren();
    const host = document.createElement("div");
    host.id = "app";
    document.body.appendChild(host);

    const app = createApp(App);
    app.mount(host);
    await nextTick();

    try {
      host.querySelector("#tab-workshop").click();
      await nextTick();
      const panel = host.querySelector("#panel-workshop");
      expect(panel).not.toBeNull();

      const enterBtn = [...panel.querySelectorAll("button")].find((b) =>
        b.textContent.includes("Enter Workshop Mode"),
      );
      expect(enterBtn).not.toBeUndefined();
      enterBtn.click();
      await nextTick();

      // Regression (v0.4.1): `WorkshopGrid.vue` was imported by nothing, so the
      // Workshop rendered its controls but no editable playfield at all, and the
      // component's own unescaped-quote SFC syntax error never reached a build.
      const rows = panel.querySelectorAll('[role="grid"] > [role="row"]');
      expect(rows.length).toBe(10);
      const cells = panel.querySelectorAll('[role="gridcell"]');
      expect(cells.length).toBe(100);

      // Roving tabindex: exactly one tabbable cell, starting at the origin.
      const tabbable = [...cells].filter((c) => c.getAttribute("tabindex") === "0");
      expect(tabbable.length).toBe(1);
      expect(tabbable[0].getAttribute("data-cell")).toBe("0,0");

      for (const c of cells) {
        expect(c.getAttribute("type")).toBe("button");
        expect((c.getAttribute("aria-label") || "").length).toBeGreaterThan(0);
      }

      // The seeded vault-alpha grid renders and is editable; (0,0) holds '0'.
      expect(panel.querySelector('[data-cell="0,0"]').textContent.trim()).toBe("0");

      // Regression (v0.4.1): glyphs the validator rejected were silently
      // discarded, so Enter looked like a dead keypress. Cycling must mutate.
      panel
        .querySelector('[data-cell="0,0"]')
        .dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      await nextTick();
      expect(panel.querySelector('[data-cell="0,0"]').textContent.trim()).toBe("1");

      // A valid authoring flow must not raise the rejection alert.
      expect(panel.querySelector(".bf-workshop-alert")).toBeNull();

      // Arrow keys move the selection and DOM focus across the torus.
      panel
        .querySelector('[data-cell="0,0"]')
        .dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
      await nextTick();
      expect(document.activeElement?.getAttribute("data-cell")).toBe("0,1");

      panel
        .querySelector('[data-cell="0,1"]')
        .dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }));
      await nextTick();
      expect(document.activeElement?.getAttribute("data-cell")).toBe("0,0");

      // Torus wraparound: ArrowLeft from column 0 lands on column 9.
      panel
        .querySelector('[data-cell="0,0"]')
        .dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }));
      await nextTick();
      expect(document.activeElement?.getAttribute("data-cell")).toBe("0,9");

      // Leaving the workshop tears the authoring surface back down.
      const leaveBtn = [...panel.querySelectorAll("button")].find((b) =>
        b.textContent.includes("Return to Vault Play"),
      );
      expect(leaveBtn).not.toBeUndefined();
      leaveBtn.click();
      await nextTick();
      expect(panel.querySelectorAll('[role="gridcell"]').length).toBe(0);
    } finally {
      app.unmount();
    }
  });
});
