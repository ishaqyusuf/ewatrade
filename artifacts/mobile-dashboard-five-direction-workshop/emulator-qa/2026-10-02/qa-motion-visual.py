from pathlib import Path
import importlib.util,subprocess,time
s=importlib.util.spec_from_file_location('qa',Path(__file__).with_name('qa-emulator.py'));q=importlib.util.module_from_spec(s);s.loader.exec_module(q)
def grab(name):
 (q.OUT/(name+'.png')).write_bytes(q.adb('exec-out','screencap','-p'))
 print(name+' captured',flush=True)
# A distinct long fixture starts at the top; avoid pulling to refresh.
q.open_scene('stock-work','dark','business-b')
time.sleep(1);grab('reboot-motion-rest')
r=subprocess.Popen([q.ADB,'-s',q.DEVICE,'shell','screenrecord','--time-limit','30','/sdcard/ewatrade-home-motion-reboot.mp4'])
time.sleep(1)
q.shell('input','swipe','540','1400','540','1020','650');time.sleep(.7);grab('reboot-motion-down')
q.shell('input','swipe','540','1050','540','1250','650');time.sleep(.7);grab('reboot-motion-up')
for _ in range(5):q.swipe(True,300)
time.sleep(.7);grab('reboot-motion-bottom')
g=subprocess.Popen([q.ADB,'-s',q.DEVICE,'shell','input swipe 540 1650 540 400 5000'])
time.sleep(2.5);grab('reboot-motion-edge-held');g.wait();time.sleep(.8);grab('reboot-motion-edge-released')
r.wait();q.adb('pull','/sdcard/ewatrade-home-motion-reboot.mp4',str(q.OUT/'home-motion-reboot.mp4'))
print('Recording saved; visual inspection required',flush=True)
