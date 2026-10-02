from pathlib import Path
import importlib.util,json,re,time,xml.etree.ElementTree as ET
spec=importlib.util.spec_from_file_location('qa',Path(__file__).with_name('qa-emulator.py'))
qa=importlib.util.module_from_spec(spec);spec.loader.exec_module(qa)
results_path=qa.OUT/'large-text-lower-results.json'
results=json.loads(results_path.read_text()) if results_path.exists() else []
for theme in ['light','dark']:
 for scene,target in [('new-business','Take your first order'),('catalog-ready','Take your first order'),('invitation-pending','Alex has not joined yet.'),('returning-empty','No recent orders to show'),('queued','Orders pending sync'),('orders-unavailable','Recent orders unavailable'),('stock-work','Sample customer A, Consultation, Completed, R450.00')]:
  if any(r['state']==scene and r['theme']==theme and r['pass'] for r in results):continue
  qa.open_scene(scene,theme,'business-b')
  ok=False
  for attempt in range(10):
   raw=qa.tree()
   for node in ET.fromstring(raw).iter('node'):
    if target in (node.attrib.get('text',''),node.attrib.get('content-desc','')):
     bounds=list(map(int,re.findall(r'\d+',node.attrib['bounds'])))
     if len(bounds)==4 and bounds[1]>120 and bounds[3]<2170 and bounds[3]>bounds[1]:ok=True
   if ok:break
   qa.swipe(duration=300);time.sleep(.2)
  name=f'large-text-lower-{theme}-{scene}'
  qa.capture(name)
  results.append({'state':scene,'theme':theme,'target':target,'pass':ok,'capture':name})
  (qa.OUT/'large-text-lower-results.json').write_text(json.dumps(results,indent=2)+'\n')
  print(scene+' '+theme+': '+('PASS' if ok else 'FAIL'),flush=True)
