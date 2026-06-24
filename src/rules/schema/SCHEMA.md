# Game Schema v2 — Reference Manual

The schema is a **declarative language for describing board games as JSON**.
A game definition is a plain object that assembles eight kinds of building
block.  No code, no functions, no inheritance — just composable data.

```
Space → Relations → Pieces
                           ↘
                     CellSelector / Condition
                           ↗
                     Effects → Moves → Game
```

The runtime reads a `GameSchema` document, validates it, and produces a live
game engine capable of enumerating legal moves, applying them, detecting
termination, and determining the winner.

---

## Table of Contents

1. [References — the atoms every node shares](#1-references)
2. [Space — the board topology](#2-space)
3. [Relations — neighborhood maps](#3-relations)
4. [Pieces — game object types](#4-pieces)
5. [CellSelector — set queries](#5-cellselector)
6. [Condition — boolean queries](#6-condition)
7. [Effects — state mutations](#7-effects)
8. [Moves — player actions](#8-moves)
9. [Game — top-level assembly](#9-game)
10. [Quick reference tables](#10-quick-reference)

---

## 1  References

**File:** `src/rules/schema/primitives.ts`

References are the atoms that appear inside every other node.
They always look like strings in JSON, so the schema stays plain JSON.

### PlayerRef

Identifies who acts or who owns a piece.

| Value | Meaning |
|-------|---------|
| `"$current"` | Whoever's turn it is |
| `"$opponent"` | The other player (2-player games) |
| `"$any"` | Any player — used in conditions and selectors |
| `"$none"` | Explicitly ownerless — used in effects to clear ownership |
| `"black"`, `"white"`, … | A named player from `game.players` |

### CellRef

Points to a specific cell on the board.

```
"a1"       ← literal coordinate
"$source"  ← a binding variable (the cell chosen for the binding named "source")
"$target"  ← another binding variable
```

Any string starting with `$` is a variable; everything else is a literal coordinate.

### Other references

| Type | Points to |
|------|-----------|
| `PieceRef` | A piece type id from `game.pieceTypes` |
| `RelationRef` | A named relation from `game.relations` |
| `ZoneRef` | A named zone from `game.zones` |
| `MoveRef` | A move id from `game.moves` |

### NumExpr — numeric expressions

Wherever a number is needed (distance, count, score threshold), a `NumExpr`
can be a literal integer or a computed value:

```typescript
// Literal
3

// Read a live game stat
{ stat: "pieceCount", piece: "stone", owner: "$current" }
{ stat: "turnNumber" }
{ stat: "score",      player: "$current" }
{ stat: "varValue",   name: "consecutivePasses" }

// Arithmetic over two sub-expressions
{ op: "add", left: 5, right: { stat: "turnNumber" } }
{ op: "max", left: { stat: "score", player: "black" },
             right: { stat: "score", player: "white" } }
```

Supported ops: `add`, `sub`, `mul`, `min`, `max`.

### CompareOp

`"=="`, `"!="`, `"<"`, `"<="`, `">"`, `">="` — used in conditions.

---

## 2  Space

**File:** `src/rules/schema/space.ts`

The space defines what cells exist and how coordinates work.
Relations and selectors build on top of this topology.

### SquareGrid

A rectangular grid of width × height cells.

```typescript
space: { type: "squareGrid", width: 8, height: 8, coordinates: "algebraic" }
```

Algebraic coordinates: columns are `a`–`h`, rows are `1`–`8`.
Cell `a1` is the bottom-left corner.

Used by: Chess (8×8), Go (9×9 or 19×19), Ataxx (7×7), Reversi (8×8).

### HexGrid

A hexagonal grid. Cells have six neighbors.

```typescript
// 11×11 rhombus (Hex board)
space: { type: "hexGrid", shape: { type: "rhombus", width: 11, height: 11 } }

// Symmetric hexagon (radius 2 = 19 cells)
space: { type: "hexGrid", shape: { type: "hexagon", radius: 2 } }
```

Coordinates default to axial `"q,r"` format (e.g. `"0,0"`, `"-1,2"`).

Used by: Hex, Y, Hive.

### LinearTrack

A sequence of numbered cells, optionally looping.

```typescript
space: { type: "linear", length: 24, wrapping: false }
```

Used by: Backgammon (24 points), track racing games.

### GraphSpace

An arbitrary graph — any topology that doesn't fit a grid.

```typescript
space: {
  type: "graph",
  nodes: ["a", "b", "c", "center"],
  edges: [["a","b"], ["b","center"], ["c","center"]]
}
```

Used by: Nine Men's Morris (24 named intersections), Halma.

### Zones

Named subsets of cells with game-semantic meaning.
Referenced by ZoneRef in selectors, conditions, and result rules.

```typescript
zones: [
  { id: "promotionRank", for: "white", cells: { type: "rank", rank: 8 } },
  { id: "promotionRank", for: "black", cells: { type: "rank", rank: 1 } },
  { id: "center",   cells: { type: "cells", list: ["d4","d5","e4","e5"] } },
]
```

**Zone definitions:**

| Definition | Selects |
|------------|---------|
| `{ type: "cells", list: [...] }` | Explicit list of coordinates |
| `{ type: "rank", rank: 8 }` | Entire row 8 |
| `{ type: "file", file: "d" }` | Entire column d |
| `{ type: "ranks", from: 1, to: 3 }` | Rows 1–3 |
| `{ type: "files", from: "a", to: "c" }` | Columns a–c |
| `{ type: "edge" }` | All cells on the board's outer edge |
| `{ type: "corner" }` | The four corner cells |
| `{ type: "halfBoard", player: "black" }` | Black's starting half |
| `{ type: "union", of: [...] }` | Cells in any of the listed zones |
| `{ type: "intersection", of: [...] }` | Cells in all of the listed zones |

---

## 3  Relations

**File:** `src/rules/schema/relation.ts`

A relation maps a source cell to a **set of reachable cells**.
It answers: *"from this cell, which other cells can I reach?"*

Relations are used in CellSelectors to filter candidates spatially:
*"empty cells within king-distance of $source"*.

A `RelationInput` is either:
- A **string** — the name of a relation defined in `game.relations`
- An **inline Relation object** — defined right where it's used

```typescript
// Named (defined once, reused everywhere):
relations: {
  adjacent:  { type: "chebyshev", distance: 1 },
  jumpRing:  { type: "chebyshev", distance: 2 },
}

// Inline (used directly in a selector):
from: { type: "emptyInRelation", relation: { type: "manhattan", distance: 1 }, from: "$pos" }
```

### Metric relations (exact distance)

**Chebyshev** (king-distance) — counts diagonal steps as 1:

```typescript
{ type: "chebyshev", distance: 1 }   // 8 neighbors (king ring)
{ type: "chebyshev", distance: 2 }   // 16-cell ring (Ataxx jump range)
```

**Manhattan** (orthogonal only) — diagonal steps cost 2:

```typescript
{ type: "manhattan", distance: 1 }   // 4 orthogonal neighbors (Go adjacency)
{ type: "manhattan", distance: 2 }   // cells exactly 2 rook-steps away
```

**Diagonal** (diagonal only) — opposite of manhattan:

```typescript
{ type: "diagonal", distance: 1 }   // 4 diagonal neighbors
```

### Sliding rays

Rays extend from the source cell until they hit the board edge or a piece.

**rookRay** — four orthogonal directions (N/S/E/W):

```typescript
{ type: "rookRay" }                        // stops at any piece
{ type: "rookRay", blockedBy: "enemy" }    // passes through friendly pieces
{ type: "rookRay", blockedBy: "none" }     // never blocked (full cross pattern)
```

**bishopRay** — four diagonal directions (NE/NW/SE/SW):

```typescript
{ type: "bishopRay" }
{ type: "bishopRay", blockedBy: "friendly" }
```

**ray** — a single custom direction:

```typescript
{ type: "ray", dx: 0, dy: 1 }                // north-only
{ type: "ray", dx: 1, dy: 1, maxSteps: 2 }   // NE, at most 2 steps
```

`blockedBy` values:

| Value | Meaning |
|-------|---------|
| `"any"` (default) | Ray stops before any piece |
| `"enemy"` | Stops before enemy pieces; passes through friendly |
| `"friendly"` | Stops before friendly pieces; passes through enemy |
| `"none"` | Never blocked (full ray to board edge) |

### Leaps

A leap jumps to a fixed offset regardless of what's in between.

```typescript
{ type: "leap", dx: 2, dy: 1 }                    // specific (2,1) jump
{ type: "leap", dx: 2, dy: 1, rotations: "all8" } // standard knight (8 destinations)
{ type: "leap", dx: 2, dy: 1, rotations: "all4" } // 4-fold symmetry (camel)
{ type: "leap", dx: 1, dy: 0, rotations: "none" } // directional (eastward only)
```

Classic knights: `dx: 2, dy: 1, rotations: "all8"`.

### Player-relative

These flip automatically based on which player is acting.
Player 0 (first in `players` list) moves "up"; player 1 moves "down".

```typescript
{ type: "forward",         steps: 1 }               // one step toward opponent's side
{ type: "forward",         steps: 2, onlyFrom: "homeRank" }  // pawn double push
{ type: "forwardDiagonal", steps: 1 }               // pawn capture direction
{ type: "forwardAny",      steps: 1 }               // forward + both diagonals (no backward)
```

### Structural relations

**graphDistance** — hops along the board's adjacency graph:

```typescript
{ type: "graphDistance", hops: 1 }  // direct neighbors (any board type)
```

**floodFill** — all same-color stones reachable via connected adjacency:

```typescript
{ type: "floodFill", piece: "stone", owner: "$current" }  // all my connected stones
```

Used for Go group detection.

### Combinators

Relations compose the same way boolean logic does.

**union** — cells reachable by ANY of the sub-relations:

```typescript
// Queen = rook + bishop
{ type: "union", of: ["rookRay", "bishopRay"] }

// Ataxx combined range
{ type: "union", of: ["cloneRange", "jumpRange"] }
```

**intersection** — cells reachable by ALL sub-relations:

```typescript
{ type: "intersection", of: [{ type: "rookRay" }, { type: "bishopRay" }] }
// empty — a cell can't be on both an orthogonal and diagonal ray from the same source
```

**compose** — apply `first`, then from each result apply `then`:

```typescript
// One orthogonal step then one diagonal step (not a standard piece, but valid)
{ type: "compose", first: { type: "manhattan", distance: 1 },
                   then:  { type: "diagonal",  distance: 1 } }
```

**excluding** — remove cells matched by another relation:

```typescript
{ type: "excluding", base: "rookRay", exclude: { type: "manhattan", distance: 1 } }
// Rook ray, skipping the immediately adjacent cells
```

**byPlayer** — different relations for different players:

```typescript
{
  type: "byPlayer",
  cases: [
    { player: "black", relation: { type: "forward", steps: 1 } },
    { player: "white", relation: { type: "forward", steps: 1 } }, // flips automatically
  ]
}
```

---

## 4  Pieces

**File:** `src/rules/schema/pieces.ts`

A `PieceType` is a class of game object. Individual pieces on the board are
instances of a type, owned by a player and occupying a cell.

Piece types do **not** embed their movement rules — moves are defined
separately and reference piece types by id.

```typescript
pieceTypes: [
  {
    id: "pawn",
    label: "Pawn",
    symbol: "♟",

    ownership: "player",    // belongs to one of the game's players
    stacking: "single",     // one pawn per cell
    facing: "forward",      // has a player-relative orientation

    capturedAs: "remove",   // leaves the board when captured

    promotion: {
      intoAny: ["queen", "rook", "bishop", "knight"],  // player's choice
      when: "entersZone",
      zone: "promotionRank",
    }
  }
]
```

### Attributes

**ownership:**

| Value | Meaning |
|-------|---------|
| `"player"` | Belongs to a specific player (chess pieces, Go stones) |
| `"neutral"` | On the board with no player owner (terrain, obstacles) |
| `"shared"` | Belongs to the game itself (counters, dice) |

**stacking:**

| Value | Meaning |
|-------|---------|
| `"single"` (default) | At most one piece per cell |
| `"stack"` | Any number of pieces may stack |
| `{ max: N }` | At most N pieces per cell |

**facing:**

| Value | Meaning |
|-------|---------|
| `"none"` (default) | Symmetric; orientation doesn't matter (stones, rooks) |
| `"forward"` | Oriented toward the player's forward direction (pawns) |
| `"fixed"` | Orientation set explicitly at placement |

**capturedAs:**

| Value | Meaning |
|-------|---------|
| `"remove"` (default) | Piece leaves the board (chess) |
| `"convert"` | Piece changes owner and stays (Ataxx, Reversi) |
| `"toReserve"` | Goes to the capturing player's reserve for later drops (Shogi) |

**promotion:**

```typescript
promotion: {
  into: "king",          // auto-promote to a single type (checkers king)
  // — or —
  intoAny: ["queen", "rook", "bishop", "knight"],  // player chooses
  when: "entersZone",
  zone: "promotionRank",
}
```

---

## 5  CellSelector

**File:** `src/rules/schema/logic.ts`

A `CellSelector` evaluates to a **set of cells**.
It is the query language used in bindings and effects to describe
which cells participate in an action.

### Universe selectors

```typescript
{ type: "all" }        // every cell on the board
{ type: "empty" }      // cells with no piece
{ type: "occupied" }   // cells with at least one piece
```

### Specific cells

```typescript
{ type: "cell",  coord: "e4" }                    // one named cell
{ type: "cells", coords: ["d4","d5","e4","e5"] }  // explicit list
{ type: "bound", name: "$target" }                 // the cell chosen for a binding
```

### Piece filters

```typescript
{ type: "withPiece", piece: "stone", owner: "$current" }  // my stones
{ type: "withPiece", piece: "pawn" }                      // any player's pawns
{ type: "withOwner", owner: "$opponent" }                 // all opponent pieces
```

### Spatial filters

These are the most common selectors in move bindings:

**inRelation** — cells reachable from a specific cell via a relation:

```typescript
{ type: "inRelation", relation: "rookRay", from: "$source" }
// All cells the rook at $source could slide to
```

**emptyInRelation** — shorthand for inRelation filtered to empty cells:

```typescript
{ type: "emptyInRelation", relation: "adjacent", from: "$source" }
// Empty cells adjacent to $source — common move target
```

**ownedInRelation** — cells in a relation owned by a specific player:

```typescript
{
  type: "ownedInRelation",
  relation: "adjacent",
  from: "$target",
  owner: "$opponent",
  piece: "stone",   // optional: filter to a specific piece type
}
// Opponent stones adjacent to $target — Ataxx convert targets
```

**inZone** — cells inside a named zone:

```typescript
{ type: "inZone", zone: "homeRank" }
```

**atEdge**, **atCorner** — board boundary cells:

```typescript
{ type: "atEdge" }
{ type: "atCorner" }
```

### Derived selectors

**frontier** — empty cells adjacent to all pieces owned by a player:

```typescript
{ type: "frontier", owner: "$current", piece: "stone" }
// Empty intersections next to my connected group (Go liberties)
```

**between** — cells on a straight line between two cells (exclusive):

```typescript
{ type: "between", from: "$source", to: "$target" }
// Cells the rook passes through — useful for checking path clearance
```

### Boolean combinators

```typescript
{ type: "and", of: [selectorA, selectorB] }   // cells in ALL selectors
{ type: "or",  of: [selectorA, selectorB] }   // cells in ANY selector
{ type: "not", of: selector, within: base }   // cells in base but NOT in selector
```

### Conditional filter

The most flexible selector — applies an arbitrary condition to each candidate:

```typescript
{
  type: "where",
  base: { type: "empty" },
  where: {
    type: "exists",
    in: { type: "ownedInRelation", relation: "adjacent", from: "$cell", owner: "$opponent" },
  }
}
// Empty cells that have at least one adjacent opponent piece
// $cell is the iteration variable: each candidate from base is tested
```

The `$cell` variable inside a `where` condition refers to the candidate cell
being tested from the `base` selector.

---

## 6  Condition

**File:** `src/rules/schema/logic.ts`

A `Condition` evaluates to **true or false** about the current game state.
Conditions appear in move guards, effect branches, end conditions, and
zone-entry checks.

### Cell inspection

```typescript
{ type: "isEmpty",   cell: "$target" }
{ type: "isOccupied", cell: "$target" }
{ type: "isOwnedBy",  cell: "$target", owner: "$current" }
{ type: "hasPiece",   cell: "$source", piece: "king", owner: "$current" }
{ type: "inZone",     cell: "$target", zone: "promotionRank" }
```

### Count conditions

```typescript
{ type: "pieceCount", piece: "stone", owner: "$current", op: ">=", value: 1 }
// True iff the current player has at least one stone

{ type: "selectorCount", selector: { type: "empty" }, op: "==", value: 0 }
// True iff there are no empty cells (board full)
```

### Board state

```typescript
{ type: "boardFull" }    // every cell is occupied
{ type: "boardEmpty" }   // no cell has any piece
```

### Move availability

```typescript
{ type: "playerHasMove",   player: "$current", moves: ["clone", "jump"] }
{ type: "playerHasNoMove", player: "$current", moves: ["clone", "jump"] }
// Used for pass guards: pass is only available when no other moves exist
```

### Turn conditions

```typescript
{ type: "turnNumber", op: ">=", value: 40 }
{ type: "isFirstTurn" }
{ type: "isPlayerTurn", player: "black" }
```

### Score conditions

```typescript
{ type: "score", player: "$current", op: ">=", value: 100 }
```

### Variable conditions

```typescript
// Compare an int/bool variable to a numeric expression
{ type: "varEquals", name: "consecutivePasses", value: 2 }

// Compare a cell-type variable to a coordinate
{ type: "cellVarEquals", name: "koPoint", cell: "$target" }
// True iff the stored ko point equals the cell $target
```

### Spatial / structural conditions

**connects** — is there a path of same-color pieces between two zones?

```typescript
{
  type: "connects",
  owner: "$current",
  fromZone: "leftEdge",
  toZone: "rightEdge",
  piece: "stone",
}
// Hex win condition: a connected chain from left to right edge
```

**groupHasLiberty** — does the group at this cell have any empty neighbors?

```typescript
{ type: "groupHasLiberty", cell: "$target", piece: "stone" }
// True iff the connected group at $target has at least one liberty
```

**groupSurrounded** — does the group have zero liberties?

```typescript
{ type: "groupSurrounded", cell: "$cell" }
// True iff the group is fully surrounded (ready to be captured in Go)
```

### Quantifiers

**exists** — is there at least one cell in a selector satisfying a condition?

```typescript
{
  type: "exists",
  in: { type: "ownedInRelation", relation: "adjacent", from: "$target", owner: "$opponent" },
  condition: { type: "groupSurrounded", cell: "$cell" },
}
// True iff at least one adjacent enemy group is surrounded (Go self-capture exception)
```

**forAll** — do all cells in a selector satisfy a condition?

```typescript
{
  type: "forAll",
  in: { type: "withPiece", piece: "stone", owner: "$opponent" },
  condition: { type: "groupSurrounded", cell: "$cell" },
}
// True iff every opponent stone belongs to a surrounded group
```

**exactly** — do exactly N cells satisfy a condition?

```typescript
{ type: "exactly", count: 1, in: capturedGroupSelector }
// True iff exactly one stone was captured (simple ko condition)
```

### Boolean combinators

```typescript
{ type: "not", of: condition }
{ type: "and", of: [condA, condB, condC] }
{ type: "or",  of: [condA, condB] }
```

### Variable reference in conditions

Inside `exists` / `forAll` / `exactly` / `where`, the variable `"$cell"`
refers to the current candidate being tested from the inner selector.

---

## 7  Effects

**File:** `src/rules/schema/effects.ts`

An `Effect` describes one atomic state mutation.
Effects are applied in order; each step sees the board as left by the previous step.

### Piece effects

**place** — put a new piece on the board:

```typescript
{ type: "place", piece: "stone", owner: "$current", at: "$target" }
```

**remove** — take a piece off the board:

```typescript
{ type: "remove", at: "$source" }
```

**move** — relocate a piece (equivalent to remove + place):

```typescript
{ type: "move", from: "$source", to: "$target" }
```

**swap** — exchange the pieces on two cells:

```typescript
{ type: "swap", a: "$source", b: "$target" }
```

**promote** — change a piece's type while preserving ownership:

```typescript
{ type: "promote", at: "$target", to: "queen" }
```

**capture** — remove a piece and record it as captured (triggers `capturedAs` behavior):

```typescript
{ type: "capture", at: "$target", by: "$current" }
// If capturedAs: "toReserve", the piece goes to the capturing player's hand
```

### Ownership effects

**setOwner** — change who owns the piece on a cell:

```typescript
{ type: "setOwner", at: "$target", owner: "$current" }
// setOwner with "$none" removes the piece (same as remove for single-stack)
```

**convert** — bulk ownership change across a selector:

```typescript
{
  type: "convert",
  in: {
    type: "ownedInRelation",
    relation: "adjacent",
    from: "$target",
    owner: "$opponent",
    piece: "stone",
  },
  toOwner: "$current",
}
// Ataxx: flip all adjacent enemy stones to my color
```

`convert` is shorthand for `forEach(selector, setOwner(toOwner))`.

### Score effects

```typescript
{ type: "addScore", player: "$current", amount: 1 }
{ type: "setScore", player: "black",    amount: { stat: "pieceCount", piece: "stone", owner: "black" } }
```

### Turn effects

**advanceTurn** — move to the next player according to `game.turns`:

```typescript
{ type: "advanceTurn" }
```

**setNextPlayer** — override who goes next:

```typescript
{ type: "setNextPlayer", player: "$current" }  // bonus turn
```

### Variable effects

```typescript
{ type: "setVar",       name: "enPassantTarget", value: "$target" }
{ type: "setVar",       name: "koPoint",         value: null }      // clear the variable
{ type: "incrementVar", name: "consecutivePasses", by: 1 }          // by defaults to 1
```

### Control flow effects

**forEach** — apply an effect to every cell in a selector:

```typescript
{
  type: "forEach",
  in: { type: "inRelation", relation: "group", from: "$capturedStone" },
  do: { type: "remove", at: "$cell" },
}
// Go: remove every stone in the captured group
// Inside `do`, $cell refers to the current iteration cell
```

> The selector in `forEach.in` is evaluated **before** any mutations.
> All cells are collected first, then the effect is applied to each in turn.

**if** — conditional effect:

```typescript
{
  type: "if",
  condition: { type: "inZone", cell: "$target", zone: "promotionRank" },
  then: { type: "promote", at: "$target", to: "queen" },
  else: { type: "advanceTurn" },   // else is optional
}
```

**sequence** — run effects in order:

```typescript
{
  type: "sequence",
  effects: [
    { type: "move", from: "$source", to: "$target" },
    { type: "convert", in: adjacentEnemies, toOwner: "$current" },
    { type: "advanceTurn" },
  ]
}
```

In practice, the top-level `effects` array on a Move is already a sequence,
so you only need `sequence` when nesting effects inside `forEach` or `if`.

---

## 8  Moves

**File:** `src/rules/schema/moves.ts`

A `Move` is the primary action primitive.
It ties together who acts, which cells are selected, when the move is legal,
and what changes happen.

### Bindings — parameterising a move

A `Binding` resolves a named variable to a single cell chosen from a selector.
Bindings are evaluated left-to-right; each can reference the cells chosen by
earlier bindings using `$name` variables.

```typescript
bindings: [
  {
    name: "source",
    from: { type: "withPiece", piece: "stone", owner: "$current" },
    prompt: "Choose one of your stones",
  },
  {
    name: "target",
    from: { type: "emptyInRelation", relation: "adjacent", from: "$source" },
    prompt: "Choose an empty adjacent cell",
  },
]
```

The binding named `"source"` is available as `"$source"` in all subsequent
bindings, in `condition`, and in `effects`.

The `where` field on a binding adds an extra condition evaluated per candidate:

```typescript
{
  name: "target",
  from: { type: "empty" },
  where: {
    type: "not",
    of: { type: "cellVarEquals", name: "koPoint", cell: "$target" }
  }
}
// Go: any empty cell that is not the ko point
```

### Move structure

```typescript
{
  id: "clone",
  label: "Clone",
  category: "placement",        // UI hint only
  description: "...",           // for the generated rulebook

  actor: "$current",            // default — rarely changed
  forPiece: "stone",            // optional: restrict to this piece type

  bindings: [ /* source, target */ ],

  // Condition checked per binding combination:
  condition: {
    type: "not",
    of: { type: "groupSurrounded", cell: "$target" }
  },

  // Guard checked once for the whole move type:
  allowedOnly: {
    type: "playerHasNoMove",
    player: "$current",
    moves: ["clone", "jump"],
  },

  effects: [
    { type: "place", piece: "stone", owner: "$current", at: "$target" },
    { type: "convert", in: adjacentEnemies, toOwner: "$current" },
    { type: "advanceTurn" },
  ],

  phases: ["play"],             // optional: only available in named phases
  notation: "$source-$target",  // optional: move notation template
}
```

### `condition` vs `allowedOnly`

| | `condition` | `allowedOnly` |
|---|---|---|
| **Checked** | Once per binding combination | Once per turn for the whole move |
| **Purpose** | "This specific binding choice is illegal" | "This move type is unavailable at all" |
| **Examples** | King not in check after moving, path is clear | Pass (only when no other moves available) |

### Pass moves

Pass has no bindings and uses `allowedOnly` to restrict when it appears:

```typescript
{
  id: "pass",
  label: "Pass",
  category: "pass",
  allowedOnly: {
    type: "playerHasNoMove",
    player: "$current",
    moves: ["place"],
  },
  effects: [
    { type: "incrementVar", name: "consecutivePasses" },
    { type: "advanceTurn" },
  ],
}
```

---

## 9  Game

**File:** `src/rules/schema/game.ts`

The `GameSchema` is the top-level document that assembles all building blocks.

### Minimal skeleton

```typescript
const myGame: GameSchema = {
  version: "2",
  id: "mygame",
  name: "My Game",
  players: ["red", "blue"],

  space: { type: "squareGrid", width: 8, height: 8 },
  pieceTypes: [ /* ... */ ],
  setup: [ /* ... */ ],
  moves: [ /* ... */ ],

  turns:  { type: "alternating", startsWith: "red" },
  end:    [ { type: "boardFull" } ],
  result: { type: "maxPieceCount", piece: "stone", tie: "draw" },
};
```

### Turn structure

**alternating** — classic A/B/A/B:

```typescript
turns: { type: "alternating", startsWith: "black" }
```

**roundRobin** — N players in a fixed order:

```typescript
turns: { type: "roundRobin", order: ["north", "east", "south", "west"] }
```

**simultaneous** — all players act at once (uncommon in abstract games).

**custom** — an explicit finite state machine:

```typescript
turns: {
  type: "custom",
  states: [
    { id: "black-move",   actor: "black", after: "white-move", initial: true },
    { id: "white-move",   actor: "white", after: "black-move" },
    { id: "black-bonus",  actor: "black", after: "white-move" },
  ]
}
```

### Phases

Optional macro-level game stages. Each phase restricts which moves are available.

```typescript
phases: [
  {
    id: "placement",
    label: "Placement phase",
    moves: ["place"],
    endsWhen: { type: "pieceCount", piece: "stone", owner: "$any", op: ">=", value: 9 },
    next: "movement",
  },
  {
    id: "movement",
    label: "Movement phase",
    moves: ["slide", "pass"],
    endsWhen: { type: "pieceCount", piece: "stone", owner: "$any", op: "==", value: 3 },
    next: "flying",
  },
  {
    id: "flying",
    label: "Flying phase",
    moves: ["fly", "pass"],
    endsWhen: { type: "pieceCount", piece: "stone", owner: "$any", op: "==", value: 0 },
  },
]
// Nine Men's Morris — three distinct phases
```

### State variables

Declare variables here; write them with `setVar`/`incrementVar` effects; read
them with `varEquals`/`cellVarEquals` conditions.

```typescript
vars: [
  { name: "consecutivePasses", type: "int",  initial: 0 },
  { name: "enPassantTarget",   type: "cell", initial: null },
  { name: "castlingRights",    type: "int",  initial: 0b1111 },
  { name: "koPoint",           type: "cell", initial: null },
]
```

Types: `"int"`, `"bool"`, `"cell"`, `"player"`.

### Setup

Initial piece placements. `at` accepts a coordinate, a list, or a zone name
(places one piece on every cell in the zone).

```typescript
setup: [
  { place: "stone", owner: "black", at: ["a1", "g7"] },
  { place: "stone", owner: "white", at: ["g1", "a7"] },
  { place: "pawn",  owner: "white", at: "homeRank" },   // fills the entire rank
]
```

### End conditions

The game ends as soon as **any** condition is true:

| Condition | Meaning |
|-----------|---------|
| `{ type: "boardFull" }` | Every cell is occupied |
| `{ type: "boardEmpty" }` | No piece is on the board |
| `{ type: "pieceCount", piece, owner, op, count }` | Piece count crosses a threshold |
| `{ type: "playerNoMove", player, moves }` | A player has no legal moves |
| `{ type: "allPlayersNoMove", moves }` | No player has any legal moves |
| `{ type: "turnLimit", turns }` | A fixed number of turns has elapsed |
| `{ type: "scoreReached", player, op, value }` | A score threshold is reached |
| `{ type: "connectivity", owner, fromZone, toZone }` | A player connects two zones (Hex) |
| `{ type: "consecutivePasses", count }` | N passes in a row (Go: 2, Reversi: 2) |
| `{ type: "condition", condition }` | Any arbitrary condition |

### Result rules

Evaluated exactly once after the game ends:

| Rule | Meaning |
|------|---------|
| `{ type: "maxPieceCount", piece, tie? }` | Most pieces wins |
| `{ type: "minPieceCount", piece, tie? }` | Fewest pieces wins |
| `{ type: "maxScore", tie? }` | Highest score wins |
| `{ type: "minScore", tie? }` | Lowest score wins |
| `{ type: "playerWins", player }` | A specific player wins unconditionally |
| `{ type: "lastMoverWins" }` | The player who just moved wins |
| `{ type: "lastMoverLoses" }` | The player who just moved loses (misère) |
| `{ type: "currentPlayerLoses" }` | The player who can't move loses |
| `{ type: "firstMatch", cases, else? }` | Evaluate conditions in order; first true wins |

The `firstMatch` rule is the most general:

```typescript
result: {
  type: "firstMatch",
  cases: [
    {
      condition: { type: "pieceCount", piece: "king", owner: "black", op: "==", value: 0 },
      winner: "white",
    },
    {
      condition: { type: "pieceCount", piece: "king", owner: "white", op: "==", value: 0 },
      winner: "black",
    },
  ],
  else: "draw",
}
```

---

## 10  Quick Reference

### Relations at a glance

| Type | Key fields | Classic use |
|------|------------|-------------|
| `chebyshev` | `distance` | King, Ataxx clone/jump |
| `manhattan` | `distance` | Go adjacency, orthogonal neighbors |
| `diagonal` | `distance` | Diagonal neighbors only |
| `rookRay` | `blockedBy?` | Rook, queen ortho component |
| `bishopRay` | `blockedBy?` | Bishop, queen diag component |
| `ray` | `dx, dy, maxSteps?, blockedBy?` | Single custom direction |
| `leap` | `dx, dy, rotations?` | Knight, camel, giraffe |
| `forward` | `steps?, onlyFrom?` | Pawn push |
| `forwardDiagonal` | `steps?` | Pawn capture |
| `forwardAny` | `steps?` | Checker (non-king) |
| `floodFill` | `piece?, owner?` | Go group membership |
| `graphDistance` | `hops` | Graph-topology neighbors |
| `union` | `of[]` | Queen = rook + bishop |
| `intersection` | `of[]` | Narrow candidate sets |
| `compose` | `first, then` | Multi-step paths |
| `excluding` | `base, exclude` | Subtract a sub-relation |
| `byPlayer` | `cases[]` | Per-player movement rules |

### CellSelector at a glance

| Type | Returns |
|------|---------|
| `all` | Every cell |
| `empty` | Cells with no piece |
| `occupied` | Cells with any piece |
| `cell` | One named cell |
| `cells` | Explicit list |
| `bound` | Cell stored in a binding variable |
| `withPiece` | Cells holding a specific piece type |
| `withOwner` | All cells owned by a player |
| `inRelation` | Cells reachable via a relation |
| `emptyInRelation` | Empty cells reachable via a relation |
| `ownedInRelation` | Owned cells reachable via a relation |
| `inZone` | Cells inside a named zone |
| `atEdge` | Board edge cells |
| `atCorner` | Corner cells |
| `frontier` | Empty cells adjacent to a player's group |
| `between` | Cells on a line between two cells |
| `and` | Intersection of multiple selectors |
| `or` | Union of multiple selectors |
| `not` | Cells not in a selector |
| `where` | Cells filtered by an arbitrary condition |

### Condition at a glance

| Type | Tests |
|------|-------|
| `isEmpty` / `isOccupied` | Occupancy of a cell |
| `isOwnedBy` | Ownership of a cell |
| `hasPiece` | Whether a specific piece is at a cell |
| `inZone` | Whether a cell is in a zone |
| `pieceCount` | A player's total piece count |
| `selectorCount` | How many cells match a selector |
| `boardFull` / `boardEmpty` | Board-wide occupancy |
| `playerHasMove` / `playerHasNoMove` | Legal move availability |
| `turnNumber` | Current turn |
| `isFirstTurn` | Whether it's the very first turn |
| `isPlayerTurn` | Whether it's a specific player's turn |
| `score` | A player's score |
| `varEquals` | Whether an int/bool variable matches a value |
| `cellVarEquals` | Whether a cell variable matches a coordinate |
| `connects` | Connection between two zones |
| `groupHasLiberty` | Whether a group has empty neighbors |
| `groupSurrounded` | Whether a group is fully enclosed |
| `exists` | At least one cell satisfies a condition |
| `forAll` | All cells satisfy a condition |
| `exactly` | Exactly N cells satisfy a condition |
| `not` / `and` / `or` | Boolean combinators |

### Effect at a glance

| Type | Does |
|------|------|
| `place` | Put a new piece on the board |
| `remove` | Take a piece off the board |
| `move` | Relocate a piece |
| `swap` | Exchange two cells |
| `promote` | Change a piece's type |
| `capture` | Remove a piece and record it as captured |
| `setOwner` | Change ownership of one cell |
| `convert` | Bulk ownership change across a selector |
| `addScore` | Add to a player's score |
| `setScore` | Set a player's score |
| `advanceTurn` | Move to the next player |
| `setNextPlayer` | Override who goes next |
| `setVar` | Write a game variable |
| `incrementVar` | Add to a numeric game variable |
| `forEach` | Apply an effect to every cell in a selector |
| `if` | Conditional effect |
| `sequence` | Execute a list of effects in order |

---

## Design notes

### Why separate CellSelector and Condition?

They answer different questions:
- `CellSelector` → *which cells match?* (returns a set)
- `Condition` → *is this true?* (returns a boolean)

They reference each other: `where` wraps a selector with a condition;
`exists`/`forAll` test conditions over a selector. Keeping them separate
lets the type system enforce that selectors appear where sets are needed
and conditions appear where booleans are needed.

### Why no functions in the schema?

The schema is pure data — no JavaScript functions, no closures, no `eval`.
This enables:
- Full serialization to/from JSON
- Static validation without executing game logic
- Automatic rulebook generation from the schema alone
- Deterministic replay from a log of moves

### How binding variables flow

Variables follow a strict left-to-right scoping rule:

```
binding[0]: name="source"  →  $source available from here
binding[1]: name="target"  →  $target available from here (can use $source)
condition                  →  can use $source and $target
effects                    →  can use $source and $target
```

Inside `forEach.do`, the additional variable `$cell` refers to the current
iteration cell and shadows any outer `$cell`.

### The $cell iteration variable

`$cell` is the implicit variable inside `where` conditions and `forEach` bodies.
In `where`:

```typescript
{
  type: "where",
  base: { type: "empty" },
  where: someCondition,  // $cell = each candidate from base
}
```

In `forEach`:

```typescript
{
  type: "forEach",
  in: someSelector,
  do: { type: "remove", at: "$cell" },  // $cell = each cell from the selector
}
```
