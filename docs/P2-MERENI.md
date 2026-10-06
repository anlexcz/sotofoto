# P2 – měření a ověření

Feed PID stažený 6. 10. 2026, 87 279 tripů, 7 956 patternů, 160 703 bodů a 171 527 hran. Referenční původní commit `30d7688`. Výsledky jsou měření konkrétního prostředí, nikoli garance výkonu všech telefonů.

## Bottleneck

Původní klient rozbaloval celou geometrii (64,1 MB) a celý jízdní řád (30,0 MB), vytvářel globální odvozené indexy a počítal všechny hrany. První přenos GTFS měl 22,63 MB včetně metadata. Kopie celé geometrie následně putovala do UI. Canvas již existoval; migrace rendereru nepřinesla důvod k implementaci.

## Před / po

| Metrika | Před | Po P2 |
| --- | ---: | ---: |
| GTFS potřebné k aktivaci filtrů | celý dataset, 22,63 MB | metadata + index, 0.69 MB |
| Přenos pro referenční oblast 50,06–50,10 / 14,39–14,49 | 22.63 MB | 5.21 MB |
| Dekomprimované bajty téže oblasti včetně manifestů | 94.39 MB | 25.62 MB, postupně |
| Peak RSS izolovaného Node procesu | 1553 MiB | 371 MiB |
| Node: načtení z disku, decode, výpočet a sestavení výsledku | 5.62 s | 1.26 s |
| Node: inicializace | 599 ms, globální Engine | 0.10 ms, správce; místní enginy jsou v následujícím řádku |
| Node: první výpočet | 3043 ms po načtení | 1234 ms včetně načtení/decode místních balíčků |
| Geometrické hrany držené pro referenční výsledek | 171 527 | 6,398 |
| Structured clone geometrie v Node | 182.3 ms | 3.2 ms |
| Nové DEM profily při druhém identickém buildu | dříve celý výpočet | 0; 47 077 převzato z cache |

Node RSS zahrnuje celý proces, buffery, JS objekty i GC. **Není to změřená RAM mobilu ani součet browser/worker heapu.** Před měřením původní varianty se četl celý monolit; nová varianta používá skutečný postupný `ViewportEngine`. Čas čtení disku není čas downloadu přes internet. První výpočet má po P2 jinou hranici měření; výsledky se nesmějí interpretovat jako pouhá rychlost metody `Engine.counts`.

Prohlížeč: Chromium 153, místní HTTP server, studené kontexty. Mobilní viewport 390 × 844 px, čtyřnásobné zpomalení hlavního vlákna pomocí CDP; nejde o fyzický slabý telefon. Obě verze mají pro srovnání zoom 13 a stejný střed.

| Prohlížečová metrika | Před | Po P2 |
| --- | ---: | ---: |
| Mobil: zpráva workeru ready | 3.24 s | 0.66 s |
| Mobil: první kompletní četnost mapy | 8.88 s | 2.99 s |
| Mobil: počáteční GTFS payload | 22,63 MB | 5.39 MB |
| Desktop: první kompletní četnost po P2 | — | 2.83 s |
| Desktop: počáteční GTFS payload po P2 | — | 8.12 MB |
| Mobil: geometrické hrany v UI po P2 | celá síť | 6,930 |
| Nové datové / weather požadavky při pohybu světelného slideru | — | 0 / 0 |

UI používá jeden Canvas tras, nikoliv jednotlivé Leaflet vrstvy všech hran. Z uvedených hran kreslí pouze průnik s viewportem. Baseline prohlížečového testu neměla skutečný původní terénní soubor; jeho další přenos ani RAM nejsou v předchozích číslech zahrnuté. OSM dlaždice a Open-Meteo měly v testovacím prostředí síťové výpadky. Ověřeno bylo korektní hlášení nedostupnosti; úspěšný živý forecast nelze z těchto testů tvrdit.

## Balíčky a serverový dataset

Vzniklo 1027 obsazených buněk; z toho 20 jemných městských buněk. Dva soubory na dopravní buňku. Terén má oddělené prostorové balíčky. Režie serverového datasetu je přijatelná výměnou za menší potřebu konkrétního zařízení.

| Gzip velikost | Geometrie | Jízdní řád |
| --- | ---: | ---: |
| Medián | 10.2 kB | 3.4 kB |
| P95 | 58.1 kB | 34.2 kB |
| Maximum | 228.5 kB | 438.9 kB |
| Celá sada | 18.03 MB | 12.24 MB |

Celá publikovaná datová sada včetně metadat, indexů a terénu: **33.76 MB**. Původní dva GTFS monolity plus srovnatelný terén představují přibližně 25,03 MB. Nový dataset má duplicity lokálních spojů, ale klient je načítá podle potřeby. Žádný jednotlivý dopravní balíček neobsahuje půl PID geometrie. Široký desktopový výřez může načíst podstatně víc než detail na mobilu.

## JSON versus binární časy

Stejný největší schedule balíček, bez dekomprese, medián pěti dekódování:

| Formát | Gzip | Rozbaleno | Decode |
| --- | ---: | ---: | ---: |
| JSON s časy jako číselnými poli | 517.9 kB | 2.80 MB | 16.3 ms |
| JSON hlavička + společný uint32 blok | 438.9 kB | 2.44 MB | 18.9 ms |

Binární varianta zde **není rychlejší v samotném decode**. Je menší při přenosu a uchovává 274,238 časových hodnot v jednom 4bajtovém bloku bez parsování jejich textové podoby a samostatných JS čísel. Rozhodnutí je kvůli RAM a přenosu; decoder má několik řádků a žádnou runtime knihovnu. Geometrie zůstává JSON.

## Kontroly

- 54 unit/integration testů úspěšných.
- Produkční regresní porovnání sedmi oblastí × šesti filtrů: centrum, okraj, příměstský koridor, železnice, řídký provoz, vozovna a noc. Shodné počty, četnost, směry, barvy a atributy průjezdů; interní místní ID se záměrně liší.
- Desktop a úzký mobil: první otevření, pan a návrat, provozní filtry, ruční interval přes půlnoc, detail s průjezdy, CSV, focení/terén, posuvník bez síťových dotazů a obnovení share URL. Bez JS page errors.
- Production GTFS build úspěšný. První terénní build vytvořil profily, opakovaný použil cache bez DEM požadavků.
- Mapy.com tlačítko nebylo přidáno: zadání jej podmiňuje již ověřenou stabilní rešerší; toto P2 řeší výkon. Přesné stíny budov patří do P3.

## Reprodukce

```bash
npm test
python scripts/build_data.py --input /cesta/PID_GTFS.zip
node scripts/benchmark.mjs legacy
node scripts/benchmark.mjs chunks
node scripts/format-benchmark.mjs
node --expose-gc --max-old-space-size=6144 scripts/regression.mjs
python scripts/build_terrain.py
python scripts/build_terrain.py # bez chybějících buněk: computed 0
python scripts/finalize_data.py
```

Surová měření jsou ve `p2-*-metrics.json` a `p2-browser-before.json`. Prohlížečové běhy používaly Playwright jako externí testovací nástroj; projekt nemá novou runtime závislost.

## Stav publikace

Implementace a místní validace jsou připravené pro review. Automatická kontrola odmítla přímou aktualizaci `main`; produkce zatím zůstává na původní verzi. Pull request spouští build a regresní kontrolu bez deploye; publikace je vyhrazena větvi `main`.
