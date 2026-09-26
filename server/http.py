"""Authenticated JSON API; no static file serving, no access to repository files."""
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import hmac
import json
import os
from urllib.parse import urlsplit
from .domain import Problem
from .provider import OpenAIProvider
from .service import Service


def make_handler(service,tokens,origins):
    class Handler(BaseHTTPRequestHandler):
        server_version='NashaVolna/0.3'
        def log_message(self,*args):
            pass  # Never log credentials, message content or provider payloads.
        def setup(self):
            super().setup()
            self.connection.settimeout(60)
        def send_json(self,status,payload):
            raw=b'' if status==204 else json.dumps(payload,ensure_ascii=False).encode()
            self.send_response(status)
            self.send_header('Content-Type','application/json; charset=utf-8')
            self.send_header('Content-Length',str(len(raw)))
            self.send_header('Cache-Control','no-store')
            self.send_header('X-Content-Type-Options','nosniff')
            self.send_header('Connection','close')
            origin=self.headers.get('Origin')
            if origin in origins:
                self.send_header('Access-Control-Allow-Origin',origin)
                self.send_header('Vary','Origin')
                self.send_header('Access-Control-Allow-Headers','Authorization, Content-Type')
                self.send_header('Access-Control-Allow-Methods','GET, POST, OPTIONS')
            self.end_headers()
            self.wfile.write(raw)
        def workspace(self):
            origin=self.headers.get('Origin')
            if origin and origin not in origins: raise Problem('Источник запроса не разрешён.',403)
            auth=self.headers.get('Authorization','')
            if not auth.startswith('Bearer '): raise Problem('Нужен ключ доступа к рабочему пространству.',401)
            supplied=auth[7:]
            for secret,workspace in tokens.items():
                if hmac.compare_digest(supplied.encode(),secret.encode()): return workspace
            raise Problem('Неверный ключ доступа.',401)
        def do_OPTIONS(self):
            self.send_json(204 if self.headers.get('Origin') in origins else 403,{})
        def do_GET(self):
            try:
                path=urlsplit(self.path).path
                if path=='/health': return self.send_json(200,{'status':'ok'})
                workspace=self.workspace()
                if path!='/api/state': raise Problem('Маршрут не найден.',404)
                self.send_json(200,service.state(workspace))
            except Problem as exc: self.send_json(exc.status,{'error':str(exc)})
            except Exception: self.send_json(500,{'error':'Ошибка сервера.'})
        def do_POST(self):
            try:
                workspace=self.workspace()
                if self.headers.get('Content-Type','').split(';')[0]!='application/json': raise Problem('Нужен application/json.',415)
                if self.headers.get('Transfer-Encoding'): raise Problem('Неподдерживаемый формат передачи.',400)
                try: length=int(self.headers.get('Content-Length','0'))
                except ValueError: raise Problem('Некорректная длина запроса.')
                if not 0<length<=1_000_000: raise Problem('Слишком большой или пустой запрос.',413)
                raw=self.rfile.read(length)
                if len(raw)!=length: raise Problem('Неполный запрос.')
                try: payload=json.loads(raw)
                except (ValueError,UnicodeDecodeError): raise Problem('Некорректный JSON.')
                result=service.dispatch(workspace,urlsplit(self.path).path,payload)
                self.send_json(200,result)
            except Problem as exc: self.send_json(exc.status,{'error':str(exc)})
            except Exception: self.send_json(500,{'error':'Ошибка сервера. Обновите данные перед повтором.'})
    return Handler


def main():
    try: tokens=json.loads(os.environ.get('NV_ACCESS_TOKENS','{}'))
    except ValueError: raise SystemExit('NV_ACCESS_TOKENS must be a JSON object.')
    if not isinstance(tokens,dict) or not tokens or any(not isinstance(k,str) or len(k)<32 or not isinstance(v,str) or not v.strip() for k,v in tokens.items()):
        raise SystemExit('Configure NV_ACCESS_TOKENS: token (32+ characters) -> workspace name. Server not started.')
    origins={x.strip() for x in os.getenv('NV_ALLOWED_ORIGINS','https://frostphonk1488-lang.github.io').split(',') if x.strip()}
    if '*' in origins: raise SystemExit('Use explicit origins, not *.')
    service=Service(os.getenv('NV_DATABASE','data/nasha-volna.sqlite3'),OpenAIProvider())
    server=ThreadingHTTPServer((os.getenv('NV_BIND','127.0.0.1'),int(os.getenv('PORT','8080'))),make_handler(service,tokens,origins))
    print('Nasha Volna API started. Model configured:',service.provider.configured,flush=True)
    server.serve_forever()

if __name__=='__main__': main()
