from pathlib import Path
import importlib.util, subprocess, time

s = importlib.util.spec_from_file_location('qa', Path(__file__).with_name('qa-emulator.py'))
q = importlib.util.module_from_spec(s)
s.loader.exec_module(q)

def grab(name):
    (q.OUT / (name + '.png')).write_bytes(q.adb('exec-out', 'screencap', '-p'))
    print(name, flush=True)

q.open_scene('stock-work', 'dark', 'store-b')
for _ in range(5):
    q.swipe(False, 250)
time.sleep(1)
grab('resumed-motion-rest')
r = subprocess.Popen([q.ADB, '-s', q.DEVICE, 'shell', 'screenrecord', '--time-limit', '45', '/sdcard/ewatrade-home-motion-resumed.mp4'])
time.sleep(1)
q.shell('input', 'swipe', '540', '1500', '540', '1140', '700')
time.sleep(1)
grab('resumed-motion-down')
q.shell('input', 'swipe', '540', '1100', '540', '1300', '700')
time.sleep(1)
grab('resumed-motion-up')
for _ in range(6):
    q.swipe(True, 250)
time.sleep(1)
grab('resumed-motion-bottom')
q.shell('input', 'motionevent', 'DOWN', '540', '1750')
for y in range(1700, 599, -100):
    q.shell('input', 'motionevent', 'MOVE', '540', str(y))
grab('resumed-motion-edge-held')
q.shell('input', 'motionevent', 'UP', '540', '600')
time.sleep(1)
grab('resumed-motion-edge-released')
r.wait()
q.adb('pull', '/sdcard/ewatrade-home-motion-resumed.mp4', str(q.OUT / 'home-motion-resumed.mp4'))
print(q.capture('resumed-motion-bottom-tree'), flush=True)
