import HTML from './ui.html'

export async function handleRequest(request: Request): Promise<Response> {
  const url = new URL(request.url)

  if (url.pathname === '/') {
    return new Response(HTML, {
      headers: {
        'Content-Type': 'text/html;charset=UTF-8',
      },
    })
  }
  return new Response(`request method: ${request.method} ${url.pathname}`)
}
