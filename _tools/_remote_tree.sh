echo '=== 十个游戏目录的完整文件树 ==='
for d in game/yujin game/xinghuo game/tuocheng game/shenyuan game/zhanqi game/echo mirror-maze game/shijian game/xingqiong game/huayuan
do
  p="/var/www/site/$d"
  echo "--- $d ---"
  if [ -d "$p" ]; then
    find "$p" -type f -printf '%8s  %TY-%Tm-%Td %TH:%TM  %P\n' 2>/dev/null | sort -k4
  else
    echo "  (不存在)"
  fi
done
