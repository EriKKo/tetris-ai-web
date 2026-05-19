// Port of EriKKo/tetris-ai (Java) to JavaScript.
// Original packages: model.*, solvers.*, util.*

export const WIDTH = 10;
export const HEIGHT = 22;
export const VISIBLE_HEIGHT = 20;

export const EMPTY = 0;
export const MINO = 1;
export const UNBREAKABLE = 2;

export const TYPE_I = 0;
export const TYPE_T = 1;
export const TYPE_O = 2;
export const TYPE_L = 3;
export const TYPE_J = 4;
export const TYPE_S = 5;
export const TYPE_Z = 6;

const TYPE_NAMES = ['I', 'T', 'O', 'L', 'J', 'S', 'Z'];

// ---------- Tetrimino ----------

function rotateOnce(points) {
  // Mirrors Tetrimino.rotate() in Java: (r,c) -> (-c, r)
  return points.map(([r, c]) => [-c, r]);
}

class Tetrimino {
  constructor(points, type, rotation) {
    this.points = points;
    this.type = type;
    this.rotation = rotation;
    this.name = TYPE_NAMES[type] + '-mino';
  }
  rotateClockWise() { return MINOS[this.type][(this.rotation + 1) & 3]; }
  rotateCounterClockWise() { return MINOS[this.type][(this.rotation + 3) & 3]; }
  toString() { return this.name; }
}

const BASE_POINTS = {
  [TYPE_I]: [[0, 0], [0, -1], [0, 1], [0, 2]],
  [TYPE_T]: [[0, 0], [0, -1], [0, 1], [1, 0]],
  [TYPE_O]: [[0, 0], [0, 1], [-1, 1], [-1, 0]],
  [TYPE_L]: [[0, 0], [0, -1], [0, 1], [1, 1]],
  [TYPE_J]: [[0, 0], [0, -1], [1, -1], [0, 1]],
  [TYPE_S]: [[0, 0], [1, 0], [1, 1], [0, -1]],
  [TYPE_Z]: [[0, 0], [1, 0], [1, -1], [0, 1]],
};

const MINOS = [];
for (let t = 0; t < 7; t++) {
  MINOS.push([]);
  if (t === TYPE_I) {
    // I-piece uses explicit per-rotation shapes in the original to keep its
    // axis fixed (it doesn't share BASE_POINTS rotation behavior).
    const iShapes = [
      [[0, 0], [0, -1], [0, 1], [0, 2]],
      [[0, 1], [-1, 1], [-2, 1], [1, 1]],
      [[0, 0], [0, -1], [0, 1], [0, 2]],
      [[0, 0], [-1, 0], [-2, 0], [1, 0]],
    ];
    for (let r = 0; r < 4; r++) MINOS[t].push(new Tetrimino(iShapes[r], t, r));
  } else if (t === TYPE_O) {
    // O-piece doesn't rotate.
    for (let r = 0; r < 4; r++) {
      MINOS[t].push(new Tetrimino(BASE_POINTS[t].map(p => [...p]), t, r));
    }
  } else {
    let pts = BASE_POINTS[t].map(p => [...p]);
    MINOS[t].push(new Tetrimino(pts, t, 0));
    for (let r = 1; r < 4; r++) {
      pts = rotateOnce(pts);
      MINOS[t].push(new Tetrimino(pts, t, r));
    }
  }
}

export function getTetriminoType(type) { return MINOS[type][0]; }
export function getTetrimino(type, rotation) { return MINOS[type][rotation & 3]; }

// ---------- Board ----------

function emptyBoard() {
  const b = new Array(HEIGHT);
  for (let r = 0; r < HEIGHT; r++) b[r] = new Array(WIDTH).fill(EMPTY);
  return b;
}

function copyBoard(board) {
  const b = new Array(HEIGHT);
  for (let r = 0; r < HEIGHT; r++) b[r] = board[r].slice();
  return b;
}

export class TetrisBoard {
  constructor(board) {
    this.board = board || emptyBoard();
    this.clearedLine = false;
  }

  getBoard() { return copyBoard(this.board); }

  getHeights() {
    const h = new Array(WIDTH).fill(0);
    for (let r = 0; r < HEIGHT; r++) {
      for (let c = 0; c < WIDTH; c++) {
        if (this.board[r][c] !== EMPTY) h[c] = r + 1;
      }
    }
    return h;
  }

  createCopy() {
    const nb = new TetrisBoard(copyBoard(this.board));
    return nb;
  }

