# P3 – zástavba: měření a ověření

Měřeno 6. 10. 2026 na produkčním PID datasetu a OSM snapshotu 2026-10-04T20:20:21Z. Surové výsledky a 24 referenčních vyhodnocení osmi charakteristických míst jsou v [P3-data-metrics.json](P3-data-metrics.json). Nejde o ověření fyzických stínů v terénu.

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

## Produkční data a build

- PBF SHA256: `6acf8e569216faa75526c4f7a834cf667c1eab732cba8605b49fed98cf3ebaf7`.
- Prostorově relevantních komponent včetně lokálních struktur: 1 583 024; explicitní výška 5 215, odhad 722 691, neznámá 855 118. To nejsou počty unikátních domů.
- 972 902 mapových profilů (~28×29 m) a 1 187 979 jemných profilů (~11×11 m); jemná vrstva pouze husté/vysoké zástavby. 3 272 prázdných oblastí jsou jen v manifestu.
- 14 833 chunků, dohromady 51 938 756 B gzip; medián 1 357 B, p95 16 132 B, maximum 98 691 B. Komprimovaný manifest 481 680 B.
- První výpočet profilů 262,039 s, 2 160 881 nových profilů, peak RSS Python buildu 1 525 808 KiB. Samostatná studená extrakce půdorysů trvala 1 029 s (cca 4,82 GB peak RSS); download není zahrnut. Přechod vývojové cache v3→v4 znovu načetl pouze strukturální ways.
- Node referenční viewport 50,06–50,10 / 14,39–14,49: 29 lokálních chunků, 153 392 B gzip + manifest; aktivní dekódované buffery 4 180 200 B, načtení 56,81 ms, dekódování 32,46 ms. 100 000 vyhodnocení 18,79 ms. Jde o Node a lokální disk, nikoli mobilní síť.
- Mapová cache 2 MiB + nejvýše 4 MiB aktivních bufferů; detailní cache 1 MiB + 4 MiB aktivních bufferů. Při překročení limitu se oblast označí neověřená.

Referenční body zahrnují Belárii, městskou ulici, vysoký dům, bloky, most, terén, svah s městem a autobus v Liblicích. Každý má souřadnice přichycené k aktuální trase, čas Europe/Prague, astronomickou polohu, oba horizonty a výsledný stav. Neznámé výšky jsou v této sadě časté; to je vlastnost zdroje, nikoli automaticky potvrzené světlo. Ortofoto/3D sanity check nebyl proveden.

Opakovaný build: 55,292 s, **0 nových výpočtů**, všech 2 160 881 profilů z cache, identických 51 938 756 B gzip.

Testy: 66/66 Node testů a Python building suite; GTFS regrese sedmi oblastí × šesti filtrů prošla. Cache, hranice, poškozené chunky/retry, chybějící data, lokální struktury a nativní/NumPy shoda jsou testované.

## Prohlížeč / mobil

Chrome headless 151.0.7922.34, viewport 390×844 a 1440×900, CPU throttling 4×, lokální HTTP bez síťového throttlingu. [Surové výsledky](P3-browser-metrics.json). Historická reference P2 používala Chrome 153 a jiný testovací průběh; absolutní časy se nesmějí porovnávat jako identická síť/zařízení.

Mobil P3: worker ready 0,390 s, první četnost 1,596 s; počáteční data 5 394 455 B, **0 building requestů**. Zapnutí focení: 31 building requestů, 627 492 B (včetně 481 680 B manifestu). Detail bodu přidal 45 930 B. Desktop: 627 685 B při focení, 23 612 B detail.

30 pohybů slideru: **0 building, DEM, GTFS a weather requestů**, žádná nová counts zpráva workeru. CSV 18 570 B na mobilu; share URL obnovila režim focení; žádná JS pageerror. Úzký mobilní detail byl vizuálně zkontrolován, nasvícení a podrobnosti jsou sbalené, průjezdy zůstávají dostupné. Weather v této lokální automatizaci nebylo dostupné; jeho API funkčnost není tímto měřením potvrzena.

UI JavaScript heap: mobil před focením 12,01 MB, po detailu 29,60 MB, nejvyšší vzorek během scénáře 35,86 MB (vzorkování 250 ms). Nejde o fyzickou peak RAM telefonu ani heap GTFS workeru. Node měření celého procesu mělo RSS 93,01 MB; to také není mobilní RAM. Změny heapu zahrnují detail, DOM, mapu a GC, nikoli pouze building buffery. Jejich velikosti a limity jsou uvedené samostatně výše.

Stejným skriptem byl znovu změřen původní P2 commit `8e05d74` ([výsledky](P2-browser-P3-comparison.json)): mobil worker 0,520 s / první četnost 1,887 s proti P3 0,390 / 1,596 s, identický počáteční payload 5 394 455 B. Jedna opakovaná studená relace není statistický benchmark; neukazuje regresi startu. UI heap před focením P2 11,98 MB / P3 12,01 MB. Nejvyšší UI heap scénáře P2 31,01 MB / P3 35,86 MB.

Slider mobil: medián P2 125,35 ms / P3 134,75 ms, p95 P2 163,40 / P3 164,70 ms. Desktop medián P2 307,10 / P3 297,05 ms. Čas zahrnuje dvě requestAnimationFrame a kompletní vykreslení mapy při CPU 4×; není to čistý čas matematického stínění. Samotných 100 000 porovnání v Node trvalo 18,79 ms.

## Publikace

Implementace a benchmark jsou v [PR #2](https://github.com/anlexcz/sotofoto/pull/2). PR Actions ověřují testy a GTFS regresi. Produkční Actions na main sestavují skutečný statický zdroj/profily před Pages deployem; konečný stav běhu a živé stránky se ověřuje při nasazení. Tento dokument nedeklaruje fyzickou přesnost modelu ani dokončený deploy před úspěšným produkčním během.
