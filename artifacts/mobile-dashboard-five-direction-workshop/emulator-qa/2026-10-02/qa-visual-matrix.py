from pathlib import Path
import argparse,importlib.util,json,subprocess,time
spec=importlib.util.spec_from_file_location('qa',Path(__file__).with_name('qa-emulator.py'))
qa=importlib.util.module_from_spec(spec);spec.loader.exec_module(qa)
p=argparse.ArgumentParser();p.add_argument('--theme',default='light');p.add_argument('--scale',default='100');p.add_argument('--states');a=p.parse_args()
results_path=qa.OUT/f'final-{a.scale}-{a.theme}-results.json'
results=json.loads(results_path.read_text()) if results_path.exists() else []
for state in (a.states.split(',') if a.states else qa.SCENES):
 qa.open_scene(state,a.theme,'business-b')
 time.sleep(1)
 prefix=f'final-{a.scale}-{a.theme}-{state}'
 for position in ['top','middle','bottom']:
  if position=='middle':
   qa.swipe(duration=300);time.sleep(.5)
  elif position=='bottom':
   for _ in range(2):qa.swipe(duration=300)
   time.sleep(.5)
  image=qa.adb('exec-out','screencap','-p');(qa.OUT/(prefix+'-'+position+'.png')).write_bytes(image)
  if position=='top':
   pixel=subprocess.check_output(['/opt/homebrew/bin/ffmpeg','-hide_banner','-loglevel','error','-i','pipe:0','-vf','crop=1:1:10:600,format=rgb24','-frames:v','1','-f','rawvideo','pipe:1'],input=image)
   brightness=sum(pixel)/len(pixel)
   theme_ok=brightness<70 if a.theme=='dark' else brightness>180
 results=[r for r in results if r['state']!=state]
 results.append({'state':state,'theme':a.theme,'scale':a.scale,'themeMatch':theme_ok,'captures':[prefix+'-'+s for s in ['top','middle','bottom']],'visualAcceptance':'pending review'})
 results_path.write_text(json.dumps(results,indent=2)+'\n')
 print(state+' '+a.theme+' '+a.scale+' captured; theme '+str(theme_ok),flush=True)
