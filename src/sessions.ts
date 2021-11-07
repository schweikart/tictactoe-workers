import { ColorOrNone } from './game/Color';
import { ErrorMessage, Message } from './messages';

/**
 * Stores data about a connected client
 */
export class Session {
  color: ColorOrNone;
  socket: WebSocket;

  constructor(color: ColorOrNone, socket: WebSocket) {
    this.color = color;
    this.socket = socket;
  }

  /**
   * Sends a message to the client associated with this session.
   * @param message the message to send.
   */
  public sendMessage(message: Message): void {
    this.socket.send(JSON.stringify(message));
  }

  /**
   * Sends an error message to the client associated with this session.
   * @param error
   */
  public sendErrorMessage(error: string): void {
    const msg: ErrorMessage = {
      type: 'error',
      message: error,
    };
    this.sendMessage(msg);
  }
}

/**
 * Easily allows adding/removing sessions and bulk operations.
 */
export class SessionList {
  private sessions: Session[] = [];

  /**
   * Adds a new session to the list.
   * @param session the session to add.
   */
  public add(session: Session): void {
    this.sessions.push(session);
  }

  /**
   * Removes a session from the list.
   * @param session the session to remove.
   */
  public remove(session: Session): void {
    this.sessions = this.sessions.filter((aSession) => aSession !== session);
  }

  /**
   * Sends a message to all sessions.
   * @param msg the message to send.
   */
  public broadcast(msg: Message): void {
    this.sessions.forEach((s) => s.sendMessage(msg));
  }

  /**
   * The number of sessions in this list.
   */
  public get length(): number {
    return this.sessions.length;
  }

  /**
   * Tries to find a session that has a given color.
   * @param color the color to look out for.
   * @returns the session or undefined if no session with this color was found.
   */
  public findWithColor(color: ColorOrNone): Session | undefined {
    for (let i = 0; i < this.sessions.length; i++) {
      if (this.sessions[i].color === color) {
        return this.sessions[i];
      }
    }
    return undefined;
  }

  /**
   * Finds a color for a new session.
   * @returns the color for the new session.
   */
  public findNextColor(): ColorOrNone {
    if (this.findWithColor('red') === undefined) {
      return 'red';
    } else if (this.findWithColor('blue') === undefined) {
      return 'blue';
    } else {
      return 'none';
    }
  }
}
