// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Jonathan D.A. Jewell (hyperpolymath) <j.d.a.jewell@open.ac.uk>

import { describe, expect, test } from "bun:test";
import {
  EXPECTED_PASSCODE,
  GRID,
  WALK_TRACE,
  createVmState,
  describeOpcode,
  executeProgram,
  parseGrid,
  stepVm,
} from "../../src/engine/befunge93.js";

describe("Befunge-93 2D Torus VM (Category 1: UnitTest & Category 5: ExecutionRuntime)", () => {
  test("canonical 10x10 vault grid halts cleanly at (9,9) and emits EXPECTED_PASSCODE", () => {
    const res = executeProgram(GRID, { maxSteps: 500, recordHistory: true });
    expect(res.halted).toBe(true);
    expect(res.exhaustedBudget).toBe(false);
    expect(res.output).toBe(EXPECTED_PASSCODE);
    expect(res.stack).toEqual([]);
    expect(res.finalPos).toEqual([9, 9]);
    expect(res.history.length).toBeGreaterThan(20);
  });

  test("arithmetic, stack manipulation, comparison, and integer output opcodes", () => {
    // 6 * 7 = 42, dup (:), print int (.), logical not (!), print int (.), halt (@)
    const res = executeProgram("67*:.!.@");
    expect(res.halted).toBe(true);
    expect(res.output).toBe("42 0 ");
    expect(res.stack).toEqual([]);
  });

  test("subtraction, division, modulo, swap (\\), discard ($), and greater-than (`)", () => {
    // 9 - 2 = 7; swap with 3 -> 3, 7; ` (3 > 7 -> 0)
    const res1 = executeProgram("92-.82/.94%.@");
    expect(res1.output).toBe("7 4 1 ");

    // Division and modulo by zero are total and yield 0 without throwing
    const resZero = executeProgram("90/.90%.@");
    expect(resZero.halted).toBe(true);
    expect(resZero.output).toBe("0 0 ");

    // Swap (\) and discard ($): push 4, push 9, swap -> top is 4, output 4, discard 9
    const resSwap = executeProgram("49\\.$@");
    expect(resSwap.output).toBe("4 ");
    expect(resSwap.stack).toEqual([]);

    // Greater-than (`): 5 > 3 => 1, 2 > 8 => 0
    const resGt = executeProgram("53`.28`.@");
    expect(resGt.output).toBe("1 0 ");
  });

  test("bridge (#) skips next cell and 2D torus wraps in all 4 cardinal directions", () => {
    // # skips '@' and lands on '5', '.', '@'
    const bridgeRes = executeProgram("#@5.@");
    expect(bridgeRes.halted).toBe(true);
    expect(bridgeRes.output).toBe("5 ");

    // Left wrap from (0,0): '<' wraps to last column '9', then '.', '@'
    const leftWrap = executeProgram("<     @.9");
    expect(leftWrap.halted).toBe(true);
    expect(leftWrap.output).toBe("9 ");

    // Up wrap from (0,0): '^' wraps to bottom row (2,0) '>', then '7', '.', '@'
    const upWrap = executeProgram(["^   ", "    ", ">7.@"]);
    expect(upWrap.halted).toBe(true);
    expect(upWrap.output).toBe("7 ");
  });

  test("vertical branch (|), self-modifying get (g) / put (p), and deterministic '?'", () => {
    // 'p' writes 'A' (65) at (col=15, row=0), then 'g' reads (15, 0) and ',' prints 'A'
    const gpGrid = '"A"96+0p96+0g,@ ';
    const gpRes = executeProgram(gpGrid);
    expect(gpRes.halted).toBe(true);
    expect(gpRes.output).toBe("A");

    // Out-of-bounds 'g' returns 0 safely
    const oobGet = executeProgram("99g.@");
    expect(oobGet.output).toBe("0 ");

    // Vertical branch '|': 0 goes down, 1 goes up
    const vBranch = executeProgram([
      "0| ",
      " >@",
    ]);
    expect(vBranch.halted).toBe(true);

    // '?' uses deterministic fallback or custom rngDirection
    const vm = createVmState("?@");
    const stepped = stepVm(vm, { rngDirection: () => "right" });
    expect(stepped.dir).toBe("right");
    expect(stepped.col).toBe(1);
  });

  test("bounded step budget terminates infinite torus loops without hanging", () => {
    const loopRes = executeProgram(">v\n^<", { maxSteps: 64 });
    expect(loopRes.halted).toBe(false);
    expect(loopRes.exhaustedBudget).toBe(true);
    expect(loopRes.steps).toBe(64);
  });

  test("parseGrid strict validation and opcode documentation", () => {
    expect(() => parseGrid("")).toThrow(RangeError);
    expect(() => parseGrid([["a", "b"], ["c"]], { strict: true })).toThrow(RangeError);
    expect(() => parseGrid(42)).toThrow(TypeError);
    expect(describeOpcode("")).toBe("Empty cell");
    expect(describeOpcode("@")).toContain("halt");
    expect(describeOpcode("7")).toContain("7");
    expect(describeOpcode("Z")).toContain("ASCII");
  });

  test("Saturation: every 18-stage WALK_TRACE milestone occurs in exact order along live stepVm execution", () => {
    let vm = createVmState(GRID);
    const liveSnapshots = [];
    for (let i = 0; i < 500 && !vm.halted; i += 1) {
      const cellRow = vm.row;
      const cellCol = vm.col;
      vm = stepVm(vm);
      liveSnapshots.push({
        executedPos: [cellRow, cellCol],
        dir: vm.dir,
        stack: [...vm.stack],
        output: vm.output,
      });
    }
    expect(vm.halted).toBe(true);

    let cursor = 0;
    for (const milestone of WALK_TRACE) {
      let matched = false;
      while (cursor < liveSnapshots.length) {
        const snap = liveSnapshots[cursor];
        cursor += 1;
        if (
          snap.executedPos[0] === milestone.pos[0] &&
          snap.executedPos[1] === milestone.pos[1] &&
          snap.dir === milestone.dir &&
          snap.output === milestone.output &&
          snap.stack.length === milestone.stack.length &&
          snap.stack.every((v, idx) => v === milestone.stack[idx])
        ) {
          matched = true;
          break;
        }
      }
      expect(matched).toBe(true);
    }
  });

  test("Saturation: empty-stack underflow totality and out-of-bounds put/get safety", () => {
    // Empty stack pops must yield 0 without throwing across +, -, *, /, %, `, !, :, \, $, ., ,
    const underflow = executeProgram("+ - * / % ` ! : \\ $ . , @");
    expect(underflow.halted).toBe(true);
    expect(underflow.output).toBe("1 \x00");

    // Out-of-bounds 'p' (negative or >= width) is a safe no-op; negative 'g' yields 0
    const negPutGet = executeProgram("05-05-65*p05-0g.@");
    expect(negPutGet.halted).toBe(true);
    expect(negPutGet.output).toBe("0 ");
  });

  test("Saturation: stringmode wraps across right/bottom torus boundaries cleanly", () => {
    const wrappedStr = executeProgram([
      '>0"BA',
      "v    ",
    ]);
    // Wrap on row 0 pushes 'B','A','>',0(char '0'=48) until closing quote on second pass!
    expect(wrappedStr.halted).toBe(false);

    const cleanWrap = executeProgram('"XY"  >,@');
    expect(cleanWrap.halted).toBe(true);
    expect(cleanWrap.output).toBe("Y");
  });
});
