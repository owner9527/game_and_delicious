set -e
cd /var/www/site

echo '=== 解包前确认备份存在 ==='
ls -la /root/games-backup-*.tar.gz

echo
echo '=== 解包 ==='
tar xzf /root/deploy-games.tar.gz -C /var/www/site
echo '解包完成'

echo
echo '=== 修正属主与权限 ==='
chown -R www-data:www-data /var/www/site/game /var/www/site/mirror-maze /var/www/site/games
find /var/www/site/game /var/www/site/mirror-maze /var/www/site/games -type d -exec chmod 755 {} +
find /var/www/site/game /var/www/site/mirror-maze /var/www/site/games -type f -exec chmod 644 {} +
echo '权限修正完成'

echo
echo '=== 部署后各游戏目录 ==='
for d in game/yujin game/xinghuo game/tuocheng game/shenyuan game/zhanqi game/echo mirror-maze game/shijian game/xingqiong game/huayuan games
do
  p="/var/www/site/$d"
  printf '%-20s %8s  %s\n' "$d" "$(du -sh "$p" 2>/dev/null | cut -f1)" "$(stat -c '%U:%G' "$p" 2>/dev/null)"
done

echo
echo '=== 入口文件是否就位 ==='
for f in game/yujin/index.html game/xinghuo/index.html game/tuocheng/index.html game/shenyuan/index.html game/zhanqi/index.html game/echo/index.html mirror-maze/index.html game/shijian/index.html game/xingqiong/index.html game/huayuan/index.html games/index.html
do
  p="/var/www/site/$f"
  if [ -f "$p" ]; then printf '%-32s %8s bytes  %s\n' "$f" "$(stat -c %s "$p")" "$(stat -c %y "$p" | cut -c1-16)"; else printf '%-32s 缺失!\n' "$f"; fi
done
