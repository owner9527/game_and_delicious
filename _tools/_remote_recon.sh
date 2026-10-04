echo '=== nginx 配置里的 root / server_name ==='
grep -rhE 'server_name|root |listen ' /etc/nginx/conf.d/ /etc/nginx/sites-enabled/ /etc/nginx/nginx.conf 2>/dev/null | sed 's/^[ \t]*//' | grep -v '^#' | head -30

echo
echo '=== /var/www/site/games/ ==='
ls -la /var/www/site/games/ 2>/dev/null

echo
echo '=== /var/www/site/game/index.html（前 20 行） ==='
head -20 /var/www/site/game/index.html 2>/dev/null

echo
echo '=== /var/www/site/index.html 是什么（标题） ==='
grep -oE '<title>[^<]*</title>' /var/www/site/index.html 2>/dev/null | head -3

echo
echo '=== 服务器上现有各游戏目录（大小 / 修改时间） ==='
for d in game/yujin game/xinghuo game/tuocheng game/shenyuan game/zhanqi game/echo mirror-maze game/shijian game/xingqiong game/huayuan; do
  p="/var/www/site/$d"
  if [ -d "$p" ]; then
    printf '%-22s %8s  %s\n' "$d" "$(du -sh "$p" 2>/dev/null | cut -f1)" "$(date -r "$p" '+%Y-%m-%d %H:%M')"
  else
    printf '%-22s (不存在)\n' "$d"
  fi
done

echo
echo '=== 现有 echo 目录内容（确认是不是同一个游戏） ==='
ls -la /var/www/site/game/echo 2>/dev/null | head -12
