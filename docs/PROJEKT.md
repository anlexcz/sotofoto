# Šotofoto – technický přehled

Statická aplikace na GitHub Pages. Leaflet 1.9.4, vlastní Canvas tras, ES moduly, Web Worker. Bez backendu a runtime frameworku. README popisuje uživatelské chování; tento dokument datovou architekturu a její invarianty.

## P2: životní cyklus dat

1. `build_data.py` čte PID GTFS a vytváří globální číselné ID, sdílené hrany, patterny, kalendář a klasifikaci provozu. Monolitické soubory jsou pouze mezivýsledek pro kontrolu a terén.
2. `chunk_data.py` rozdělí síť do buněk 0,05°; buňky s více než 2 MB binárního jízdního řádu před kompresí rozdělí na čtyři buňky 0,025°. Velikost není fyzicky stejná v obou osách. Index nese skutečné bounds každého balíčku.
3. Hrana patří do všech buněk, které protíná její bounding box. Je to konzervativní výběr, včetně dlouhých hran a přesných hranic. Prázdné buňky se nevytvářejí.
4. Geometrie obsahuje globální ID hrany, její koncové souřadnice a místní segmenty shapes. Každý segment si uchovává původní pořadí i GTFS vzdálenosti. Jízdní řád obsahuje všechny relevantní patterny a spoje, ale jen potřebný rozsah zastávek a časů. Původní zastávkový offset umožňuje bezeztrátové spojení sousedních balíčků.
5. `regression.mjs` porovnává výsledky s enginem nad úplným mezivýsledkem. Potom vzniká terén; `finalize_data.py` odstraní monolity před uploadem Pages.

## Publikované soubory

| Soubor | Obsah | Kdy se načítá |
| --- | --- | --- |
| `meta.json` | Platnost, linky, módy, dopravci, denní/noční klasifikace, kalendář, cíle, asociace linek a dopravců | Start |
| `chunks.json` | Bounds, cesty, velikosti a malý linkový/dopravcovský index | Start |
| `chunks/*.geometry.json.gz` | Pouze místní hrany a části shapes | Výřez mapy nebo okolí bodu |
| `chunks/*.schedule.bin.gz` | Místní patterny, identita spojů a binární zastávkové časy | Stejná oblast, ve workeru |
| `terrain-index.json` | Bounds a cesty terénních balíčků | Focení nebo detail bodu |
| `terrain/*.json.gz` | Geografické klíče, profily obzoru a platnost | Potřebná oblast |

Názvy balíčků obsahují hash obsahu. Změna feedu nemůže zaměnit staré a nové balíčky v HTTP cache. Malé manifesty se revalidují. Nepoužívá se IndexedDB ani service worker. Staré hashe se v novém buildu nepublikují; rozpracované načítání přes okamžik deploye může skončit explicitní chybou a vyžaduje obnovení stránky.

## Formát jízdního řádu

Gzip obsahuje 4bajtovou little-endian délku JSON hlavičky, UTF-8 hlavičku zarovnanou mezerami na čtyři bajty a společný blok little-endian `uint32` časů v sekundách. Hlavička má vlastní `version: 1`, patterny s původním zastávkovým offsetem a tripy. Pole časů tripu je v hlavičce dvojice offset/délka. Decoder ověřuje verzi, zarovnání a rozsah a vytváří pohledy `Uint32Array` do jediného bufferu.

GTFS >24:00 se nekrátí modulo 24 hodin. Časy nejsou rozdíly ani sekundové bajty; rozsah `uint32` je dostatečný. Současné podporované prohlížeče běží na little-endian platformách. Geometrie a malé nenumerické seznamy zůstávají JSON. Binární časy snižují počet JS čísel a polí; nejsou kopírovány do hlavního vlákna. Při sloučení pro detail se vytváří jen místní číselný buffer. Nevzniká celý rozbalený JSON jízdního řádu PID.

## Klient a worker

HTML a mapový podklad se zobrazují bez čekání na GTFS. Po malých metadatech se aktivují filtry. Nový výchozí zoom 13 omezuje první požadovanou oblast; sdílený odkaz zachovává svůj vlastní zoom.

`ViewportEngine` vybírá balíčky pro výřez s 8% okrajem a aktivní linkové/dopravcovské filtry. Zpracovává je postupně, nikoliv jedním enginem nad celým výřezem. Pro výpočet četnosti nevytváří bodový prostorový index. Iterace relevantních spojů je generátor. Stejná hrana z překryvu se zapíše pouze jednou: všechny její patterny jsou v každém dotčeném balíčku, takže se počty ze sousedních balíčků **nesčítají**. Identita spoj/posun dne deduplikuje počet jízd ve výřezu.

Výsledky každého balíčku se cachují podle balíčku a kompletního filtru. Pan/zoom v již vypočtených balíčcích nepočítá jízdní řád znovu. Změna filtru přepočítá potřebné balíčky. Čas světla, vzhled a zoomová tloušťka výpočet provozu nemění. Novější požadavek zruší starší mezi balíčky; opozděná odpověď se nezobrazí.

