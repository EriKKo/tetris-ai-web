import {
  WIDTH, VISIBLE_HEIGHT,
  BoardState, TetriminoRandomizer, TetrisSolver, STANDARD_PARAMS,
  getTetrimino,
} from './tetris.js';
import { TetrisRenderer, PreviewRenderer } from './renderer.js';

// Gravity speed in ms per row, by level. Cribbed loosely from NES Tetris,
// but smoothed so the AI is watchable at every level.
const GRAVITY_MS = [
  800, 720, 630, 550, 470, 380, 300, 220, 160, 130,
  100, 90, 80, 75, 70, 68, 66, 64, 62, 60,
];
function gravityMs(level) {
  if (level <= GRAVITY_MS.length) return GRAVITY_MS[level - 1];
  return Math.max(45, GRAVITY_MS[GRAVITY_MS.length - 1] - (level - GRAVITY_MS.length));
}

// AI "input" cadence — how fast it shifts and rotates the falling piece.
const SHIFT_MS = 55;
const ROTATE_MS = 90;
// Lock delay: if the piece can't fall further and isn't aligned yet, give the
// AI a brief window to keep adjusting before locking in place.
const LOCK_DELAY_MS = 500;

const LINE_SCORES = [0, 40, 100, 300, 1200];

function spawnRowFor(mino) {
  let maxDr = 0;
  for (const [dr] of mino.points) if (dr > maxDr) maxDr = dr;
  return VISIBLE_HEIGHT - 1 - maxDr;
}

export class TetrisGame {
  constructor({ boardCanvas, nextCanvases, holdCanvas, statsEl, seed }) {
    this.renderer = new TetrisRenderer(boardCanvas, 28);
    this.nextPreviews = nextCanvases.map(c => new PreviewRenderer(c, 16));
    this.holdPreview = new PreviewRenderer(holdCanvas, 16);
    this.statsEl = statsEl;

    this.rand = new TetriminoRandomizer(seed);
    this.solver = new TetrisSolver();
    this.state = new BoardState(this.rand);

    this.score = 0;
    this.lines = 0;
    this.level = 1;
    this.gameOver = false;
    this.paused = false;
    this.speedMultiplier = 1;
    this.penalty = 0;

    this.spawnPiece();
    this.lastTime = performance.now();
    this.render();
  }

  spawnPiece() {
    // Ask the AI what to do with the current piece. The move may include a
    // hold swap; if so, we perform the swap before animating, so what we
    // animate is the piece that will actually land this turn.
    const move = this.solver.getMove(this.state);
    if (!move) { this.gameOver = true; return; }
    if (move.hold) {
      if (this.state.hold === null) {
        this.state.hold = this.state.current;
        this.state.shiftnext();
        this.state.fillNext();
      } else {
        const tmp = this.state.hold;
        this.state.hold = this.state.current;
        this.state.current = tmp;
      }
    }
    if (this.state.current === null) { this.gameOver = true; return; }

    this.activeMino = this.state.current;
    this.activeCol = 4;
    this.activeRotation = 0;
    this.activeRow = spawnRowFor(this.activeMino);
    this.target = { col: move.position, rotation: move.rotation };

    this.gravityTimer = 0;
    this.shiftTimer = 0;
    this.rotateTimer = 0;
    this.lockDelay = 0;

    // If the piece can't even be placed at its spawn row, it's game over.
    if (!this.state.board.canPlaceTetrimino(this.activeMino, this.activeRow, this.activeCol)) {
      this.gameOver = true;
    }
  }

  step(dt) {
    if (this.gameOver || this.paused) return;

    const speed = this.speedMultiplier;
    const rotateThreshold = ROTATE_MS / speed;
    const shiftThreshold = SHIFT_MS / speed;
    const gThreshold = gravityMs(this.level) / speed;
    const lockThreshold = LOCK_DELAY_MS / speed;

    let moved = false;

    // Rotate first, then shift — that's how the AI's solver framed its target.
    this.rotateTimer += dt;
    if (this.rotateTimer >= rotateThreshold) {
      this.rotateTimer = 0;
      if (this.activeRotation !== this.target.rotation) {
        const nextRot = (this.activeRotation + 1) & 3;
        const candidate = getTetrimino(this.activeMino.type, nextRot);
        if (this.state.board.canPlaceTetrimino(candidate, this.activeRow, this.activeCol)) {
          this.activeRotation = nextRot;
          this.activeMino = candidate;
          moved = true;
        }
      }
    }

    this.shiftTimer += dt;
    if (this.shiftTimer >= shiftThreshold) {
      this.shiftTimer = 0;
      if (this.activeRotation === this.target.rotation && this.activeCol !== this.target.col) {
        const dir = this.target.col > this.activeCol ? 1 : -1;
        const newCol = this.activeCol + dir;
        if (this.state.board.canPlaceTetrimino(this.activeMino, this.activeRow, newCol)) {
          this.activeCol = newCol;
          moved = true;
        }
      }
    }

    const aligned = this.activeRotation === this.target.rotation && this.activeCol === this.target.col;
    if (aligned) { this.hardDropAndLock(); return; }

    this.gravityTimer += dt;
    while (this.gravityTimer >= gThreshold) {
      this.gravityTimer -= gThreshold;
      if (this.state.board.canPlaceTetrimino(this.activeMino, this.activeRow - 1, this.activeCol)) {
        this.activeRow--;
      } else {
        break;
      }
    }

    if (!this.state.board.canPlaceTetrimino(this.activeMino, this.activeRow - 1, this.activeCol)) {
      if (moved) this.lockDelay = 0;
      else this.lockDelay += dt;
      if (this.lockDelay >= lockThreshold) {
        this.lockPieceInPlace();
      }
    } else {
      this.lockDelay = 0;
    }
  }

