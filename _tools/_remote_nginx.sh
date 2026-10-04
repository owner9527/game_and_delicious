echo '=== nginx 站点配置 ==='
ls -1 /etc/nginx/conf.d/ /etc/nginx/sites-enabled/ 2>/dev/null
echo
echo '--- server_name / listen / root ---'
grep -rhE 'server_name|listen|root' /etc/nginx/conf.d/ /etc/nginx/sites-enabled/ /etc/nginx/nginx.conf 2>/dev/null | sed 's/^[ \t]*//' | grep -v '^#' | head -30
echo
echo '=== 监听端口 ==='
ss -lntp 2>/dev/null | grep -E 'nginx|:80|:443' | head -10
