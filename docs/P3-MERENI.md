# P3 – zástavba: měření a ověření

Implementace je připravená v samostatné větvi; tento dokument odděluje výsledky testů od měření na konkrétním zařízení a od skutečného nasazení. Závěrečné metriky a stav publikace se doplní po produkčním buildu.

## Výběr zdroje (6. 10. 2026)

| Kandidát | Přínos | Omezení / rozhodnutí |
| --- | --- | --- |
| [OSM PBF / Geofabrik ČR](https://download.geofabrik.de/europe/czech-republic.html) | Jeden automaticky zpracovatelný snapshot; footprint, building:part, height, levels, min_height, roof údaje; ODbL | Zvolen pro P3. Výšky jsou neúplné a mohou být odhadnuté/chybné. Jejich skutečný podíl se měří na zpracovaných datech. |
| [ČÚZK otevřená data](https://www.cuzk.gov.cz/Uvod/Produkty-a-sluzby/Otevrena-data/Otevrena-data-zakladni-informace.aspx) | Celostátní footprinty / tematické sady; CC BY 4.0 | Neprokázána jednotná hotová celostátní sada solidů budov s jednoduchým aktuálním downloadem vhodná k přímému nasazení do této pipeline. Neznamená to, že ČÚZK výšková data nemá. |
| [ČÚZK DMP 1G](https://geoportal.gov.cz/php/micka/record/full/CZ-CUZK-DMP1G-V) | Povrch včetně staveb, uváděná střední chyba 0,4 m pro budovy | Obsahuje i vegetaci, nejde přímo o relativní height tag. Vyžadoval by klasifikaci, footprinty, DMR a ověření distribuční pipeline; není automaticky přidán jako spolehlivý model budov. |
| [3D model Prahy / IPR](https://iprpraha.cz/struktura) | Možnost přesnější pražské geometrie, otevřená/výdejová data | Nepokrývá celý PID. Strojová distribuce a kompletní licence jednotlivých vrstev nebyly v P3 ověřeny; nemá se vydávat za nasazený zdroj. |

Výklad OSM: [height](https://wiki.openstreetmap.org/wiki/Key:height), [building:levels](https://wiki.openstreetmap.org/wiki/Key:building:levels), [Simple 3D Buildings](https://wiki.openstreetmap.org/wiki/Simple_3D_Buildings), [licence](https://www.openstreetmap.org/copyright). Výška height zahrnuje střechu, levels střechu nezahrnují; min_height vyjadřuje spodní otvor. Vegetace může být budoucí samostatná nejistá vrstva, nikoli součást P3.

## Azimutové rozlišení

`python scripts/building_resolution.py`: pět kruhových půdorysů v různých vzdálenostech, natočených mimo násobky kroku. Hodnoceno 3600 azimutů × čtyři výšky Slunce; stejná geografická nejistota ve všech variantách. Jde o syntetické měření obálek, nikoli validaci skutečných pražských stínů.

| Krok | Vzorků | Bajtů profilu včetně klíče | Neověřených z 14 400 | Rozdíl proti 5° |
| --- | ---: | ---: | ---: | ---: |
| 5° | 72 | 512 | 7650 | — |
| 2,5° | 144 | 1016 | 7525 | −125 / −0,87 procentního bodu |
| 1° | 360 | 2528 | 7330 | −320 / −2,22 procentního bodu |

P3 zachovává 5° s obálkou přes celý sektor. Jemnější vzorky v těchto případech neospravedlnily dvojnásobný/pětinásobný raw payload; hlavní nejistotou je blízkost domu a jeho výška, nikoli jen azimutový krok. Oproti terénu se zástavba neinterpoluje mezi izolovanými bodovými paprsky. Přechod 355°→0° je testovaný a nesmaže úzkou překážku.

## Co je a není ověřováno

- Výška `exact` znamená explicitní OSM height; není to ověření skutečné výšky. Odhad z podlaží je označený.
- Výsledky jsou podmíněné lokální společnou rovinou, LoD1 hranoly, 1,5m cílem, dosahem 500 m a úplností OSM.
- Neznámá výška, neznámý chunk, krytá cesta či oblast mimo extrakt neznamenají dobré světlo.
- Kruh obálky může být široký u podlouhlého/členitého domu. Vyšší podíl neověřených výsledků je záměrně přiznaný kompromis, nikoli přesný ray tracing.
- Mosty/estakády a svahy nejsou přesný 3D výpočet. DEM je DSM a může již obsahovat vliv některých velkých staveb.
- Referenční místa se kontrolují proti skutečně publikovaným profilům. Nejde o měření fyzického stínu v terénu ani o ověřené realtime nasvícení.

## Reprodukce

```bash
pip install numpy==2.3.5 rasterio==1.5.2 shapely==2.1.2 osmium==4.3.1
npm test
python scripts/build_data.py --input /cesta/PID_GTFS.zip
node --expose-gc --max-old-space-size=6144 scripts/regression.mjs
python scripts/build_terrain.py
python scripts/build_buildings.py --source /cesta/czech-republic.osm.pbf
python scripts/build_buildings.py --source /cesta/czech-republic.osm.pbf # cache
python scripts/building_resolution.py
node scripts/benchmark_buildings.mjs
python scripts/finalize_data.py
```
