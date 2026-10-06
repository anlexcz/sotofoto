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

P3 implementuje samostatné geografické balíčky zástavby, popsané níže. Stav funkčního ověření a publikace je v `P3-MERENI.md`. P4/P5 zůstávají odložené.

## P3: samostatná geografická zástavba

Zdroj je OSM PBF celé ČR z Geofabrik; klient nemá API klíč, backend ani polygony. Licence odvozené databáze je ODbL 1.0. PBF a polygon pokrytí, URL snapshotu a SHA-256 se uchovávají v Actions cache `.cache/buildings`; aktualizace snapshotu je explicitní ruční volba workflow. GTFS určuje pouze požadované geografické klíče v okolí tras. Změna jeho ID nikdy není součástí klíče profilu.

`build_buildings.py` skládá OSM areas včetně multipolygonů/děr pomocí libosmium. Budovy, části a kryté/tunelové dopravní cesty a mosty přiřazuje do příslušných geografických oblastí. Budovy mají **500m halo + rezervu geografické buňky**, takže překážka za hranicí chunku zůstává zahrnuta. ID objektu deduplikuje kopie uvnitř dlaždice. Obálky se kombinují maximem, nikoli součtem výšek. Nepopsaný outline s popsanými částmi zůstává konzervativně nejistý: nelze předpokládat, že části popisují celou budovu.

Každému půdorysu přiřadí vnější obsahující kruh a vnitřní vepsaný kruh, respektující díry. Z nich build-only C++ kernel přes ctypes/NumPy buffery počítá horní/dolní obálku. Stejné výsledky ověřuje nezávislá NumPy implementace; kernel není součástí klienta. Jeho SHA-256 je součástí verze profilové cache. Překlad `g++` je pouze build závislost. Vnější kruh se rozšiřuje, vnitřní zmenšuje o poloměr geografické buňky. V obálce se hodnotí celý 5° azimutový sektor; ne pouze tenký paprsek v jeho středu. Proto se zástavba na klientu **lineárně neinterpoluje**: interpolace bodových vzorků může úzký dům úplně vynechat. Terén nadále používá dosavadní kruhovou lineární interpolaci. Jemnější sektor 2,5°/1° byl porovnán samostatným skriptem `building_resolution.py`; výsledky v měření P3.

Výškový model: `height` obsahuje střechu (nepřičítá se znovu); interní `exact` znamená výslovně popsanou hodnotu, nikoliv ověřené měření. `source:height` obsahující odhad snižuje kvalitu. Podlaží × 3 m + známá výška/podlaží střechy je `estimated`. Neznámá výška je azimutová maska `unknown`, bez libovolného modelového domu. Vyvýšené části `min_height`, roof-only přístřešky, covered/tunnel/bridge jsou nejisté, protože horní obzor neumí světlo pod převisem ani výšku mostu. Dopravní struktury jsou rozdělené do maximálně 10m dílků s místním 6m koridorem; jejich dotyk s buňkou nastaví místní 3D nejistotu, nikoli stín v okolních azimutech. Tunel tedy nezastiňuje okolní ulice jako vysoká budova.

Výpočet používá společnou horizontální místní rovinu, pozorovací výšku 1,5 m a LoD1 hranoly. Nezískává geodetické nadmořské výšky základů domů; mosty, náspy a svahy nemají přesný vertikální model. Souřadnice jsou pro tyto lokální kruhy škálované metricky při 50° s. š.; nejde o přesný 3D model. Zdroje DEM a budov se neslučují do jedné databáze. Copernicus je DSM, takže sám může obsahovat vliv některých velkých staveb. P3 nepřidává vegetaci. Budoucí možnost: DMP 1G + DMR a footprinty ČÚZK, případně pražský 3D model; nejprve ověřit strojovou distribuci, datum a oddělení stromů.

### Cache a publikace

