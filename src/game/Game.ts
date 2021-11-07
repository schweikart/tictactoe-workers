import { Board } from './Board';
import { Color, ColorOrNone, oppositeColor } from './Color';

const FIRST_TURN: Color = 'red';

export interface SerializedGame {
  fields: ColorOrNone[][];
  turn: ColorOrNone;
}

export class Game {
  private board: Board;
  private nextTurn: ColorOrNone;

  /**
   * This field stores the winner calculated after each move. Use the winner property to access
   * this value and use `recalculateWinner` to check again.
   */
  private _winner: ColorOrNone | null = null;

  public get winner(): ColorOrNone | null {
    return this._winner;
  }

  public constructor(serialized?: SerializedGame) {
    if (serialized !== undefined) {
      this.board = new Board(serialized.fields);
      this.nextTurn = serialized.turn;
      this.recalculateWinner();
    } else {
      this.board = new Board();
      this.nextTurn = FIRST_TURN;
    }
  }

  private recalculateWinner(): void {
    const winningColor = this.board.findWinningColor();

    if (winningColor !== 'none') {
      this._winner = winningColor;
    } else if (this.board.isFull()) {
      this._winner = 'none';
    } else {
      this._winner = null;
    }
  }

  public isGameOver(): boolean {
    return this.winner !== null;
  }

  public canPlaceColor(color: Color, row: number, col: number): boolean {
    return (
      !this.isGameOver() &&
      this.nextTurn === color &&
      !this.board.hasColor(row, col)
    );
  }

  public placeColor(color: Color, row: number, col: number): void {
    if (!this.canPlaceColor(color, row, col)) {
      throw new Error('Invalid move!');
    }

    this.board.setColor(row, col, color);
    this.recalculateWinner();
    if (this.isGameOver()) {
      this.nextTurn = 'none';
    } else {
      this.nextTurn = oppositeColor(this.nextTurn as Color); // we have made sure that nextTurn is not 'none'
    }
  }

  public serialize(): SerializedGame {
    return {
      fields: this.board.fields,
      turn: this.nextTurn,
    };
  }
}