  hardDropAndLock() {
    const landRow = this.state.board.getDropRow(this.activeMino, this.activeCol);
    if (landRow === null) { this.gameOver = true; return; }
    const landingRow = Math.min(this.activeRow, landRow);
    this.score += Math.max(0, this.activeRow - landingRow) * 2;
    this.activeRow = landingRow;
    this.commitPiece();
  }

  lockPieceInPlace() {
    // Fallback: the AI couldn't quite reach the target; just lock at the
    // current spot. This keeps the game flowing if the path is blocked.
    this.commitPiece();
  }

  commitPiece() {
    const nextBoard = this.state.board.placeTetrimino(this.activeMino, this.activeRow, this.activeCol);
    const cleared = nextBoard.linesCleared || 0;
    this.state.board = nextBoard;
    this.penalty = this.state.board.getBoardPenalty(STANDARD_PARAMS);

    if (cleared > 0) {
      this.score += LINE_SCORES[cleared] * this.level;
      this.lines += cleared;
      const newLevel = Math.floor(this.lines / 10) + 1;
      if (newLevel > this.level) this.level = newLevel;
    }

    if (this.state.board.isGameOver()) {
      this.gameOver = true;
      this.render();
      return;
    }

    this.state.shiftnext();
    if (this.state.rand) this.state.fillNext();
    if (this.state.current === null) { this.gameOver = true; this.render(); return; }

    this.spawnPiece();
    this.render();
  }

  render() {
    this.renderer.drawBoard(this.state.board);
    if (!this.gameOver && this.activeMino) {
      const ghostRow = this.state.board.getDropRow(this.activeMino, this.activeCol);
      if (ghostRow !== null && ghostRow < this.activeRow) {
        this.renderer.drawPiece(this.activeMino, ghostRow, this.activeCol, { ghost: true });
      }
      this.renderer.drawPiece(this.activeMino, this.activeRow, this.activeCol);
    }
    this.holdPreview.draw(this.state.hold);
    for (let i = 0; i < this.nextPreviews.length; i++) {
      this.nextPreviews[i].draw(this.state.next[i] || null);
    }
    this.statsEl.score.textContent = this.score;
    this.statsEl.lines.textContent = this.lines;
    this.statsEl.level.textContent = this.level;
    this.statsEl.status.textContent = this.gameOver
      ? 'Game Over'
      : (this.paused ? 'Paused' : 'AI playing');
    if (this.statsEl.penalty) {
      const p = isFinite(this.penalty) ? this.penalty : 9999;
      this.statsEl.penalty.textContent = p.toFixed(1);
      // Hue: green (120) at 0, red (0) at 300+. Lightness drops slightly at red.
      const t = Math.min(1, p / 300);
      const hue = 120 * (1 - t);
      this.statsEl.penaltyDot.style.background = `hsl(${hue}, 75%, 50%)`;
    }
  }

  loop() {
    if (this.stopped) return;
    const now = performance.now();
    let dt = now - this.lastTime;
    this.lastTime = now;
    if (dt > 100) dt = 100;
    this.step(dt);
    this.render();
    if (!this.gameOver) this.rafId = requestAnimationFrame(() => this.loop());
  }

  start() {
    this.stopped = false;
    this.lastTime = performance.now();
    this.loop();
  }
  stop() {
    this.stopped = true;
    if (this.rafId) cancelAnimationFrame(this.rafId);
  }
  togglePause() {
    this.paused = !this.paused;
    this.lastTime = performance.now();
    this.render();
  }
  setSpeed(multiplier) {
    this.speedMultiplier = Math.max(0.05, multiplier);
  }
}