Zdrojové dlaždice jsou cacheované podle SHA-256 PBF a verze parseru (v4). Každá má lokální obsahový fingerprint. Profilová cache je oddělená podle hashe modelu (algoritmus, zdroj, buňka, dosah, výška bodu, podlaží, azimut, metrická projekce). Uvnitř jsou stabilní celočíselné geografické klíče. Již známé profily daného fingerprintu se znovu nepočítají; doplní se pouze chybějící. Změna snapshotu nezneplatní profily oblastí se shodným zdrojovým obsahem.

Publikace: `building-index.json` (klient načítá komprimovaný `building-index.json.gz`) s hlavním přehledem, podindexem `detail`, datovou/verzovací/licenční informací, bounds a stavy `profiles` / `empty` / `unknown`; `building-horizon/map_y_x.hash.bin.gz` / `detail_y_x.hash.bin.gz`. Prázdná oblast má pouze záznam manifestu, žádný nulový chunk. Mimo polygon zdrojového extraktu včetně halo je výsledek neověřený. Selhání geometrie zneplatní příslušné oblasti, neodstraní problémové objekty bez upozornění.

Binární formát `SFB1`: čtyři ASCII bajty magic + little-endian uint32 počet. Záznam má 512 bajtů: int32 geografické y/x, 72×uint16 dolní obzor popsaných výšek, 72×uint16 dolní obzor odhadů, 72×uint16 horní obzor, 72×uint8 maska nejisté výšky (bit 1), odhadnuté výšky (bit 2) a místní 3D struktury (bit 4). Úhly jsou v desetinách stupně. Decoder ověří délku, duplicity a rozsah; typed-array pohledy drží společný buffer, nikoli tisíce JS číselných polí.

`BuildingLoader` načítá společný manifest až při focení/detailu. Přehledová buňka je 0,00025° × 0,0004° (~28 × 29 m); městský detail 0,0001° × 0,00015° (~11 × 11 m). Jemný profil se publikuje jen při alespoň 800 komponentách budov v halo dlaždice nebo známém/odhadnutém domě alespoň 25 m. Mapová LRU má 16 položek / 2 MiB; detailní 4 položky / 1 MiB. Aktivní přehled a detail mají každý limit 4 MiB. Jemné chunky se načítají pouze kolem vybraného bodu, nikoli pro celý viewport. Detail při absenci jemné vrstvy použije platný konzervativnější přehledový profil a uvede jeho rozlišení. V příliš širokém výřezu se vynechané oblasti označují neověřeně; chybějící chunk není nulové stínění. Chyba se necachuje, další aktualizace může požadavek zopakovat. Generation token brání přepsání novější oblasti starší odpovědí. Slider nemění výběr chunků, nevolá loader ani worker.

### Evidence přímého Slunce

`directSun` zachová astronomický, terénní a building stav zvlášť. Astronomická noc má přednost. Prokázaná modelová překážka stačí pro NE i při chybějícím druhém zdroji; jinak je bez obou ověřených zdrojů výsledek NEOVĚŘENO. Průjezdy zůstávají dostupné a exportovatelné; jen nemají skóre dobrého nasvícení. Nejde o nový provozní filtr. Neověřené nasvícení má modrošedou barvu a vysvětlení v legendě, prokázaný modelový stín šedou. Čelo/bok/zezadu zachovávají původní azimutovou logiku. Počasí je stále samostatná předpověď.

### Actions a cena prvního buildu

PR spouští kompletní unit/integration suite a produkční GTFS regresi. Reálné sestavení statického prostředí je ověřeno lokálně a produkčním jobem na `main`; PR nepřepočítává celostátní OSM při každém review commitu. Produkce nejprve připraví geografickou source cache (`--extract-only`) a ihned ji uloží pod fingerprintem snapshotu/pokrytí. Teprve potom počítá profily. Výpadek pozdějšího kroku proto neztratí drahý průchod zdrojem. Obyčejná změna README se známým snapshotem/buňkami přebírá zdroj i profily z cache. Actions cache může po době neaktivity či překročení úložného limitu zmizet; pak je nutný nový cold build, nikoli falešná data.
