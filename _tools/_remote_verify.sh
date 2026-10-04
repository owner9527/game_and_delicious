cd /var/www/site
find game/yujin game/xinghuo game/tuocheng game/shenyuan game/zhanqi game/echo mirror-maze game/shijian game/xingqiong game/huayuan games -type f -exec md5sum {} + 2>/dev/null | sort -k2
