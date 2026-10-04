"""开发用本地服务器:带 no-cache 头,避免浏览器缓存 JS 迭代。
用法: python serve.py [端口]
"""
import http.server
import sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 27531


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()


if __name__ == '__main__':
    srv = http.server.ThreadingHTTPServer(('127.0.0.1', PORT), NoCacheHandler)
    print(f'serving at http://127.0.0.1:{PORT}/')
    srv.serve_forever()
