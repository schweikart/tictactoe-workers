import { Env } from "./Env";

interface Session {
  color: Color;
  socket: WebSocket;
}

type Color = 'red' | 'blue' | 'none';

const BOARD_WIDTH = 3;

export class GameInstance {
  private state: DurableObjectState;
  private env: Env;

  private fields: Color[][] = [];
  private turn: Color = 'red';
  private winner: Color = 'none';
  private sessions: Session[] = [];

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;

    this.state.blockConcurrencyWhile(async () => { // can not run on current miniflare version, use miniflare@next
      this.fields = await this.state.storage?.get<Color[][]>('fields') || this.createFields();
      this.turn = await this.state.storage?.get<Color>('turn') || 'red';
    });
  }

  private broadcast(message: object) {
    this.sessions.forEach(session => {
      session.socket.send(JSON.stringify(message));
    })
  }

  private findWinner(): Color {
    // check rows
    for (let row = 0; row < BOARD_WIDTH; row++) {
      const rowWinner = this.checkLine(row, 0, 0, 1);
      if (rowWinner !== 'none') {
        return rowWinner;
      }
    }

    // check cols
    for (let col = 0; col < BOARD_WIDTH; col++) {
      const colWinner = this.checkLine(0, col, 1, 0);
      if (colWinner !== 'none') {
        return colWinner;
      }
    }

    // check diagonals
    const diagWinner1 = this.checkLine(0, 0, 1, 1);
    if (diagWinner1 !== 'none') {
      return diagWinner1;
    }
    const diagWinner2 = this.checkLine(2, 0, -1, 1);
    if (diagWinner2 !== 'none') {
      return diagWinner2;
    }

    // if no winning line was found, there is no winner
    return 'none';
  }

  private checkLine(startRow: number, startCol: number, deltaRow: number, deltaCol: number): Color {
    const color = this.fields[startRow][startCol];
    
    if (color === 'none') {
      return 'none';
    }

    for (let i = 1; i < BOARD_WIDTH; i++) {
      if (this.fields[startRow + deltaRow * i][startCol + deltaCol * i] !== color) {
        return 'none';
      }
    }

    return color;
  }

  private broadcastState() {
    this.broadcast({ type: 'move', fields: this.fields, turn: this.turn, winner: this.winner });
  }

  private isTie(): boolean {
    for (let row = 0; row < BOARD_WIDTH; row++) {
      for (let col = 0; col < BOARD_WIDTH; col++) {
        if (this.fields[row][col] === 'none') {
          return false;
        }
      }
    }
    return true;
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
    socket.send(JSON.stringify({ type: 'color', color: session.color }));
    console.debug(`User with color ${session.color} is now connected!`);

    if (this.sessions.length >= 2) {
      this.broadcastState();
    }

    socket.addEventListener('message', event => {
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
          if (this.fields[message.row][message.col] === 'none') {
            this.fields[message.row][message.col] = session.color;
            this.turn = this.turn === 'red' ? 'blue' : 'red';

            const winner = this.findWinner();
            if (winner !== 'none') {
              this.turn = 'none';
              this.winner = winner;
            }

            if (this.isTie()) {
              this.turn = 'none';
              this.winner = 'none';
            }

            this.broadcastState();
          }
          break;
        default:
          console.log('invalid message type')
          socket.close();
          return;
      }
    });
    socket.addEventListener('close', event => {
      this.sessions = this.sessions.filter(aSession => aSession !== session);
      console.log(`Session for color '${session.color}' disconnected!`);
    });

    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }

  private createFields(): Color[][] {
    const fields: Color[][] = [];
    for (let i = 0; i < 3; i++) {
      fields.push([]);
      for (let j = 0; j < 3; j++) {
        fields[i].push('none');
      }
    }
    return fields;
  }
}
