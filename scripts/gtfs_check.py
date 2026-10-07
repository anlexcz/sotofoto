"""Skip recovery schedules only after today's successful production update."""
import json,os,urllib.request
from datetime import datetime
from zoneinfo import ZoneInfo
from gtfs_update import SITE,retry

def needed(meta,now):
    zone=ZoneInfo('Europe/Prague');now=now.astimezone(zone);day=now.strftime('%Y%m%d')
    try:built=datetime.fromisoformat(meta['builtAt']).astimezone(zone)
    except (KeyError,ValueError):return True
    return not (built.date()==now.date() and built.hour>=4 and meta.get('automaticUpdate') and meta.get('sourceSnapshot',{}).get('startDate','z')<=day<=meta.get('sourceSnapshot',{}).get('endDate',''))

if __name__=='__main__':
    meta=retry(lambda:json.load(urllib.request.urlopen(urllib.request.Request(SITE,headers={'Cache-Control':'no-cache'}),timeout=60)))
    update=needed(meta,datetime.now(ZoneInfo('Europe/Prague')))
    with open(os.environ['GITHUB_OUTPUT'],'a') as f:f.write('needed='+str(update).lower()+'\n')
    print('Update required' if update else 'Production already updated today; recovery run skipped')
