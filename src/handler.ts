import { Env } from './Env'
import HTML from './ui.html'

export async function handleRequest(request: Request, env: Env): Promise<Response> {
  const id = env.GAMEINSTANCE.idFromName('A');
  const obj = env.GAMEINSTANCE.get(id);
  const resp = await obj.fetch(request.url);
  return new Response(await resp.text());
}
