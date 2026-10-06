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
| `chunks.json.gz` (fallback `chunks.json`) | Bounds, cesty, velikosti a malý linkový/dopravcovský index | Start |
| `chunks/*.geometry.json.gz` | Pouze místní hrany a části shapes | Výřez mapy nebo okolí bodu |
| `chunks/*.{overview,medium,detail}.json.gz` | Kreslicí LODy, statické identity a původní ID hran | Výřez mapy, pouze právě zvolená úroveň |
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

Do UI jdou aktivní kreslicí body/hrany aktuální oblasti, četnosti, identity pro barvy/popisky a kompaktní původní sluneční vzorky. Předběžný výsledek před potvrzením provozu je výslovně označený. Číselné výsledky používají Transferable ArrayBuffer. UI nedrží shapes ani trips. Canvas kreslí pouze hrany protínající viewport; nejsou vytvářeny Leaflet polylines pro celou síť. Popisky zůstávají omezené na 45. Detail/highlight má samostatné malé Leaflet objekty.

Detail bodu vybírá všechny balíčky dotýkající se poloměru, nezávisle na výřezu mapy. Sloučení používá globální ID hran/patternů/tripů a původní pořadí segmentů. Sousední segmenty deduplikuje, pozdější návrat smyčkou zachovává. UI dostane přímo souřadnice zvýraznění; místní ID detailu se nezamění s ID mapy.

## Cache a paměť

- Kreslicí LRU: nejvýše 16 balíčků / 4 MiB dekomprimovaných bajtů (blok 2).
- Datová LRU: nejvýše 8 balíčků / 4 MiB podle dekomprimovaných bajtů.
- LRU výsledků: nejvýše 24 položek / 8 MiB odhadu, včetně identit jízd a příspěvků linek.
- Terénní LRU: nejvýše 16 balíčků / 4 MiB dekomprimovaných bajtů.
- Stejný rozpracovaný požadavek sdílí Promise; chyba se necachuje a umožňuje opakování.
- Browser HTTP cache poskytuje další úroveň po vyhození z RAM. Hashované geometry/schedule/render/terrain gzip soubory používají `force-cache`, takže i po vypršení Pages `max-age=600` mohou využít uloženou odpověď bez revalidace. Nehashované soubory používají `no-cache`. `meta.json`, `chunks.json.gz` (i fallback JSON) a `terrain-index.json` se revalidují při inicializaci, nikoli při každém pohybu. HTTP cache spravuje browser a může ji vyprázdnit; nejde o garantované offline úložiště.
- Zrušení viewportu invaliduje výsledek, ne síťový přenos ani úspěšně uložený chunk. LRU a pending Promise jsou oddělené. Změna zoomu vybírá jiný render hash; geometrie a schedule nemají zoom v klíči. Čas světla nevolá workerový provoz.
- Je-li celý výřez v cache výsledků, neposílají se částečné statické náhledy. Potvrzený canvas zůstává do přijetí výsledku. Při překročení LRU může stejný viewport znovu vyvolat fetch/dekompresi; samo o sobě to není nový síťový přenos.

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

Tlačítka −5 / +5 minut a odkaz na bod v Mapy.com jsou nyní realizované v samostatném bloku 1; nebyly podmínkou dokončení P2.

## Další práce

P3 bylo 6. 10. 2026 na žádost uživatele odstraněno a projekt vrácen ke stavu P2 (commit `8e05d74`). Neověřená zástavba a limity načítání potlačovaly barvy směru světla, takže mapový přehled nebyl prakticky použitelný. Kód, build, testy a reporty P3 jsou odstraněné; historie zůstává v Gitu. Slunce, terén, počasí a optimalizace P1/P2 zůstávají. P3 nyní není implementované; případný nový návrh vyžaduje samostatné zadání. P4/P5 zůstávají odložené.

## Dohodnuté úkoly – 6. 10. 2026

### U1: Metro ve focení a v detailu bodu — dokončeno v bloku 1

- Metro má stav `unrated`, neutrální šedou a text „Metro — nasvícení se nehodnotí“. `passageLight` vůbec nevolá výpočet Slunce ani profil terénu pro metro. Průjezdy, počty, hodiny a CSV se zachovávají; CSV má prázdné údaje Slunce.
- `Engine.passages` již nepoužívá přednost povrchu před metrem. Filtry, deduplikace, směry a půlnoc se nemění.
- Worker vedle původních počtů vrací `surfaceForward` / `surfaceBackward` ve stejném průchodu po aktivních spojích. P2 přenáší dvě další Uint32 pole a přebírá je beze sčítání překryvů chunků. Focení na smíšené hraně hodnotí pouze přítomné povrchové směry; metro v opačném směru nemůže vyhrát jako „lepší“ světlo. Tloušťka a ostatní barevné režimy dál používají původní počty.
- `photoWindows` i ranní/polední/odpolední poměry vyřazují nehodnocené metro z čitatele i jmenovatele. Hodinový graf zachovává celkový počet a počet vhodných povrchových průjezdů.

