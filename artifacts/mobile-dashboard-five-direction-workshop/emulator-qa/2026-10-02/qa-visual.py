from pathlib import Path
import argparse,importlib.util,time
spec=importlib.util.spec_from_file_location('qa',Path(__file__).with_name('qa-emulator.py'))
qa=importlib.util.module_from_spec(spec);spec.loader.exec_module(qa)
def grab(name):
 (qa.OUT/(name+'.png')).write_bytes(qa.adb('exec-out','screencap','-p'))
def scene(state,theme='light',scope='business-b'):
 qa.shell('am','start','-a','android.intent.action.VIEW','-d',f'ewatrade-dev://home-guided-journey?state={state}&theme={theme}&scope={scope}','-n',qa.COMPONENT)
 time.sleep(2)
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('action',choices=['capture','scene','tap','back','swipe']);p.add_argument('--name',default='visual');p.add_argument('--state',default='everyday');p.add_argument('--theme',default='light');p.add_argument('--x');p.add_argument('--y');p.add_argument('--down',action='store_true');a=p.parse_args()
 if a.action=='scene':scene(a.state,a.theme)
 if a.action=='tap':qa.shell('input','tap',a.x,a.y);time.sleep(3)
 if a.action=='back':qa.shell('input','keyevent','4');time.sleep(3)
 if a.action=='swipe':qa.swipe(not a.down);time.sleep(.5)
 grab(a.name);print('Saved '+a.name,flush=True)
