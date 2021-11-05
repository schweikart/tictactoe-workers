import { Board } from "./Board";
import { Color, ColorOrNone } from "./Color";
import { Env } from "./Env";
import { createColorMessage, Message, MoveMessage, ResetMessage, StateMessage } from "./messages";
import { Session, SessionList } from "./sessions";

const firstTurn: Color = 'red';

/**
 * A durable object that represents a game of tic tac toe.
 */
export class GameInstance {
  private state: DurableObjectState;
  private env: Env;

  private board: Board = new Board();
  private turn: ColorOrNone = 'red';
  private winner: ColorOrNone | null = null;
  private sessions: SessionList = new SessionList();

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;

    this.loadState();

    // the following can not run on current miniflare version (1.X), use miniflare@next (2.X)
    this.state.blockConcurrencyWhile(async () => await this.loadState());
  }

  /**
   * Loads the attributes of this durable object from `state.storage`.
   */
  private async loadState(): Promise<void> {
    const storedFields = await this.state.storage?.get<Color[][]>('fields');
    if (storedFields !== undefined) {
      this.board = new Board(storedFields);
    }
    const storedTurn = await this.state.storage?.get<Color>('turn');
    if (storedTurn !== undefined) {
      this.turn = storedTurn;
    }
    const storedWinner = await this.state.storage?.get<Color | null>('winner');
    if (storedWinner !== undefined) {
      this.winner = this.winner;
    }
  }

  /**
   * Stores the attributes of this durable object to `state.storage`.
   */
  private async saveState(): Promise<void> {
    await this.state.storage?.put('fields', this.board.fields);
    await this.state.storage?.put('turn', this.turn);
    await this.state.storage?.put('winner', this.winner);
  }

  /**
   * Creates a message for the current game state.
   * @returns the created message.
   */
  private createStateMessage(): StateMessage {
    return {
      type: 'state',
      fields: this.board.fields,
      turn: this.turn,
      winner: this.winner,
    };
  }

  /**
   * Resets the state of this game.
   */
  private async reset(): Promise<void> {
    this.board.reset();
    this.turn = firstTurn;
    this.winner = null;
    await this.state.storage?.deleteAll(); // we do not need to call `saveState` in this case
  }

  /**
   * Handles incoming requests to this durable object. This will set up a WebSocket connection with the client.
   * @param request the incoming HTTP request.
   * @returns the outgoing HTTP response.
   */
  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response("Expected Upgrade: websocket", { status: 426 });
    }

    const webSocketPair = new WebSocketPair();
    const client = webSocketPair[0];
    const socket = webSocketPair[1];
    const session = new Session(this.sessions.findNextColor(), socket);
    
    socket.addEventListener('message', async event => this.onMessageReceived(session, event));
    socket.addEventListener('close', async event => this.onSocketClose(session, event));
    socket.accept();

    this.sessions.add(session);
    session.sendMessage(createColorMessage(session.color));
    session.sendMessage(this.createStateMessage()); //TODO wait for opponent

    return new Response(null, {
      status: 101, // Switch protocols
      webSocket: client,
    });
  }

  /**
   * Parses and handles WebSocket messages.
   * @param session the session of the message sender. 
   * @param event the message sending event.
   */
  private async onMessageReceived(session: Session, event: MessageEvent): Promise<void> {
    if (typeof event.data !== 'string') {
      session.sendErrorMessage('WebSocket message is not a string! Did you forget to JSON.stringify()?');
      return;
    }

    let unvalidatedMessage: any;
    try {
      unvalidatedMessage = JSON.parse(event.data);
    } catch (e) {
      session.sendErrorMessage('WebSocket message is not valid JSON!');
      return;
    }

    if (typeof unvalidatedMessage !== 'object' || typeof unvalidatedMessage.type !== 'string') {
      session.sendErrorMessage('WebSocket messages must be objects with a `type` string attribute!');
      return;
    }

    let msg: Message = unvalidatedMessage;

    switch (msg.type) {
      case 'move':
        if (typeof unvalidatedMessage.row !== 'number' || typeof unvalidatedMessage.col !== 'number') {
          session.sendErrorMessage('`move` messages must have a numeric `row` and `col` value!');
          return;
        }
        await this.handleMoveMessage(session, msg as MoveMessage);
        break;
      case 'reset':
        await this.handleResetMessage(session, msg as ResetMessage);
        break;
      default:
        session.sendErrorMessage(`'${msg.type}' is not a valid message type!`);
        break;
    }
  }

  /**
   * Handles the `close` event for WebSocket connections to the client. 
   * @param session the session associated with the socket.
   * @param event the socket closing event.
   */
  private async onSocketClose(session: Session, event: CloseEvent): Promise<void> {
    this.sessions.remove(session);

    // find new player, if necessary
    if (session.color !== 'none') {
      const spectator = this.sessions.findWithColor('none');
      if (spectator !== undefined) {
        spectator.color = session.color;
        spectator.sendMessage(createColorMessage(session.color));
        spectator.sendMessage(this.createStateMessage());
      }
    }
  }

  /**
   * Handles `move` messages.
   * @param session the session of the message sender.
   * @param msg the message to handle.
   */
  private async handleMoveMessage(session: Session, msg: MoveMessage): Promise<void> {
    if (session.color !== 'none' && !this.board.hasColor(msg.row, msg.col)) {
      this.board.setColor(msg.row, msg.col, session.color);
      this.turn = this.turn === 'red' ? 'blue' : 'red';

      const winner = this.board.findWinningColor();
      if (winner !== 'none') {
        this.winner = winner; // game over
        this.turn = 'none';
      } else if (this.board.isFull()) {
        this.winner = 'none'; // tie
        this.turn = 'none';
      }
      await this.saveState();

      this.sessions.broadcast(this.createStateMessage());
    }
  }

  /**
   * Handles `reset` messages.
   * @param session the session of the message sender.
   * @param msg the message to handle.
   */
  private async handleResetMessage(session: Session, msg: ResetMessage): Promise<void> {
    if (session.color === 'none') {
      session.sendErrorMessage('You can not reset a game in which you do not participate!');
      return;
    }
    
    await this.reset();
    this.sessions.broadcast(this.createStateMessage());
  }
}
