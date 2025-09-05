# server.py
# aiohttp で static 配信 + COOP/COEP ヘッダを付与する最小サーバ
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
    # すべてのレスポンスに COOP/COEP を付与
    try:
        resp = await handler(request)
    except web.HTTPException as ex:
        resp = ex
    # ex が web.FileResponse 等でも headers に追加可能
    resp.headers['Cross-Origin-Opener-Policy'] = 'same-origin'
    resp.headers['Cross-Origin-Embedder-Policy'] = 'require-corp'
    # wasm / js の Content-Type を確実に設定（aiohttp が自動で良ければ不要）
    path = request.path.lower()
    if path.endswith('.wasm'):
        resp.headers['Content-Type'] = 'application/wasm'
    elif path.endswith('.js'):
        resp.headers['Content-Type'] = 'application/javascript; charset=utf-8'
    return resp

async def spa_fallback(request):
    # SPA 用に index.html を返す（静的ファイルに存在しないパス）
    index_file = PUBLIC / "index.html"
    if index_file.exists():
        return web.FileResponse(index_file)
    raise web.HTTPNotFound()

def create_app():
    app = web.Application(middlewares=[coop_coep_middleware])
    # / 直下で public の静的ファイルを配る
    # NOTE: add_static の prefix は '/' でも可。静的に見つかればそれが優先される。
    app.router.add_static('/', path=str(PUBLIC), show_index=False)
    # 静的に見つからなかったパスは index.html（SPA）へフォールバック
    app.router.add_get('/{tail:.*}', spa_fallback)
    return app

if __name__ == "__main__":
    app = create_app()
    port = 8080
    logger.info("Serving %s on http://localhost:%d", PUBLIC, port)
    web.run_app(app, port=port)