Do UI jdou jen koncové body/hrany aktuální oblasti, četnosti a malé seznamy pro barvy/popisky. Číselné výsledky používají Transferable ArrayBuffer. UI nedrží shapes ani trips. Canvas kreslí pouze hrany protínající viewport; nejsou vytvářeny Leaflet polylines pro celou síť. Popisky zůstávají omezené na 45. Detail/highlight má samostatné malé Leaflet objekty.

Detail bodu vybírá všechny balíčky dotýkající se poloměru, nezávisle na výřezu mapy. Sloučení používá globální ID hran/patternů/tripů a původní pořadí segmentů. Sousední segmenty deduplikuje, pozdější návrat smyčkou zachovává. UI dostane přímo souřadnice zvýraznění; místní ID detailu se nezamění s ID mapy.

## Cache a paměť

- Datová LRU: nejvýše 8 balíčků / 4 MiB podle dekomprimovaných bajtů.
- LRU výsledků: nejvýše 24 položek / 8 MiB odhadu, včetně identit jízd a příspěvků linek.
- Terénní LRU: nejvýše 16 balíčků / 4 MiB dekomprimovaných bajtů.
- Stejný rozpracovaný požadavek sdílí Promise; chyba se necachuje a umožňuje opakování.
- Browser HTTP cache poskytuje další úroveň po vyhození z RAM.

Limity nejsou tvrdý strop skutečné JS RAM: objekty, právě zpracovávaný balíček, aktuální výsledek a dočasné dekódování potřebují paměť navíc. Široký výřez vyžaduje více přenosu a více viditelné geometrie, ale jízdní řád se i tehdy zpracovává postupně. Není přednačítání sousedních oblastí mimo 8% okraj. Stav načítání a chyby jsou explicitní; chybějící balíček se nevydává za nulový provoz. CSV je při načítání detailu zakázané. Neúspěšný požadavek nepublikuje částečnou mapovou agregaci.

## Terén oddělený od feedu

`.cache/terrain-v1.json` ukládá výsledky podle dvojice zaokrouhlených geografických indexů v buňce 0,002° × 0,004°. Klíč neobsahuje ID hrany ani feedu. Nový GTFS určí potřebné středy buněk; známé profily pouze převezme. DEM a horizonty se počítají jen pro chybějící klíče. Změna modelu, rozlišení, poloměru, výšky nebo algoritmu vyžaduje novou verzi cache.

Actions zachovává profily přes `actions/cache` s unikátním klíčem běhu a společným prefixem. Chybějící cache může způsobit celý výpočet, nikoliv chybný výsledek. Neplatný DEM profil se označí jako neověřený. Původní rasterové dlaždice mají navíc místní cache `/tmp/sotofoto-dem`; není to klientská cache.

Na klientu běžná mapa terén nestahuje. Detail bodu načítá okolí bodu; focení výřez a případný vybraný bod. Profily potřebné pro současný výřez se drží samostatně; chybějící buňka zůstává neověřená. Posuvník jen porovnává sluneční výšku s uloženým profilem. Počasí zachovává dosavadní geografické cache, debounce a nejvýše 64 vzorků aktuálního výřezu; slider pouze přepočítá dostupné hodinové hodnoty. Výpadek počasí/terénu neblokuje GTFS.

## Invarianty a testy

Optimalizace nemění občanský den Praha, předchozí/následující GTFS service day, interval `[od,do)`, časy >24:00, denní/noční klasifikaci, směry, linky, dopravce ani módy. Pravidelnost zůstává explicitní podle PID stop-time flagu. Typy 7/8/9/10 a další zůstávají dostupné, do pravidelné četnosti přispívá jen typ 1. Celodenní denní četnost má základ 19 hodin; noční celodenní provoz jednotnou nejtenčí kategorii. Žádný optimalizační filtr nemazá vzácné spoje.

`npm test` zahrnuje encoder/decoder, hranice, dlouhou hranu, společné úseky, překryv bez duplicit, smyčku, lazy cache, cache hit/eviction/retry, zrušení požadavku, půlnoc, noční a speciální provoz i geografickou terénní cache bez DEM požadavků. Produkční `regression.mjs` ověřuje sedm oblastí ve více filtrech proti úplnému datasetu: počty, směry, kategorie, pravidelné počty, barvy a všechny atributy detailu kromě interních ID.

## Stav P2

Výkonová a datová část P2 je dokončená a nasazená. Závěrečné ověření zahrnuje úspěšné načtení počasí v detailu i mapové vrstvě na produkci. Uživatel předal jeden případ mobilu, kde původní verze padala a nová funguje; nejde o plošný benchmark telefonů. Podrobnosti a limity ověření jsou v [měření P2](P2-MERENI.md).

Tlačítka −5 / +5 minut a odkaz na bod v Mapy.com jsou po dohodě odložené samostatné úpravy UI, nikoli zbývající podmínky P2.

## Další práce

P3 může přidat budovy a místní stínění jako samostatné geografické balíčky s vlastním manifestem, verzí a limitem cache. Rozhraní `profileAt` a oddělení provozního filtru od času světla nevyžadují přestavbu GTFS. Budovy nejsou v P2 implementované. P4/P5 zůstávají odložené.
