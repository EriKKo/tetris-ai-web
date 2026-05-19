import {
  WIDTH, VISIBLE_HEIGHT, EMPTY,
  TYPE_I, TYPE_T, TYPE_O, TYPE_L, TYPE_J, TYPE_S, TYPE_Z,
} from './tetris.js';

const COLORS = {
  [TYPE_I]: '#00f0f0',
  [TYPE_T]: '#a000f0',
  [TYPE_O]: '#f0f000',
  [TYPE_L]: '#f0a000',
  [TYPE_J]: '#0000f0',
  [TYPE_S]: '#00f000',
  [TYPE_Z]: '#f00000',
};
const LOCKED_COLOR = '#888';
const GRID_COLOR = '#1a1a1a';
const BG_COLOR = '#0a0a0a';
const GHOST_COLOR = 'rgba(255,255,255,0.12)';

export class TetrisRenderer {
  constructor(canvas, cell = 28) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.cell = cell;
    canvas.width = WIDTH * cell;
    canvas.height = VISIBLE_HEIGHT * cell;
  }

  // r is board-coordinate row (0 at bottom). Returns canvas y of top-left.
  rowToY(r) { return (VISIBLE_HEIGHT - 1 - r) * this.cell; }

  drawCell(r, c, color) {
    if (r < 0 || r >= VISIBLE_HEIGHT) return;
    const x = c * this.cell;
    const y = this.rowToY(r);
    const s = this.cell;
    this.ctx.fillStyle = color;
    this.ctx.fillRect(x, y, s, s);
    // Inner highlight + shadow for a faux-bevel look.
    this.ctx.fillStyle = 'rgba(255,255,255,0.18)';
    this.ctx.fillRect(x, y, s, 2);
    this.ctx.fillRect(x, y, 2, s);
    this.ctx.fillStyle = 'rgba(0,0,0,0.3)';
    this.ctx.fillRect(x, y + s - 2, s, 2);
    this.ctx.fillRect(x + s - 2, y, 2, s);
  }

  drawBoard(board) {
    const ctx = this.ctx;
    ctx.fillStyle = BG_COLOR;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // Grid lines.
    ctx.strokeStyle = GRID_COLOR;
    ctx.lineWidth = 1;
    for (let c = 0; c <= WIDTH; c++) {
      ctx.beginPath();
      ctx.moveTo(c * this.cell + 0.5, 0);
      ctx.lineTo(c * this.cell + 0.5, this.canvas.height);
      ctx.stroke();
    }
    for (let r = 0; r <= VISIBLE_HEIGHT; r++) {
      ctx.beginPath();
      ctx.moveTo(0, r * this.cell + 0.5);
      ctx.lineTo(this.canvas.width, r * this.cell + 0.5);
      ctx.stroke();
    }

    const arr = board.getBoard();
    for (let r = 0; r < VISIBLE_HEIGHT; r++) {
      for (let c = 0; c < WIDTH; c++) {
        if (arr[r][c] !== EMPTY) this.drawCell(r, c, LOCKED_COLOR);
      }
    }
  }

  drawPiece(mino, r, c, { ghost = false, yOffsetPx = 0 } = {}) {
    if (!mino) return;
    const color = ghost ? GHOST_COLOR : COLORS[mino.type];
    for (const [dr, dc] of mino.points) {
      const cellR = r + dr;
      const cellC = c + dc;
      if (cellR < 0 || cellR >= VISIBLE_HEIGHT) continue;
      if (ghost) {
        const x = cellC * this.cell;
        const y = this.rowToY(cellR) + yOffsetPx;
        const s = this.cell;
        this.ctx.fillStyle = color;
        this.ctx.fillRect(x, y, s, s);
        this.ctx.strokeStyle = 'rgba(255,255,255,0.25)';
        this.ctx.strokeRect(x + 0.5, y + 0.5, s - 1, s - 1);
      } else {
        const x = cellC * this.cell;
        const y = this.rowToY(cellR) + yOffsetPx;
        const s = this.cell;
        this.ctx.fillStyle = COLORS[mino.type];
        this.ctx.fillRect(x, y, s, s);
        this.ctx.fillStyle = 'rgba(255,255,255,0.25)';
        this.ctx.fillRect(x, y, s, 2);
        this.ctx.fillRect(x, y, 2, s);
        this.ctx.fillStyle = 'rgba(0,0,0,0.3)';
        this.ctx.fillRect(x, y + s - 2, s, 2);
        this.ctx.fillRect(x + s - 2, y, 2, s);
      }
    }
  }
}

export class PreviewRenderer {
  // Draws a single mino centered in a small canvas. Used for next + hold.
  constructor(canvas, cell = 18) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.cell = cell;
    canvas.width = 6 * cell;
    canvas.height = 4 * cell;
  }
  draw(mino) {
    const ctx = this.ctx;
    ctx.fillStyle = BG_COLOR;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    if (!mino) return;
    // Compute bounding box of the rotation-0 piece so we can center it.
    let minR = Infinity, maxR = -Infinity, minC = Infinity, maxC = -Infinity;
    for (const [dr, dc] of mino.points) {
      if (dr < minR) minR = dr;
      if (dr > maxR) maxR = dr;
      if (dc < minC) minC = dc;
      if (dc > maxC) maxC = dc;
    }
    const w = maxC - minC + 1;
    const h = maxR - minR + 1;
    const offsetX = (this.canvas.width - w * this.cell) / 2 - minC * this.cell;
    const offsetY = (this.canvas.height - h * this.cell) / 2 + maxR * this.cell;
    for (const [dr, dc] of mino.points) {
      const x = offsetX + dc * this.cell;
      const y = offsetY - dr * this.cell;
      const s = this.cell;
      ctx.fillStyle = COLORS[mino.type];
      ctx.fillRect(x, y, s, s);
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.fillRect(x, y, s, 2);
      ctx.fillRect(x, y, 2, s);
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fillRect(x, y + s - 2, s, 2);
      ctx.fillRect(x + s - 2, y, 2, s);
    }
  }
}

export { COLORS };