### Blok 1: ovládání, sdílení a podklad — implementováno

- Světlo na mapě i v rozbaleném počasí: tlačítka −5 / +5 minut, dva nativní selecty (hodina / minuty po pěti) a samostatné přesné časové pole po minutě. Přesná minuta mimo pětiminutové kroky zůstává viditelná ve výběru. Cíle nejméně 44 px, klávesnice a popisky. Tlačítka omezují den na 00:00–23:59; slider zachovává rozšíření sluneční osy. Změna volá jen `setLightTime`, překreslení uloženého počasí a tras; neposílá workeru nové počty ani nenačítá GTFS/terén/počasí.
- `share.js`: verzovaný query hash `#v=2&kind=place...` pro místo; poloha, zoom, stabilní ID linek/dopravců a další aktivní provozní filtry. Výchozí den je dnešek v Praze v platnosti feedu, jinak začátek feedu; celý den, výchozí světlo a vzhled. Automatická URL je odkaz na místo. Tlačítko „Odkaz na plán“ přidá datum, časový interval (včetně přechodu přes půlnoc), režim seznamu a nezávislý čas světla. Žádná nová varianta neukládá vizuální volby. Tlačítka zobrazí URL pro ruční kopírování i při nedostupné clipboard API. Legacy JSON hash se dál čte včetně starého časového významu.
- Mapy.com: ikona mapy hned napravo od souřadnic v hlavičce detailu (dotykový cíl 44 × 44 px, tooltip a přístupný název „Otevřít v Mapy.com“); nahrazuje původní samostatný textový odkaz nad průjezdy. Kliknutí na odkaz nezahajuje tažení panelu. Obyčejný externí odkaz `/fnc/v1/showmap?center=lon,lat&zoom=16&marker=true`, `noopener noreferrer`. [Oficiální dokumentace](https://developer.mapy.com/further-uses-of-mapycz/mapy-cz-url/) potvrzuje web/mobil, značku i použití bez API klíče. Desktopové otevření bylo ověřeno se správným bodem; předání do nativní mobilní aplikace není přímo ověřené. Panorama není implementovaná.
- Jediná nová bílá vrstva 16 %: Leaflet pane `basemap-veil` (250), nad dlaždicemi (200), pod počasím (350), trasami/zvýrazněním (400) a značkami (600). Pane i výplň mají `pointer-events:none`. Nepřidává ovládací panel.
- Testy: 65 unit testů, včetně metra na společné hraně, obou směrů, výhradního/vypnutého filtru, doporučení, CSV, hranic světelného času a nových/legacy odkazů. Produkční regrese navíc porovnává obě nová směrová pole proti úplnému datasetu.
- Stav publikování: kód `4b848a1ae2d617c6f7e2be1b23bf062a3c855d47` je nasazený. [Standardní workflow 37514870622](https://github.com/anlexcz/sotofoto/actions/runs/37514870622) dokončilo build i deploy úspěšně; unit testy, produkční regrese, terén a finalizace prošly. Živý web byl následně ověřen v Chrome na desktopu (viewport 1363 × 936).

#### Závěrečné ověření bloku 1

- `npm test`: 65/65 úspěšných testů lokálně; stejná sada prošla v Actions. Regrese nad čerstvým GTFS porovnala sedm oblastí v osmi filtrech (56 kombinací), včetně metra, kombinace tramvaj/metro/bus, noci a okna 23:00–26:00. Nová směrová pole, původní počty/kategorie i atributy průjezdů souhlasí mezi úplným a chunkovaným enginem.
- Živý bod Náměstí Míru `50.0752, 14.4377`, den 7. 10. 2026: společný výběr tramvaj/metro/bus 2 112 průjezdů; vypnuté metro 1 592; samotné metro 520 v obou směrech, výslovně nehodnocené světlo a žádné doporučené okno, poměry 0/0 povrchových průjezdů.
- Skutečně stažený CSV export samotného metra: 520 řádků, linka A, všechny sluneční sloupce prázdné a světlo „Metro — nasvícení se nehodnotí“.
- Čas světla: přesně zadaných 13:17 → klávesnicí +5 na 13:22; nabídka hodiny/minut a slider fungovaly; 23:58 +5 → 23:59, 00:01 −5 → 00:00, s odpovídajícím rozšířením osy a zakázaným tlačítkem na hranici. Datum 7. 10., filtr mapy 08:00–10:00 a seznam 2 112 průjezdů zůstaly stejné. Tlačítko v detailu počasí synchronizovalo oba časové ovladače. Test skutečných JS handlerů potvrzuje nulové volání workerových počtů a načítání GTFS/terénu/počasí při změně světla; přímé síťové trasování není dostupné v použitém browser nástroji.
- Legacy JSON plán zachoval datum, 08:00–10:00, přesný čas světla, polohu, zoom i dříve sdílený vzhled; přebytečný parametr jej nepoškodil. Nový plán s linkou A a DPP zachoval datum 7. 10., 08:00–10:00 a světlo 13:30, ale použil výchozí barvy a tloušťku 1. Nové místo obnovilo stejný bod/zoom/linku/dopravce a otevřelo dnešek 6. 10., celý den a výchozí vzhled bez zapnutí focení.
- Skutečný odkaz z detailu otevřel v Mapy.com bod `50.0752000N, 14.4377000E` se značkou. Oficiální formát bez klíče je ověřený na desktopu; předání do mobilní aplikace není přímo otestované.
- V živém DOM byla jediná bílá vrstva, `pointer-events:none`, pořadí dlaždice 200 / zastření 250 / počasí 350 / trasy 400 / značky 600. Po posunu klávesnicí a zoomu přesně kryla mapový viewport, mapa reagovala a ulice i trasy zůstaly čitelné. Legenda obsahuje samostatné nehodnocené metro. Nové viditelné ovladače mají výšku 44 px.
- Limit mobilního ověření: dostupný cloudový prohlížeč neposkytuje řízení mobilního viewportu a nepovoluje otevření lokálního testovacího HTML. Mobilní layout, nativní časový picker, dotykové ovládání a přechod do aplikace Mapy.com proto nebyly přímo ověřené. Implementace používá stejná nativní tlačítka/selecty na mobilu a desktopu, ale nejde o náhradu testu na telefonu.

### O1: Více úrovní podrobnosti geometrie podle zoomu — implementováno v bloku 2

- Navrhnout a změřit alespoň tři úrovně: hrubý oddálený přehled, střední detail a nejpřesnější blízký pohled. Jde o linie tras, nikoli plošné polygony.
- Prahy zoomu a toleranci v metrech/pixelech stanovit podle měření, ne libovolnými čísly. Zahrnout mobil, široký výřez, pan/zoom a změnu času světla; porovnat počet kreslených segmentů, přenos, čas vykreslení a paměť.
- Zjednodušení pokud možno předpočítat při buildu a publikovat prostorově po chunkech. Zvolit, zda více úrovní geometrie skutečně ušetří i přenos, místo stažení všech variant najednou.
- Oddělit vykreslovací geometrii od přesné geometrie detailu a interpolace průjezdů. Zachovat křižovatky, společné úseky, hranice klasifikace provozu, směry a správné četnosti; nevytvářet spojení oddělených tras.
- Směr světla a terénní hodnocení nesmějí být odvozené pouze z hrubé spojnice zatáčky tak, že změní skutečný místní azimut. Navrhnout agregaci barev pro přehled a ověřit hranice přepnutí úrovní.
- Samotná menší geometrie nemusí zrychlit výpočet jízdních řádů; odděleně doložit přínos kreslení, slunečních výpočtů a provozní agregace. Zachovat výjezdy, zátahy a vzácné průjezdy.

### O2: Trvalé předpočítané terénní podklady nezávislé na GTFS

- Již funguje v P2: geografická cache profilu bez ID GTFS; známé buňky se přebírají, počítají se pouze chybějící. Pokud nejsou nové buňky, build jen publikuje uložené profily. Klient načítá hotové horizonty a porovnává je s aktuální výškou Slunce; DEM nepočítá.
- Slabina: výsledky jsou uchované v dočasné GitHub Actions cache, která může zmizet. Pak se musí terén znovu vypočítat. Každý deploy navíc znovu sestavuje publikované balíčky pro oblast aktuálního feedu.
- Navrhnout trvale uložený, verzovaný geografický dataset terénních horizontů s manifestem a hashi, samostatný od denních GTFS aktualizací. Běžný GTFS build jej převezme bez DEM výpočtu; klient dál načítá jen místní chunky.
- Zvolit pokrytí PID s rezervou a postup pro nové trasy mimo pokrytí: explicitně doplnit chybějící geografické buňky samostatným krokem, nebo přiznat neověřený terén. Nepovažovat chybějící profil za nulový horizont.
- Přepočet vyvolat jen změnou DEM, algoritmu, rozlišení, dosahu, výšky cíle nebo explicitním rozšířením pokrytí. Terén je relativně stálý, nikoli navždy neměnný; zachovat verzi zdroje.
- Při návrhu vybrat trvalé úložiště a distribuční cestu bez zbytečného backendu; určit velikost a licenci. Při realizaci ověřit dvě různé GTFS aktualizace, ztrátu Actions cache a novou oblast. Výpočet polohy Slunce pro vybraný čas samozřejmě zůstává.

O1 je implementované v bloku 2; O2 zůstává pro pozdější práci. P3 se neobnovuje.


## Blok 2: rychlý náhled a kreslicí geometrie (6. 10. 2026)

- [x] Build vytváří tři prostorové varianty **linií**: overview do z11 / 16 m, medium z12–14 / 4 m, detail od z15 / bez dalšího zjednodušení. Při 50° zeměpisné šířky jde nejvýše o 0,34 / 0,66 obrazového pixelu na horním zoomu. Každá varianta je samostatný hashovaný gzip; klient volí pouze právě potřebnou úroveň. Přesné GTFS chunky dál používá worker.
- [x] Zjednodušení končí na větvení, koncích původních shapes, místních koncích chunků a změně množiny linka/dopravce/směr/typ úseku. Nepřipojuje blízké paralelní trasy. Každý kreslicí segment odkazuje na uspořádané původní podepsané ID hran.
- [x] Worker sloučí segment pouze při shodě **všech** dynamických počtů, kategorií, povrchových směrů a identit po orientaci. Při změně hodnot použije původní jednotlivé hrany. Počty sousedních hran se nikdy nesčítají. Detail, přichycení bodu, interpolace, doporučení a CSV používají přesnou geometrii a původní pravidla.
- [x] První malý kreslicí chunk lze zobrazit během načítání provozu. Náhled respektuje statické filtry linek/dopravců/druhů/denních-nočních linek, ale **nepotvrzuje aktivitu ve vybraném dni, čase či směru**. Status i legenda jej označují jako předběžný; ve focení a barvě intenzity používá samostatnou nehodnocenou barvu. Po přesném výsledku se nahradí potvrzenými trasami. Výpadek náhledových dat nezablokuje přesný výsledek.
- [x] V existujícím ⓘ je přístupný checkbox **Intenzity**, výchozí vypnutý, dotykový cíl 44 px. Vypnuto = jednotná tloušťka; zapnuto = původní kategorie. Počty se počítají na pozadí i při vypnutí. Přepnutí pouze překresluje; nemění čas/datum/filtry/průjezdy, neposílá workerový výpočet ani síťové požadavky. Volba vzhledu se nesdílí v URL.
- [x] Slunce na zjednodušené čáře se vyhodnocuje v původních středech hran a s jejich skutečnými místními azimuty. Přehled ukazuje **nejhorší** dílčí hodnocení; ve sloučených směrech se nejdříve vybere lepší přítomný povrchový směr každého dílu. Stín terénu se nepřekryje lepším sousedem. Samostatné metro nadále nic nepočítá. Bodový detail není tímto přehledem změněn.
- [x] Souřadnice pro canvas se promítají jednou na uzel a překreslení nereaguje dvakrát na zoomend/moveend. Řetězce popisků vznikají až při použití režimu linek na dostatečném zoomu. Cache Slunce používá přesné souřadnice, jeden čas a současný výřez; při výměně geometrie se uvolní. Transferovány jsou i zdrojové sluneční vzorky. Render cache má 4 MiB / 16 záznamů vedle dosavadních 4 MiB / 8 datových a 8 MiB / 24 výsledkových záznamů. Limity jsou účetní odhady, nikoli záruka celkové RAM JS runtime.
- [x] Nová změna výřezu/filtru okamžitě invaliduje staré odpovědi před debounce; worker kontroluje generaci mezi chunky. Změny času světla ponechávají jízdní řády, terén a načtené počasí beze změny.
- [x] Cílené testy, skutečný worker s přenosem bufferů a rozšířená produkční regrese. Opakované stejné scénáře a omezení měření: [report](BLOK2-MERENI.md), [před](block2-before.json), [po](block2-after.json).

Index je explicitní gzip, s kompatibilním návratem k původnímu JSON. Přesný provozní vstup se nezmenšuje; malé render soubory jsou dodatečný přenos pro dřívější náhled. Nejde o trvalé úložiště terénu, novou aktualizaci GTFS, P3 ani P4/P5. Měřený široký fotografický přehled nad 20 tisíc kreslených hran rozděluje práci do snímků s cílem 12 ms na dávku (kontrola po 128 hranách). Nové překreslení předchozí dávky zruší. Hodnoty ani geometrická kvalita se při tom nemění; celková práce na přesném nasvícení stále zůstává. Stav nasazení a skutečné UI ověření uvádí report.

Uživatel po nasazení `26fc388` potvrdil na vlastním telefonu funkční ikonku Mapy.com a otevření bodu v mobilní aplikaci. To doplňuje omezení přímého mobilního ověření bloku 1 výše; nové ovládání bloku 2 na telefonu tím ověřené není.
