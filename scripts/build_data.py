#!/usr/bin/env python3
"""Prepare static, compressed PID GTFS data. No third party Python dependencies."""
import argparse
import bisect
import csv
import gzip
import io
import json
import math
from pathlib import Path
import shutil
import urllib.request
import zipfile
from datetime import datetime, timezone

URL = 'https://data.pid.cz/PID_GTFS.zip'


def simplify_network(raw_shapes, tolerance=2, protected=()):
    """Simplify shared degree-two chains once, preserving common edges and branches."""
    graph = {}
    endpoints = set()
    for raw in raw_shapes.values():
        raw.sort()
        coordinates = [(round(p[1], 5), round(p[2], 5)) for p in raw]
        endpoints.update((coordinates[0], coordinates[-1]))
        for a, b in zip(coordinates, coordinates[1:]):
            if a == b: continue
            graph.setdefault(a, set()).add(b); graph.setdefault(b, set()).add(a)
    keep = endpoints | set(protected) | {p for p, neighbours in graph.items() if len(neighbours) != 2}
    visited = set()
    def simplify(chain):
        retained = {0, len(chain)-1}; stack = [(0, len(chain)-1)]
        while stack:
            start, end = stack.pop()
            if end <= start+1: continue
            a, b = chain[start], chain[end]; c = math.cos(math.radians(a[0]))
            dx=(b[1]-a[1])*c;dy=b[0]-a[0];den=dx*dx+dy*dy
            maximum, index = -1, start
            for j in range(start+1,end):
                p=chain[j];x=(p[1]-a[1])*c;y=p[0]-a[0]
                f=max(0,min(1,(x*dx+y*dy)/den)) if den else 0
                distance=math.hypot(x-f*dx,y-f*dy)*111195
                if distance>maximum:maximum,index=distance,j
            if maximum>tolerance:
                retained.add(index);stack.extend([(start,index),(index,end)])
        keep.update(chain[i] for i in retained)
    for start in list(keep):
        for nxt in graph.get(start, ()):
            edge=tuple(sorted((start,nxt)))
            if edge in visited:continue
            chain=[start,nxt];visited.add(edge);prev,current=start,nxt
            while current not in keep:
                options=graph[current]-{prev}
                if not options:break
                following=next(iter(options));edge=tuple(sorted((current,following)))
                if edge in visited:break
                visited.add(edge);chain.append(following);prev,current=current,following
            simplify(chain)
    for sid, raw in raw_shapes.items():
        raw_shapes[sid]=[p for p in raw if (round(p[1],5),round(p[2],5)) in keep]
    print(f'Network simplification: {len(graph):,} → {len(keep):,} vertices (2 m tolerance)',flush=True)


def seconds(value):
    h, m, s = map(int, value.split(':'))
    return h * 3600 + m * 60 + s


def write_json(path, value, compressed=False):
    content = json.dumps(value, ensure_ascii=False, separators=(',', ':')).encode()
    path.parent.mkdir(parents=True, exist_ok=True)
    if compressed:
        path.write_bytes(gzip.compress(content, compresslevel=9, mtime=0))
    else:
        path.write_bytes(content)
    print(f'{path.name}: {len(content)/1e6:.1f} MB JSON, {path.stat().st_size/1e6:.1f} MB on disk', flush=True)


