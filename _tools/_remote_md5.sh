for pair in "1:game/yujin" "2:game/xinghuo" "3:game/tuocheng" "4:game/shenyuan" "5:game/zhanqi" "6:game/echo" "7:mirror-maze" "8:game/shijian" "9:game/xingqiong" "10:game/huayuan"
do
  n="${pair%%:*}"; d="${pair#*:}"; p="/var/www/site/$d"
  echo "### $n -> $d"
  if [ -d "$p" ]; then
    ( cd "$p" && find . -type f -name '*.js' -o -type f -name '*.css' -o -type f -name '*.html' ) 2>/dev/null | sort | while read -r f
    do
      echo "$(md5sum "$p/$f" 2>/dev/null | cut -c1-32)  ${f#./}"
    done
  else
    echo "  (目录不存在)"
  fi
done