  removeFullLines() {
    this.clearedLine = false;
    let row = 0;
    let cleared = 0;
    for (let r = 0; r < HEIGHT; r++) {
      let full = true;
      for (let c = 0; c < WIDTH; c++) {
        if (this.board[r][c] !== MINO) { full = false; break; }
      }
      if (!full) {
        if (row !== r) {
          for (let c = 0; c < WIDTH; c++) this.board[row][c] = this.board[r][c];
        }
        row++;
      } else {
        this.clearedLine = true;
        cleared++;
      }
    }
    while (row < HEIGHT) {
      for (let c = 0; c < WIDTH; c++) this.board[row][c] = EMPTY;
      row++;
    }
    return cleared;
  }

  canPlaceTetrimino(mino, r, c) {
    for (const [dr, dc] of mino.points) {
      const pr = r + dr, pc = c + dc;
      if (pr < 0 || pr >= HEIGHT || pc < 0 || pc >= WIDTH) return false;
      if (this.board[pr][pc] !== EMPTY) return false;
    }
    return true;
  }

  placeTetrimino(mino, r, c) {
    const nb = this.createCopy();
    for (const [dr, dc] of mino.points) {
      nb.board[r + dr][c + dc] = MINO;
    }
    const cleared = nb.removeFullLines();
    nb.linesCleared = cleared;
    return nb;
  }

  canDropTetrimino(mino, c) {
    return this.canPlaceTetrimino(mino, VISIBLE_HEIGHT - 1, c);
  }

  // Returns the landing row when dropping `mino` straight down at column `c`,
  // starting from row VISIBLE_HEIGHT - 1. Returns null if the piece can't be
  // placed at the spawn row (game over).
  getDropRow(mino, c) {
    if (!this.canDropTetrimino(mino, c)) return null;
    for (let r = VISIBLE_HEIGHT - 2; r >= 0; r--) {
      if (!this.canPlaceTetrimino(mino, r, c)) return r + 1;
    }
    return 0;
  }

  dropMino(mino, c) {
    const r = this.getDropRow(mino, c);
    if (r === null) return null;
    return this.placeTetrimino(mino, r, c);
  }

  isGameOver() {
    for (let r = VISIBLE_HEIGHT; r < HEIGHT; r++) {
      for (let c = 0; c < WIDTH; c++) {
        if (this.board[r][c] !== EMPTY) return true;
      }
    }
    return false;
  }

  getBoardPenalty(params) {
    if (this.isGameOver()) return Number.POSITIVE_INFINITY;
    let res = 0;
    const h = new Array(WIDTH).fill(0);
    const cnt = new Array(WIDTH).fill(0);
    for (let r = 0; r < HEIGHT; r++) {
      for (let c = 0; c < WIDTH; c++) {
        if (this.board[r][c] !== EMPTY) { h[c] = r + 1; cnt[c]++; }
      }
    }
    let hMin = h[0], hMax = h[0];
    for (let c = 1; c < WIDTH - 1; c++) {
      if (h[c] < hMin) hMin = h[c];
      if (h[c] > hMax) hMax = h[c];
    }
    if (h[WIDTH - 1] > hMax) hMax = h[WIDTH - 1];
    res += params.HEIGHT_DIFFERENCE_FACTOR * (hMax - hMin);

    for (let c = 0; c < WIDTH; c++) {
      const covered = h[c] - cnt[c];
      if (c < WIDTH - 1) {
        res += covered * params.COVERED_PENALTY;
      } else {
        res += covered * params.COVER_RIGHTMOST_PENALTY;
        res += cnt[c] * params.HEIGHT_RIGHTMOST_PENALTY;
      }
    }

    let prev = h[0];
    let prevChanged = false;
    for (let c = 0; c < WIDTH - 1; c++) {
      if (h[c] !== prev) {
        if (prevChanged) res += params.CONSECUTIVE_CHANGE_PENALTY;
        prevChanged = true;
      } else {
        prevChanged = false;
      }
      prev = h[c];
    }

    for (let c = 0; c < WIDTH - 1; c++) {
      let left = 5;
      if (c > 0) left = Math.max(0, h[c - 1] - h[c]);
      let right = 5;
      if (c < WIDTH - 2) right = Math.max(0, h[c + 1] - h[c]);
      if (left >= 2 && right >= 2) {
        if (Math.min(left, right) === 2) res += params.SMALL_PIT_PENALTY;
        else res += params.BIG_PIT_PENALTY;
      }
    }
    return res;
  }
}

// ---------- BoardPenaltyParameters ----------

