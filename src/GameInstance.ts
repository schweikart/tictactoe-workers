import { Env } from "./Env";

enum FieldValue {
    none = -1,
    player0 = 0,
    player1 = 1
}

export class GameInstance {
  private state: DurableObjectState;
  private env: Env; // no idea what type this has

  private players: [string, string] = ['anybody', 'nobody'];
  private fields: FieldValue[][] = [];
  private turn: FieldValue = 0; // `none` indicates that the game is over

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;

    this.state.blockConcurrencyWhile(async () => {
        this.players = await this.state.storage?.get<[string, string]>('players') || ['anybody', 'nobody'];
        this.fields = await this.state.storage?.get<FieldValue[][]>('fields') || this.createFields();
        this.turn = await this.state.storage?.get<FieldValue>('turn') || 0;
    });
  }

  async fetch(request: Request): Promise<Response> { // when is this called?
    return new Response('Game Instance response');
  }

  private createFields(): FieldValue[][] {
    const fields: FieldValue[][] = [];
    for (let i = 0; i < 3; i++) {
      fields.push([]);
      for (let j = 0; j < 3; j++) {
        fields[i].push(FieldValue.none);
      }
    }
    return fields;
  }
}
