import { describe, it, expect } from "vitest";
import { compile } from "./compile";
import { ataxx } from "../games/ataxx";
import { tictactoe } from "../games/tictactoe";
import { reversi } from "../games/reversi";

describe("compile", () => {
  describe("Ataxx", () => {
    const r = compile(ataxx);

    it("preserves identity fields", () => {
      expect(r.id).toBe("games.ataxx.v1");
      expect(r.name).toBe("Ataxx");
      expect(r.version).toBe(1);
      expect(r.modules.length).toBeGreaterThan(0);
    });

    it("compiles board metadata", () => {
      expect(r.board.width).toBe(7);
      expect(r.board.height).toBe(7);
      expect(r.board.totalCells).toBe(49);
      expect(r.board.coordinates).toBe("algebraic");
    });

    it("extracts setup placements", () => {
      expect(r.setup.length).toBe(4);
      const owners = r.setup.map((s) => s.owner);
      expect(owners).toContain("black");
      expect(owners).toContain("white");
      expect(r.setup.every((s) => s.pieceType === "stone")).toBe(true);
    });

    it("compiles actions with binding domains", () => {
      expect(r.actions.length).toBeGreaterThan(0);
      for (const a of r.actions) {
        expect(a.id).toBeTruthy();
        expect(a.label).toBeTruthy();
        expect(Array.isArray(a.bindings)).toBe(true);
        expect(Array.isArray(a.effectTags)).toBe(true);
      }
    });

    it("includes advanceTurn in effect tags for each action", () => {
      const tagsFlat = r.actions.flatMap((a) => a.effectTags);
      expect(tagsFlat).toContain("advanceTurn");
    });

    it("compiles end conditions with tags", () => {
      expect(r.endConditions.length).toBeGreaterThan(0);
      for (const ec of r.endConditions) {
        expect(ec.id).toBeTruthy();
        expect(Array.isArray(ec.conditionTags)).toBe(true);
        expect(ec.conditionTags.length).toBeGreaterThan(0);
      }
    });

    it("compiles result as maxPieceCount", () => {
      expect(r.result.kind).toBe("maxPieceCount");
      if (r.result.kind === "maxPieceCount") {
        expect(r.result.pieceType).toBe("stone");
        expect(r.result.tie).toBe("draw");
      }
    });

    it("is JSON-serializable (no circular refs, no functions)", () => {
      expect(() => JSON.stringify(r)).not.toThrow();
    });
  });

  describe("Tic-tac-toe", () => {
    const r = compile(tictactoe);

    it("has empty setup list (no initial placements)", () => {
      expect(r.setup).toHaveLength(0);
    });

    it("compiles 3×3 board", () => {
      expect(r.board.width).toBe(3);
      expect(r.board.height).toBe(3);
      expect(r.board.totalCells).toBe(9);
    });

    it("compiles firstMatch result", () => {
      expect(r.result.kind).toBe("firstMatch");
    });
  });

  describe("Reversi", () => {
    const r = compile(reversi);

    it("has 4 initial placements", () => {
      expect(r.setup).toHaveLength(4);
    });

    it("has allowedWhen on the pass action", () => {
      const pass = r.actions.find((a) => a.id === "pass");
      expect(pass).toBeDefined();
      expect(pass?.allowedWhen).toBeTruthy();
    });

    it("includes piece-mutation effect tags on place action", () => {
      const place = r.actions.find((a) => a.id === "place");
      expect(place?.effectTags).toContain("placePiece");
      expect(place?.effectTags).toContain("setPieceOwner");
    });
  });
});
