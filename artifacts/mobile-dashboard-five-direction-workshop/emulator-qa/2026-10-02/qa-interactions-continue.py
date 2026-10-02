from pathlib import Path
import json,re,time,xml.etree.ElementTree as ET
import importlib.util
_spec=importlib.util.spec_from_file_location('homeqa',Path(__file__).with_name('qa-emulator.py'))
qa=importlib.util.module_from_spec(_spec);_spec.loader.exec_module(qa)
from_types = ['OUT','adb','shell','tree','strings','capture','open_scene','swipe','tap_label','COMPONENT']
for _name in from_types:globals()[_name]=getattr(qa,_name)
results=json.loads((OUT/'interaction-results.json').read_text())
def check(label,passed,evidence):
 results.append({'check':label,'pass':passed,'evidence':evidence})
 (OUT/'interaction-results.json').write_text(json.dumps(results,indent=2)+'\n')
 print(label+': '+('PASS' if passed else 'FAIL'),flush=True)
def find(label):
 for _ in range(7):
  raw=tree()
  for n in ET.fromstring(raw).iter('node'):
   if label in (n.attrib.get('text',''),n.attrib.get('content-desc','')):
    coords=list(map(int,re.findall(r'\d+',n.attrib.get('bounds',''))))
    if len(coords)==4 and coords[1]>120 and coords[3]<2170 and coords[3]>coords[1]:return True
  swipe();time.sleep(.4)
 return False
open_scene('first-order')
for _ in range(4):swipe();time.sleep(.2)
txt=capture('interaction-06-solo-cold-start');check('Solo choice survives app cold start','Share the work with your team.' not in txt and 'Invite your team' in txt,'interaction-06-solo-cold-start')
for scope in ['account-b','business-b','store-b']:
 open_scene('first-order',scope=scope)
 assert find('I work on my own'),f'Prompt not reachable: {scope}'
 txt=capture('interaction-07-scope-'+scope);check('Solo preference isolated: '+scope,'I work on my own' in txt,'interaction-07-scope-'+scope)
open_scene('first-order',scope='store-b');assert find('Invite someone')
tap_label('Invite someone');txt=capture('interaction-08-pending');check('Invite action enters pending acknowledgement','Invitation pending' in txt and 'Alex has not joined yet.' in txt,'interaction-08-pending')
assert find('QA: member joins');tap_label('QA: member joins');txt=capture('interaction-09-active');check('Member joining removes pending acknowledgement','Invitation pending' not in txt and 'View your team' in txt,'interaction-09-active')
open_scene('unavailable');tap_label('Try again');txt=capture('interaction-10-retry');check('Recovery action renders available Home','Your store, at a glance.' in txt and 'Business status unavailable' not in txt,'interaction-10-retry')
for scene,target in [('returning-empty','No recent orders to show'),('queued','Orders pending sync'),('orders-unavailable','Recent orders unavailable'),('invitation-pending','Alex has not joined yet.')]:
 open_scene(scene)
 assert find(target),scene+' expected content not reachable'
 txt=capture('interaction-11-'+scene);check('Reachable distinct state: '+scene,target in txt,'interaction-11-'+scene)