export const STANDARD_PARAMS = {
  COVER_RIGHTMOST_PENALTY: 50.0,
  COVERED_PENALTY: 19.65102385016857,
  HEIGHT_RIGHTMOST_PENALTY: 5.0,
  CONSECUTIVE_CHANGE_PENALTY: 1.7050572208699066,
  SMALL_PIT_PENALTY: 5.604402435574228,
  BIG_PIT_PENALTY: 22.46371775813374,
  HEIGHT_DIFFERENCE_FACTOR: 5.2652791317118375,
};

// ---------- Randomizer ----------

export class TetriminoRandomizer {
  constructor(seed) {
    this.prev = -1;
    this.prevprev = -1;
    if (seed !== undefined) {
      // Simple mulberry32 PRNG so seeded games are reproducible.
      let s = seed | 0;
      this.rand = () => {
        s = (s + 0x6D2B79F5) | 0;
        let t = s;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    } else {
      this.rand = Math.random;
    }
  }
  getNext() {
    let n = Math.floor(this.rand() * 7);
    while (n === this.prev && this.prev === this.prevprev) {
      n = Math.floor(this.rand() * 7);
    }
    this.prevprev = this.prev;
    this.prev = n;
    return MINOS[n][0];
  }
}

// ---------- BoardState ----------

export class BoardState {
  constructor(rand) {
    this.rand = rand || null;
    this.board = new TetrisBoard();
    this.hold = null;
    this.next = new Array(5).fill(null);
    if (rand) {
      this.current = rand.getNext();
      for (let i = 0; i < 5; i++) this.next[i] = rand.getNext();
    } else {
      this.current = null;
    }
  }

  createCopy() {
    const r = new BoardState();
    r.rand = this.rand;
    r.board = this.board.createCopy();
    r.current = this.current;
    r.hold = this.hold;
    r.next = this.next.slice();
    return r;
  }

  shiftnext() {
    this.current = this.next[0];
    for (let i = 0; i < this.next.length - 1; i++) this.next[i] = this.next[i + 1];
    this.next[this.next.length - 1] = null;
  }

  fillNext() {
    for (let i = 0; i < this.next.length; i++) {
      if (this.next[i] === null) this.next[i] = this.rand.getNext();
    }
  }

  // move: { hold: bool, position: int, rotation: int }
  // Returns a new BoardState or null if the move kills the piece.
  doMove(move) {
    const res = this.createCopy();
    if (move.hold) {
      if (res.hold !== null) {
        const tmp = res.hold;
        res.hold = res.current;
        res.current = tmp;
      } else {
        res.hold = res.current;
        res.shiftnext();
        if (res.current === null) return res;
      }
    }
    let mino = res.current;
    if (move.rotation === 1) mino = mino.rotateClockWise();
    else if (move.rotation === 2) mino = mino.rotateClockWise().rotateClockWise();
    else if (move.rotation === 3) mino = mino.rotateCounterClockWise();
    res.current = mino;
    const nextBoard = res.board.dropMino(mino, move.position);
    if (nextBoard === null) return null;
    res.board = nextBoard;
    res.shiftnext();
    if (res.rand !== null) res.fillNext();
    return res;
  }

  isGameOver() { return this.board.isGameOver(); }
  clearedLine() { return this.board.clearedLine; }
}

// ---------- Solver ----------

export class TetrisSolver {
  constructor(params) {
    this.params = params || STANDARD_PARAMS;
  }

  getMove(game) {
    let bestMove = null;

    if (game.hold === null) {
      // First move: always swap into hold.
      return { hold: true, position: 4, rotation: 0 };
    }

    // I-piece "save the well" heuristic: if the right column is at least 4
    // lower than every other column, drop the I vertically into column 8.
    if (game.current && game.current.type === TYPE_I) {
      const h = game.board.getHeights();
      let fillRight = true;
      for (let c = 0; c < h.length - 1; c++) {
        if (h[c] - h[h.length - 1] < 4) { fillRight = false; break; }
      }
      if (fillRight) return { hold: false, position: WIDTH - 2, rotation: 1 };
    }

    let bestPenalty = Number.POSITIVE_INFINITY;
    for (let hold = 0; hold < 2; hold++) {
      for (let pos = 0; pos < WIDTH; pos++) {
        for (let rot = 0; rot < 4; rot++) {
          const move = { hold: hold === 1, position: pos, rotation: rot };
          const game2 = game.doMove(move);
          if (game2 !== null) {
            const p = game2.board.getBoardPenalty(this.params);
            if (p < bestPenalty) {
              bestPenalty = p;
              bestMove = move;
            }
          }
        }
      }
    }
    return bestMove;
  }
}

// Apply a rotation index 0-3 to a base mino, returning the rotated mino.
export function rotateBy(mino, rotation) {
  return MINOS[mino.type][rotation & 3];
}
