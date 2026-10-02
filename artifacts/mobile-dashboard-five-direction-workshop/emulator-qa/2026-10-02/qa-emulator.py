import argparse, json, re, shlex, subprocess, time
from pathlib import Path
import xml.etree.ElementTree as ET

ADB='/Users/M1PRO/Library/Android/sdk/platform-tools/adb'
DEVICE='emulator-5554'
COMPONENT='com.ewatrade.dev.barcodeqa/com.ewatrade.dev.MainActivity'
OUT=Path(__file__).resolve().parent

def adb(*args):
    return subprocess.check_output([ADB,'-s',DEVICE,*args],stderr=subprocess.STDOUT,timeout=30)
def shell(*args):
    return adb('shell',shlex.join(list(args)))
def tree():
    shell('uiautomator','dump','/sdcard/ewatrade-home-qa.xml')
    return adb('shell','cat /sdcard/ewatrade-home-qa.xml')
def strings(raw):
    return '\n'.join(n.attrib.get('text','')+' '+n.attrib.get('content-desc','') for n in ET.fromstring(raw).iter('node'))
def capture(name):
    raw=tree();(OUT/(name+'.xml')).write_bytes(raw)
    (OUT/(name+'.png')).write_bytes(adb('exec-out','screencap','-p'))
    return strings(raw)
def open_scene(state,theme='light',scope='a'):
    shell('am','start','-W','-a','android.intent.action.VIEW','-d',f'ewatrade-dev://home-guided-journey?state={state}&theme={theme}&scope={scope}','-n',COMPONENT)
    time.sleep(.8)
    for _ in range(4):
        raw=tree()
        if f'Fixture only · {state} · Scope {scope}' in strings(raw):return
        if any(marker in strings(raw) for marker in ['QA controls', 'Sample customer', 'Store shortcuts', 'Invitation pending']):
            for _ in range(3):swipe(False,200)
        time.sleep(.5)
    raise RuntimeError(f'Scene did not load: {state} {theme} {scope}')
def swipe(up=True,duration=500):
    shell('input','swipe','540','1750' if up else '650','540','650' if up else '1750',str(duration))
def tap_label(label):
    raw=tree()
    for n in ET.fromstring(raw).iter('node'):
        if label in (n.attrib.get('text',''),n.attrib.get('content-desc','')):
            nums=list(map(int,re.findall(r'\d+',n.attrib['bounds'])))
            if len(nums)==4 and nums[3]>nums[1] and nums[2]>nums[0]:
                shell('input','tap',str((nums[0]+nums[2])//2),str((nums[1]+nums[3])//2));time.sleep(.5);return
    raise RuntimeError('Visible label not found: '+label)

SCENES={
 'new-business':'Let’s get your business ready.',
 'unfinished-catalog':'Let’s finish your catalog.',
 'catalog-ready':'Ready for your first order.',
 'first-order':'Your store, at a glance.',
 'solo':'Your store, at a glance.',
 'invitation-pending':'Your store, at a glance.',
 'team-active':'Your store, at a glance.',
 'everyday':'Your store, at a glance.',
 'returning-empty':'Your store, at a glance.',
 'queued':'Your store, at a glance.',
 'offline-cached':'Cached business status',
 'offline-empty':'Business status unavailable offline',
 'loading':'Loading your business',
 'unavailable':'Business status unavailable',
 'orders-unavailable':'Your store, at a glance.',
 'stock-work':'Stock balances',
 'established-unready':'Get catalog ready',
 'team-unknown':'Your store, at a glance.',
 'team-existing':'Your store, at a glance.',
 'team-restricted':'Your store, at a glance.',
}
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('mode',choices=['matrix','capture','open','tap','swipe']);p.add_argument('--theme',default='light');p.add_argument('--state',default='new-business');p.add_argument('--name',default='capture');p.add_argument('--scope',default='a');p.add_argument('--label');p.add_argument('--down',action='store_true');args=p.parse_args()
 if args.mode=='matrix':
    results=[]
    for state,expected in SCENES.items():
        open_scene(state,args.theme,args.scope)
        name=f'{args.name}-{args.theme}-{state}'
        txt=capture(name);ok=expected in txt
        if not ok:
            for attempt in range(3):
                swipe();time.sleep(.3)
                reachable=capture(name+f'-reachable-{attempt+1}')
                if expected in reachable:
                    ok=True;break
        results.append({'state':state,'theme':args.theme,'scope':args.scope,'expected':expected,'pass':ok,'capture':name})
        (OUT/f'{args.name}-{args.theme}-results.json').write_text(json.dumps(results,indent=2)+'\n')
        print(f'{state}: {"PASS" if ok else "FAIL"}',flush=True)
 elif args.mode=='open':open_scene(args.state,args.theme,args.scope)
 elif args.mode=='capture':print(capture(args.name))
 elif args.mode=='tap':tap_label(args.label)
 elif args.mode=='swipe':swipe(not args.down)
