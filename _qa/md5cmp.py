import glob, hashlib, subprocess
MAP = [('1/余烬之城.html','game/yujin/index.html'),('2/index.html','game/xinghuo/index.html'),('2/css/style.css','game/xinghuo/css/style.css'),('3/index.html','game/tuocheng/index.html'),('3/css/style.css','game/tuocheng/css/style.css'),('4/index.html','game/shenyuan/index.html'),('4/style.css','game/shenyuan/style.css'),('5/index.html','game/zhanqi/index.html'),('6/index.html','game/echo/index.html'),('6/css/style.css','game/echo/css/style.css'),('7/index.html','mirror-maze/index.html'),('7/css/style.css','mirror-maze/css/style.css'),('8/index.html','game/shijian/index.html'),('8/css/style.css','game/shijian/css/style.css'),('9/index.html','game/xingqiong/index.html'),('9/css/style.css','game/xingqiong/css/style.css'),('10/index.html','game/huayuan/index.html'),('10/css/style.css','game/huayuan/css/style.css')]
for js in glob.glob('2/js/*.js'): MAP.append((js,'game/xinghuo/'+js.replace('\\','/')[2:]))
for js in glob.glob('3/js/*.js'): MAP.append((js,'game/tuocheng/'+js.replace('\\','/')[2:]))
for js in glob.glob('4/js/*.js'): MAP.append((js,'game/shenyuan/'+js.replace('\\','/')[2:]))
for js in glob.glob('6/js/*.js'): MAP.append((js,'game/echo/'+js.replace('\\','/')[2:]))
for js in glob.glob('7/js/*.js'): MAP.append((js,'mirror-maze/'+js.replace('\\','/')[2:]))
for js in glob.glob('8/js/*.js'): MAP.append((js,'game/shijian/'+js.replace('\\','/')[2:]))
for js in glob.glob('9/js/*.js'): MAP.append((js,'game/xingqiong/'+js.replace('\\','/')[2:]))
for js in glob.glob('10/js/*.js'): MAP.append((js,'game/huayuan/'+js.replace('\\','/')[2:]))
cmd = ['ssh','-o','BatchMode=yes','root@47.94.215.84','md5sum ' + ' '.join('/var/www/site/'+s for _,s in MAP)]
out = subprocess.run(cmd, capture_output=True, text=True).stdout
remote = {}
for l in out.strip().splitlines():
    h, p = l.split()
    remote[p] = h
def lmd5(p): return hashlib.md5(open(p,'rb').read()).hexdigest()
diff = [(lp,sp) for lp,sp in MAP if remote.get('/var/www/site/'+sp) != lmd5(lp)]
print('MD5: %d files compared, %d differ' % (len(MAP), len(diff)))
for d in diff: print('DIFF', d)
