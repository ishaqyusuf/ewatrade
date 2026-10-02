"""Compare visible text bounds from captured Android UI trees (no device I/O)."""
from pathlib import Path
import xml.etree.ElementTree as E
import sys,json
base=Path(__file__).parent
def rows(file, labels):
    nodes=list(E.parse(base/file).iter('node'))
    result={}
    for label in labels:
        matches=[n.attrib['bounds'] for n in nodes if n.attrib.get('text')==label]
        if len(matches)!=1: raise ValueError(f'{file}: expected one visible {label!r}, found {len(matches)}')
        result[label]=matches[0]
    return result
if __name__=='__main__':
    before,after,*labels=sys.argv[1:]
    if not labels: raise ValueError('Provide the visible labels to compare')
    first,second=rows(before,labels),rows(after,labels)
    print(json.dumps({'baseline':before,'returned':after,'sameVisibleLabelBounds':first==second,'before':first,'after':second},indent=2))
    sys.exit(0 if first==second else 1)
