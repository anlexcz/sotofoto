"""Drop build-only monoliths after regression checks and terrain publication."""
from pathlib import Path
import json

def finalize(directory=Path('dist/data')):
    if not json.loads((directory/'meta.json').read_text()).get('chunked'):
        raise ValueError('Chunked data is required before finalization')
    json.loads((directory/'chunks.json').read_text())
    json.loads((directory/'terrain-index.json').read_text())
    for name in ['geometry.json.gz','schedule.json.gz','terrain.json.gz']:
        (directory/name).unlink(missing_ok=True)
if __name__=='__main__':finalize()