def build(source, out):
    z = zipfile.ZipFile(source)
    def rows(name):
        if name not in z.namelist():
            return iter(())
        return csv.DictReader(io.TextIOWrapper(z.open(name), encoding='utf-8-sig'))

    routes = list(rows('routes.txt'))
    route_index = {r['route_id']: i for i, r in enumerate(routes)}
    agency_names = {r['sub_agency_id']: r['sub_agency_name'] for r in rows('route_sub_agencies.txt')}
    agency_names[''] = 'Dopravce neuveden'
    agencies = sorted(agency_names.items(), key=lambda a: a[1])
    agency_index = {a[0]: i for i, a in enumerate(agencies)}
    services = list(rows('calendar.txt'))
    service_index = {s['service_id']: i for i, s in enumerate(services)}
    exceptions = {}
    for r in rows('calendar_dates.txt'):
        sid = r['service_id']
        if sid not in service_index:
            service_index[sid] = len(services)
            services.append(dict(service_id=sid, start_date='99991231', end_date='00000101', **{d: '0' for d in ['monday','tuesday','wednesday','thursday','friday','saturday','sunday']}))
        exceptions.setdefault(r['date'], []).append([service_index[sid], int(r['exception_type'])])
    raw_trips = list(rows('trips.txt'))
    trip_index = {r['trip_id']: i for i, r in enumerate(raw_trips)}
    stop_times = [[] for _ in raw_trips]
    print('Reading stop times…', flush=True)
    operation_counts = {}
    for r in rows('stop_times.txt'):
        operation = int(r['trip_operation_type'])
        if operation < 1: raise ValueError(f'Invalid trip_operation_type: {operation}')
        operation_counts[operation] = operation_counts.get(operation, 0) + 1
        if r['trip_id'] in trip_index:
            stop_times[trip_index[r['trip_id']]].append([int(r['stop_sequence']), r['stop_id'], float(r['shape_dist_traveled']) if r.get('shape_dist_traveled') else None, seconds(r['arrival_time']), seconds(r['departure_time']), operation])
    # PID flags describe the outgoing stop-to-stop section, not the whole trip.
    # Preserve operation boundaries when simplifying geometry.
    transitions = {}
    for trip, st in zip(raw_trips, stop_times):
        st.sort()
        for previous, current in zip(st, st[1:]):
            if previous[5] != current[5]:
                transitions.setdefault(trip.get('shape_id'), set()).add(current[2])
    print(f'PID stop-time operation types: {operation_counts}', flush=True)
    print('Reading shape geometry…', flush=True)
    raw_shapes = {}
    for r in rows('shapes.txt'):
        raw_shapes.setdefault(r['shape_id'], []).append((int(r['shape_pt_sequence']), float(r['shape_pt_lat']), float(r['shape_pt_lon']), float(r['shape_dist_traveled'] or 0)))
    for sid, distances in transitions.items():
        if sid in raw_shapes and not distances.issubset({p[3] for p in raw_shapes[sid]}):
            raise ValueError(f'Operation boundary missing from shape {sid}')
    protected = {(round(p[1], 5), round(p[2], 5)) for sid, raw in raw_shapes.items() for p in raw if p[3] in transitions.get(sid, ())}
    simplify_network(raw_shapes, protected=protected)
    points, point_index, edges, edge_index, shapes, shape_ids = [], {}, [], {}, [], {}
    for sid, raw in raw_shapes.items():
        raw.sort()
        shape_ids[sid] = len(shapes)
        refs, distances = [], []
        last_point = None
        for _, lat, lon, dist in raw:
            coordinate = (round(lat, 5), round(lon, 5))
            if coordinate not in point_index:
                point_index[coordinate] = len(points)
                points.append(coordinate)
            p = point_index[coordinate]
            if last_point is not None and p != last_point:
                a, b = sorted((last_point, p))
                key = (a, b)
                if key not in edge_index:
                    edge_index[key] = len(edges)
                    edges.append(key)
                idx = edge_index[key]
                refs.append(idx + 1 if last_point == a else -(idx + 1))
                distances.append([last_dist, dist])
            last_point, last_dist = p, dist
        shapes.append([refs, distances])
    del raw_shapes
    stops = {r['stop_id']: [r['stop_name'], float(r['stop_lat']), float(r['stop_lon'])] for r in rows('stops.txt') if r['stop_lat'] and r['stop_lon']}
    # Each pattern shares geometry and stop distances; times remain trip-specific.
    patterns, pattern_index, trips, headsigns, headsign_index = [], {}, [], [], {}
    fallback_count, missing_shapes = 0, 0
    for i, r in enumerate(raw_trips):
        st = sorted(stop_times[i])
        if len(st) < 2:
            continue
        sid = r.get('shape_id')
        if sid not in shape_ids:
            # Shape-less journeys remain visible, using explicitly marked straight lines.
            coords = [stops[s[1]][1:] for s in st if s[1] in stops]
            if len(coords) != len(st):
                missing_shapes += 1
                continue
            sid = 'fallback:' + '|'.join(s[1] for s in st)
            if sid not in shape_ids:
                refs, dd, total = [], [], 0
                prev = None
                for lat, lon in coords:
                    coordinate = (round(lat,5), round(lon,5))
                    if coordinate not in point_index:
                        point_index[coordinate] = len(points); points.append(coordinate)
                    p = point_index[coordinate]
                    if prev is not None and p != prev:
                        a,b=sorted((prev,p)); key=(a,b)
                        if key not in edge_index:
                            edge_index[key]=len(edges); edges.append(key)
                        nxt=total+math.hypot((lat-prev_lat)*111, (lon-prev_lon)*111*math.cos(math.radians(lat)))
                        refs.append(edge_index[key]+1 if prev==a else -(edge_index[key]+1));dd.append([total,nxt]);total=nxt
                    prev,prev_lat,prev_lon=p,lat,lon
                shape_ids[sid]=len(shapes);shapes.append([refs,dd])
            fallback_count+=1
        shape = shape_ids[sid]
        is_fallback = str(sid).startswith('fallback:')
        if is_fallback:
            total = 0
            for j,s in enumerate(st):
                if j:
                    p,q=stops[st[j-1][1]],stops[s[1]]
                    total+=math.hypot((q[1]-p[1])*111,(q[2]-p[2])*111*math.cos(math.radians(q[1])))
                s[2]=total
        # PID supplies shape_dist_traveled; missing values use monotonic projection.
        if any(s[2] is None for s in st):
            cursor=0
            refs,ds=shapes[shape]
            for s in st:
                if s[2] is not None:continue
                loc=stops.get(s[1])
                candidates=[]
                for k in range(cursor,len(refs)):
                    a,b=edges[abs(refs[k])-1]
                    if refs[k]<0:a,b=b,a
                    p,q=points[a],points[b]
                    dx=(q[1]-p[1])*math.cos(math.radians(p[0]));dy=q[0]-p[0]
                    x=(loc[2]-p[1])*math.cos(math.radians(p[0]));y=loc[1]-p[0]
                    f=max(0,min(1,(x*dx+y*dy)/(dx*dx+dy*dy))) if dx*dx+dy*dy else 0
                    candidates.append(((x-f*dx)**2+(y-f*dy)**2,k,f))
                if candidates:
                    _,cursor,f=min(candidates);s[2]=ds[cursor][0]+f*(ds[cursor][1]-ds[cursor][0])
                else:s[2]=0
        operations=tuple(s[5] for s in st)
        key=(shape,tuple((s[1],s[2]) for s in st),is_fallback,operations)
        if key not in pattern_index:
            pattern_index[key]=len(patterns)
            pattern=[shape,[s[2] for s in st],[stops.get(s[1],[s[1]])[0] for s in st],int(is_fallback)]
            if any(operation != 1 for operation in operations): pattern.append(operations)
            patterns.append(pattern)
        head=r['trip_headsign'] or stops.get(st[-1][1],[''])[0]
        if head not in headsign_index:headsign_index[head]=len(headsigns);headsigns.append(head)
        agency=r.get('sub_agency_id','')
        if agency not in agency_index:
            agency_index[agency]=len(agencies);agencies.append([agency,agency or 'Dopravce neuveden'])
        trips.append([route_index[r['route_id']],agency_index[agency],service_index[r['service_id']],pattern_index[key],headsign_index[head],[v for s in st for v in (s[3],s[4])],r.get('trip_short_name') or '',r['trip_id']])
    feed = next(rows('feed_info.txt'))
    weekdays=['monday','tuesday','wednesday','thursday','friday','saturday','sunday']
    meta={'version':2,'source':URL,'publisher':'ROPID / PID','builtAt':datetime.now(timezone.utc).isoformat(),'startDate':feed['feed_start_date'],'endDate':feed['feed_end_date'],'routes':[[r['route_id'],r['route_short_name'],r['route_long_name'],int(r['route_type']),r.get('route_color',''),int(r.get('is_night') or 0)] for r in routes],'agencies':agencies,'services':[[s['start_date'],s['end_date'],*[int(s[d]) for d in weekdays]] for s in services],'exceptions':exceptions,'headsigns':headsigns,'stats':{'trips':len(trips),'shapes':len(shapes),'edges':len(edges),'fallbackTrips':fallback_count,'skippedTrips':missing_shapes}}
    write_json(out/'meta.json',meta)
    write_json(out/'geometry.json.gz',{'points':points,'edges':edges,'shapes':shapes},True)
    write_json(out/'schedule.json.gz',{'patterns':patterns,'trips':trips},True)
    print(meta['stats'],flush=True)


def main():
    p=argparse.ArgumentParser();p.add_argument('--input',type=Path);p.add_argument('--provenance',type=Path);p.add_argument('--output',type=Path,default=Path('dist'));a=p.parse_args()
    a.output.mkdir(parents=True,exist_ok=True)
    for file in ['index.html','style.css']:shutil.copyfile(Path('public')/file,a.output/file)
    shutil.copytree('src',a.output/'src',dirs_exist_ok=True)
    shutil.copytree('public/vendor',a.output/'vendor',dirs_exist_ok=True)
    source=a.input
    if not source:
        source=Path('/tmp/sotofoto-PID_GTFS.zip')
        urllib.request.urlretrieve(URL,source)
    build(source,a.output/'data')
    if a.provenance:
        provenance=json.loads(a.provenance.read_text());path=a.output/'data/meta.json';meta=json.loads(path.read_text());meta.update(provenance)
        if provenance['continuity']['complete']:meta['serviceStartDate']=provenance['continuity']['day']
        write_json(path,meta)
    from chunk_data import write_chunks
    write_chunks(a.output/'data')
    (a.output/'.nojekyll').touch()


if __name__=='__main__':main()
