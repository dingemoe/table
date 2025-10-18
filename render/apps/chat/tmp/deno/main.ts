// Deno server som bruker ChatAppRenderer fra CDN
const HTML_TEMPLATE = `<!DOCTYPE html>
<html lang="no">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Chat App - Deno Server</title>
    <script src="https://cdn.tailwindcss.com"></script>
  </head>
  <body class="bg-gray-100">
    <div id="app"></div>
    
    <script type="module">
      // Import ChatAppRenderer fra CDN
      import ChatAppRenderer from 'https://cdn.jsdelivr.net/gh/dingemoe/table@main/render/apps/chat/render.js';
      
      // Initialiser renderer
      const renderer = new ChatAppRenderer({
        title: 'Dynamic Table Chat - Deno Server',
        theme: 'dark'
      });
      
      // Render til div#app
      await renderer.render('app');
      
      console.log('✅ Chat App lastet fra CDN via Deno server');
    </script>
  </body>
</html>`;

async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  
  if (url.pathname === "/" || url.pathname === "/index.html") {
    return new Response(HTML_TEMPLATE, {
      headers: {
        "content-type": "text/html; charset=utf-8",
      },
    });
  }
  
  if (url.pathname === "/api/health") {
    return new Response(JSON.stringify({ 
      status: "ok", 
      renderer: "https://cdn.jsdelivr.net/gh/dingemoe/table@main/render/apps/chat/render.js",
      timestamp: new Date().toISOString() 
    }), {
      headers: {
        "content-type": "application/json",
      },
    });
  }
  
  return new Response("Not Found", { status: 404 });
}

console.log("🚀 Chat App Deno Server starting...");
console.log("📊 Using ChatAppRenderer from CDN");

Deno.serve(handler);