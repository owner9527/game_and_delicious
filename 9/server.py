"""开发测试服务器：禁用缓存，保证总能加载最新文件（正式部署无需此文件）"""
import http.server
import socketserver

class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

if __name__ == '__main__':
    port = 8619
    socketserver.ThreadingTCPServer.allow_reuse_address = True
    with socketserver.ThreadingTCPServer(('127.0.0.1', port), NoCacheHandler) as httpd:
        print(f'Serving at http://127.0.0.1:{port}')
        httpd.serve_forever()
