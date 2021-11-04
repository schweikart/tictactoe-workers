import { Board } from "./Board";
import { Color, ColorOrNone } from "./Color";
import { Env } from "./Env";

interface Session {
  color: ColorOrNone;
  socket: WebSocket;
}

const firstTurn: Color = 'red';

export class GameInstance {
  private state: DurableObjectState;
  private env: Env;

  private board: Board = new Board();
  private turn: ColorOrNone = 'red';
  private winner: ColorOrNone | null = null;
  private sessions: Session[] = [];

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

  private broadcast(message: object) {
    this.sessions.forEach(session => {
      session.socket.send(JSON.stringify(message));
    })
  }

  private broadcastState() {
    this.broadcast({ type: 'move', fields: this.board.fields, turn: this.turn, winner: this.winner });
  }

  async reset(): Promise<void> {
    this.board.reset();
    this.turn = firstTurn;
    this.winner = null;
    await this.state.storage?.deleteAll(); // we do not need to call `saveState` in this case
  }

  async fetch(request: Request): Promise<Response> { // when is this called?
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response("Expected Upgrade: websocket", { status: 426 });
    }

    const webSocketPair = new WebSocketPair();
    const client = webSocketPair[0];
    const socket = webSocketPair[1];

    const session: Session = {
      socket: socket,
      color: this.sessions.length === 0 ? 'red' : (this.sessions.length === 1 ? 'blue' : 'none'),
    };
    this.sessions.push(session);

    socket.accept();
    socket.send(JSON.stringify({ type: 'color', color: session.color, fields: this.board.fields }));
    console.debug(`User with color ${session.color} is now connected!`);

    if (this.sessions.length >= 2) {
      this.broadcastState();
    }

    socket.addEventListener('message', async event => {
      if (typeof event.data !== 'string') {
        socket.send(JSON.stringify({ type: 'error', message: 'WebSocket message is not a string! Did you forget to JSON.stringify()?' }));
        return;
      }
      let message: any; // TODO strict typing!
      try {
        message = JSON.parse(event.data);
      } catch (e) {
        socket.send(JSON.stringify({type: 'error', message: 'WebSocket message is not valid JSON!'}));
        return;
      }

      switch (message.type) {
        case 'move':
          if (session.color !== 'none' && !this.board.hasColor(message.row, message.col)) {
            this.board.setColor(message.row, message.col, session.color);
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

            this.broadcastState();
          }
          break;
        case 'reset':
          if (session.color !== 'none') {
            await this.reset();
            this.broadcastState();
          }
          break;
        default:
          console.log('invalid message type')
          socket.close(1000);
          return;
      }
    });
    socket.addEventListener('close', async (event) => {
      this.sessions = this.sessions.filter(aSession => aSession !== session);
      console.log(`Session for color '${session.color}' disconnected!`);
      // todo give color to someone else
    });

    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }
}
