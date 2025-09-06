# server.py
# Minimal server using aiohttp to serve static files with COOP/COEP headers
import asyncio
from aiohttp import web
import pathlib
import logging
import mimetypes

ROOT = pathlib.Path(__file__).parent.resolve()
PUBLIC = ROOT / "public"

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("wasm-qsim-server")

@web.middleware
async def coop_coep_middleware(request, handler):
    # Attach COOP/COEP to every response
    try:
        resp = await handler(request)
    except web.HTTPException as ex:
        resp = ex
    # Even if `ex` is a web.FileResponse, headers can still be added
    resp.headers['Cross-Origin-Opener-Policy'] = 'same-origin'
    resp.headers['Cross-Origin-Embedder-Policy'] = 'require-corp'
    # Ensure Content-Type for wasm/js (omit if aiohttp sets it automatically)
    path = request.path.lower()
    if path.endswith('.wasm'):
        resp.headers['Content-Type'] = 'application/wasm'
    elif path.endswith('.js'):
        resp.headers['Content-Type'] = 'application/javascript; charset=utf-8'
    return resp

async def spa_fallback(request):
    # Return index.html for SPA routes not present in static files
    index_file = PUBLIC / "index.html"
    if index_file.exists():
        return web.FileResponse(index_file)
    raise web.HTTPNotFound()

def create_app():
    app = web.Application(middlewares=[coop_coep_middleware])
    # Serve static files from 'public' at the root
    # NOTE: the prefix for add_static can also be '/'; static files take precedence when found.
    app.router.add_static('/', path=str(PUBLIC), show_index=False)
    # Paths not found statically fall back to index.html (SPA)
    app.router.add_get('/{tail:.*}', spa_fallback)
    return app

if __name__ == "__main__":
    app = create_app()
    port = 8080
    logger.info("Serving %s on http://localhost:%d", PUBLIC, port)
    web.run_app(app, port=port)
