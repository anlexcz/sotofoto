"""Build-only display LODs. Original edge IDs, shapes and GTFS distances stay intact."""
import bisect, math
from collections import defaultdict

# At latitude 50 degrees: <= 0.34 px at z11 / <= 0.66 px at z14.
LEVELS = {'overview': {'maxZoom': 11, 'tolerance': 16},
          'medium': {'maxZoom': 14, 'tolerance': 4},
          'detail': {'maxZoom': 19, 'tolerance': 0}}

def retained(points, tolerance):
    keep = {0, len(points)-1}; stack = [(0, len(points)-1)]
    while stack:
        a,b = stack.pop()
        if b <= a+1: continue
        lat,lon = points[a]; c = math.cos(math.radians(lat))
        dx=(points[b][1]-lon)*c; dy=points[b][0]-lat; den=dx*dx+dy*dy
        maximum,j=-1,a
        for k in range(a+1,b):
            x=(points[k][1]-lon)*c; y=points[k][0]-lat
            f=max(0,min(1,(x*dx+y*dy)/den)) if den else 0
            distance=math.hypot(x-f*dx,y-f*dy)*111195
            if distance>maximum: maximum,j=distance,k
        if maximum>tolerance:
            keep.add(j); stack.extend([(a,j),(j,b)])
    return sorted(keep)

def attributes(g,s):
    pairs=defaultdict(set)
    for t in s['trips']: pairs[t[3]].add((t[0],t[1]))
    attrs=[set() for _ in g['edges']]
    for pi,p in enumerate(s['patterns']):
        refs,distances,*_=g['shapes'][p[0]]
        for ref,ds in zip(refs,distances):
            d=sum(ds)/2
            if d<p[1][0] or d>p[1][-1]: continue
            k=max(0,min(len(p[1])-1,bisect.bisect_right(p[1],d)-1))
            op=p[4][k] if len(p)>4 else 1
            for r,a in pairs[pi]: attrs[abs(ref)-1].add((r,a,1 if ref>0 else -1,op))
    return [sorted(a) for a in attrs]

def display_levels(geometry, attrs, anchors=frozenset()):
    """Local degree-two chains stop at every branch and static identity/type boundary.

    Local chunk ends and original shape ends are explicit anchors. No merging of nearly equal tracks.
    Every member appears once per level, in path order and signed canonical direction.
    """
    edges=geometry['edges']; by_id={e:(a,b) for e,a,b in edges}
    graph=defaultdict(list)
    for e,a,b in edges:
        graph[tuple(a)].append(e); graph[tuple(b)].append(e)
    used=set(); chains=[]
    signature=lambda e,sign: tuple(sorted((r,a,d*sign,op) for r,a,d,op in attrs[e]))
    def walk(e,node):
        members=[]; points=[list(node)]; first_key=None
        while e not in used:
            a,b=by_id[e]; sign=1 if tuple(a)==node else -1
            key=signature(e,sign)
            if first_key is not None and key!=first_key: break
            first_key=key; used.add(e); members.append((e+1)*sign)
            node=tuple(b if sign==1 else a); points.append(list(node))
            if len(graph[node])!=2 or node in anchors: break
            nxt=next((v for v in graph[node] if v not in used),None)
            if nxt is None: break
            e=nxt
        chains.append((points,members,first_key))
    # Anchor topology and signatures on both sides, not just the chosen walk start.
    for node,es in graph.items():
        boundary=len(es)!=2 or node in anchors
        if not boundary:
            e,f=es; a,b=by_id[e]; c,d=by_id[f]
            incoming=1 if tuple(b)==node else -1
            outgoing=1 if tuple(c)==node else -1
            boundary=signature(e,incoming)!=signature(f,outgoing)
        if boundary:
            for e in es:
                if e not in used: walk(e,node)
    for e,a,b in edges:
        if e not in used: walk(e,tuple(a))
    result={}
    for name,config in LEVELS.items():
        segments=[]
        for points,refs,key in chains:
            ks=retained(points,config['tolerance']) if config['tolerance'] else list(range(len(points)))
            for a,b in zip(ks,ks[1:]): segments.append([points[a],points[b],refs[a:b],key])
        result[name]=segments
    return result
