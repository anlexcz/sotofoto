# Šotofoto – technický přehled

Statická aplikace na GitHub Pages. Leaflet 1.9.4, vlastní Canvas tras, ES moduly, Web Worker. Bez backendu a runtime frameworku. README popisuje uživatelské chování; tento dokument datovou architekturu a její invarianty.

## P2: životní cyklus dat

1. `build_data.py` čte PID GTFS a vytváří globální číselné ID, sdílené hrany, patterny, kalendář a klasifikaci provozu. Monolitické soubory jsou pouze mezivýsledek pro kontrolu a terén.
2. `chunk_data.py` rozdělí síť do buněk 0,05°; buňky s více než 2 MB binárního jízdního řádu před kompresí rozdělí na čtyři buňky 0,025°. Velikost není fyzicky stejná v obou osách. Index nese skutečné bounds každého balíčku.
3. Hrana patří do všech buněk, které protíná její bounding box. Je to konzervativní výběr, včetně dlouhých hran a přesných hranic. Prázdné buňky se nevytvářejí.
4. Geometrie obsahuje globální ID hrany, její koncové souřadnice a místní segmenty shapes. Každý segment si uchovává původní pořadí i GTFS vzdálenosti. Jízdní řád obsahuje všechny relevantní patterny a spoje, ale jen potřebný rozsah zastávek a časů. Původní zastávkový offset umožňuje bezeztrátové spojení sousedních balíčků.
5. `regression.mjs` porovnává výsledky s enginem nad úplným mezivýsledkem. Potom se ověřuje a přebírá připnutý terénní Release; `finalize_data.py` odstraní monolity před uploadem Pages.

## Publikované soubory

| Soubor | Obsah | Kdy se načítá |
| --- | --- | --- |
| `meta.json` | Platnost, linky, módy, dopravci, denní/noční klasifikace, kalendář, cíle, asociace linek a dopravců | Start |
| `chunks.json.gz` (fallback `chunks.json`) | Bounds, cesty, velikosti a malý linkový/dopravcovský index | Start |
| `chunks/*.geometry.json.gz` | Pouze místní hrany a části shapes | Výřez mapy nebo okolí bodu |
| `chunks/*.{regional,overview,medium,detail}.json.gz` | Kreslicí LODy, statické identity a původní ID hran | Výřez mapy, pouze právě zvolená úroveň |
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

Příjem `preview` v `app.js` ponechá současný potvrzený výsledek, pokud `confirmedCoverage.filter` odpovídá `countsTarget.filter`, nezávisle na LOD a režimu focení. Canvas při moveend promítne jeho geometrii do nového výřezu; nový přesný `counts` ji atomicky nahradí. Náhled se používá při prvním načtení nebo změně provozního filtru. Stejné ID požadavku se nadále vyžaduje pro náhled i přesný výsledek. Nejde o směšování potvrzené a statické geometrie, další cache ani prefetch. Ignorovaný náhled nečistí cache Slunce. Na zoomstart zůstává původní krátké skrytí canvasu během zoomové animace; po moveend se znovu kreslí potvrzená data.

Do UI jdou aktivní kreslicí body/hrany aktuální oblasti, četnosti, identity pro barvy/popisky a kompaktní původní sluneční vzorky. Předběžný výsledek před potvrzením provozu je výslovně označený. Číselné výsledky používají Transferable ArrayBuffer. UI nedrží shapes ani trips. Canvas kreslí pouze hrany protínající viewport; nejsou vytvářeny Leaflet polylines pro celou síť. Popisky zůstávají omezené na 45. Detail/highlight má samostatné malé Leaflet objekty.

Detail bodu vybírá všechny balíčky dotýkající se poloměru, nezávisle na výřezu mapy. Sloučení používá globální ID hran/patternů/tripů a původní pořadí segmentů. Sousední segmenty deduplikuje, pozdější návrat smyčkou zachovává. UI dostane přímo souřadnice zvýraznění; místní ID detailu se nezamění s ID mapy.

## Cache a paměť

- Kreslicí LRU: nejvýše 16 balíčků / 4 MiB dekomprimovaných bajtů (blok 2).
- Datová LRU: nejvýše 8 balíčků / 4 MiB podle dekomprimovaných bajtů.
- LRU výsledků: nejvýše 256 položek / sdílených 8 MiB odhadu, včetně identit jízd a příspěvků linek.
- Terénní LRU: nejvýše 16 balíčků / 4 MiB dekomprimovaných bajtů.
- Stejný rozpracovaný požadavek sdílí Promise; chyba se necachuje a umožňuje opakování.
- Browser HTTP cache poskytuje další úroveň po vyhození z RAM. Hashované geometry/schedule/render/terrain gzip soubory používají `force-cache`, takže i po vypršení Pages `max-age=600` mohou využít uloženou odpověď bez revalidace. Nehashované soubory používají `no-cache`. `meta.json`, `chunks.json.gz` (i fallback JSON) a `terrain-index.json` se revalidují při inicializaci, nikoli při každém pohybu. HTTP cache spravuje browser a může ji vyprázdnit; nejde o garantované offline úložiště.
- Zrušení viewportu invaliduje výsledek, ne síťový přenos ani úspěšně uložený chunk. LRU a pending Promise jsou oddělené. Změna zoomu vybírá jiný render hash; geometrie a schedule nemají zoom v klíči. Čas světla nevolá workerový provoz.
- Je-li celý výřez v cache výsledků, neposílají se částečné statické náhledy. Potvrzený canvas zůstává do přijetí výsledku. Při překročení LRU může stejný viewport znovu vyvolat fetch/dekompresi; samo o sobě to není nový síťový přenos.

Limity nejsou tvrdý strop skutečné JS RAM: objekty, právě zpracovávaný balíček, aktuální výsledek a dočasné dekódování potřebují paměť navíc. Široký výřez vyžaduje více přenosu a více viditelné geometrie, ale jízdní řád se i tehdy zpracovává postupně. Není přednačítání sousedních oblastí mimo 8% okraj. Stav načítání a chyby jsou explicitní; chybějící balíček se nevydává za nulový provoz. CSV je při načítání detailu zakázané. Neúspěšný požadavek nepublikuje částečnou mapovou agregaci.

## Terén oddělený od feedu

Blok 3B odděluje trvalý geografický dataset od GTFS i dočasné Actions cache. `config/terrain.json` připíná GitHub Release tagem a SHA-256 archivu. `terrain_dataset.py install` používá pouze standardní Python knihovnu, ověří archiv, všechny soubory, formát, parametry, hashované chunky a profily. Poté přebírá hotové chunky a porovnává geografické klíče nového GTFS s pokrytím. Chybějící buňky zaznamená v `coverageCheck`; nevytváří nulové horizonty ani nestahuje DEM. Selhání ověření/stažení zastaví build před nasazením, takže poslední produkce zůstává dostupná.

Samostatný `terrain.yml` s oprávněním `contents: write` vytváří novou verzi z čerstvého DEM, nikoli z Actions cache. Ukládá ZIP, manifest a SHA-256 do Release; existující tag odmítá přepsat. Manifest zaznamenává zdroj, licenci, parametry, kontrolní součty DEM dlaždic, commit algoritmu, pokrytí a měření. Rezerva dvou buněk obklopuje aktuální geografické klíče; nejde o úplné pokrytí obdélníku PID. Podrobný postup aktualizace a návratu: [Blok 3B](BLOK3-TEREN.md).

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

O1 je implementované v bloku 2; trvalý dataset O2 je implementovaný v bloku 3B a klientské načítání v bloku 3C. Historické návrhové body výše popisují původní stav. P3 se neobnovuje.


## Blok 2: rychlý náhled a kreslicí geometrie (6. 10. 2026)

- [x] Build vytváří čtyři prostorové varianty **linií**: regional do z9 / 320 m, overview z10–11 / 80 m, medium z12–14 / 10 m, detail od z15 / bez dalšího zjednodušení. Při 50° zeměpisné šířky jde přibližně o 1,6 / 1,7 obrazového pixelu na horním zoomu. Každá varianta je samostatný hashovaný gzip; klient volí pouze právě potřebnou úroveň. Přesné GTFS chunky dál používá worker.
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

### Závěrečná acceptance Bloku 2 — DONE

Nasazená oprava `eacffff` a standardní [workflow 37532798650](https://github.com/anlexcz/sotofoto/actions/runs/37532798650) prošly unit testy (80/80), novou produkční regresí (56 + 63 kombinací) a následnou živou kontrolou desktopu i mobilního viewportu. Zdrojové soubory produkce souhlasí s kódem. A → B → A, známé LODy a filtry mají u opakovaných hashů nulový síťový přenos; eviction RAM znovu dekóduje HTTP cache. Čas světla a intenzity nevytvořily GTFS request. Invarianty průjezdů, Prahy/půlnoci/>24h a typů 7/8/9/10 ověřuje původní engine a rozšířená regrese. Podrobnosti v [reportu](BLOK2-MERENI.md) a [strojovém souhrnu](block2-acceptance.json). Fyzický telefon nebyl nově benchmarkován.

### Dodatek: plynulejší pan/zoom a výraznější LOD (6. 10. 2026)

Malý posun uvnitř potvrzené oblasti se stejným filtrem a LOD neodesílá nový výpočet: canvas pouze přepočítá obrazové souřadnice. Výpočet připravuje rezervu 16 % kolem mapy, kontrolovaný viditelný výřez má rezervu 8 %. Worker uchovává jeden přesný výsledek pro stejnou sadu chunků a filtr; změna LOD pak mění pouze kreslicí geometrii. Nová oblast nebo filtr může stále vyžadovat výpočet.

Aktuální LOD: regional do z9 / 320 m, overview z10–11 / 80 m, medium z12–14 / 10 m, detail od z15 / přesná geometrie. Při rozdílném provozu se segment rozdělí na souvislé části se stejnými hodnotami; zjednodušují se jednotlivé části, nikoli přes hranice počtů či identit. Původní hrany a vzorky světla zůstávají zachované.

Jeden uchovaný výsledek a LRU výsledků sdílejí původní rozpočet 8 MiB; počet malých LRU položek je nejvýše 256. Kreslicí/datová/terénní RAM a HTTP politika se nemění. Rozpočet je odhad paměti, nikoli tvrdý limit celé JS haldy. Samostatná funkční a výkonová acceptance tohoto dodatku je na žádost uživatele odložená; starší označení DONE a měření níže patří předchozí verzi.

### Oprava skládání náhledu po čtvercích (7. 10. 2026)

Kreslicí chunky celého výřezu se načtou nejvýše ve čtyřech souběžných požadavcích před výpočtem přesného provozu. Mapa přijme jeden kompletní náhled, ne postupně rostoucí sadu čtverců. Dosavadní canvas zůstává během čekání; při chybě kreslicího chunku se neúplný náhled nepublikuje, přesný výpočet může pokračovat. Potvrzený výsledek nahradí náhled až po dokončení všech potřebných provozních dat. Nová generace zastaví další plánování starého výřezu, ale úspěšně načtená data zůstávají v omezené cache.

Přesné chunky se zpracovávají postupně (nejprve dostupné výsledky, potom bližší části), aby se nezvýšila paměťová zátěž. Paměťové limity ani politika HTTP cache se nemění. Velký výřez stále může dlouho počítat intenzitu; oprava odstraňuje čekání náhledu za každým přesným chunkem, neslibuje okamžitý výpočet celého PID. 82 automatických testů prošlo, včetně úplnosti náhledu před GTFS a potlačení neúplného náhledu. Starší acceptance/měření nelze považovat za měření této opravy.

## Blok 3C: klient terénu

`terrain-store.js` spravuje manifest, omezenou LRU podle hashované cesty, sdílené Promise, aktivní chunky aktuálního výřezu a stavy chyb/načítání. Dva souběžné dekodéry maximálně. Nový výřez přestane plánovat staré chunky, ale již probíhající úspěšné requesty uloží do LRU. Profily překryvu se používají během načítání nových oblastí; selhání jednoho chunku ostatní nemaže. Uvolnění focení i bodu uvolní aktivní oblast, nikoli malou LRU. Při změně časového světla se store nenačítá ani nerevaliduje.

Manifest používá `no-cache`; revalidace při prvním použití, zapnutí focení, návratu z pozadí a BFCache. Chyba chunku vyvolá jednu revalidaci; pokud se změnily hashe, požadavek se jednou obnoví. Bez změny se necyklí a zůstane explicitní chyba do dalšího pokusu. HTTP cache hashovaných gzip nadále používá `force-cache`. Změna signatury ID/cest/bounds/velikostí atomicky vyprázdní aktivní stav a invaliduje předchozí generaci; LRU zůstává bezpečná díky cestám. Staré odpovědi nemohou vstoupit do nového datasetu. Návrat na předchozí verzi má stejné pravidlo.

`at()` rozlišuje `ready`, `loading`, `error`, `unverified`; chybějící a neplatný profil vrací `null`, nikdy nulový horizont. Chybová hláška přežije změnu světla či příchod počasí. Platný profil již načtené oblasti lze dál používat i při neúspěšné revalidaci; legenda přizná výpadek. Manifest a řádky profilů mají základní kontrolu formátu na klientu; plné kontrolní součty ověřuje build 3B. Testy pokrývají výřezy, sdílení requestů, eviction, novou verzi/návrat, pozdní odpověď, obnovu po deploymentu, částečný výpadek, stav po změně světla a chybějící pokrytí.

## Doplnění zadání – 7. 10. 2026

### Blok 3D: pravidelné GTFS a úplný první občanský den – implementace 7. 10. 2026

**Aktuální provoz od 8. 10. 2026:** ranní spouštění bylo přesunuto z GitHub `schedule` na VPS `metrobus-srv`. Původní zadání a popis z 7. 10. níže jsou historické; časy 4:07, 5:07 a 6:07 Europe/Prague nyní obsluhuje `sotofoto-gtfs.timer`. VPS pouze kontroluje produkční metadata a přes `workflow_dispatch` vyvolá standardní Pages workflow na `main`; GTFS, testy, archivace a deploy zůstávají na GitHubu. Služba využívá `DynamicUser` a `LoadCredential`, token je omezen na Actions read/write jednoho repozitáře. Podrobnosti a omezení: [provoz VPS](../ops/README.md).

Ověření 8. 10.: externí [běh 37751244689](https://github.com/anlexcz/sotofoto/actions/runs/37751244689) měl build i deploy success. Spouštěč na VPS potvrdil nová produkční metadata (`builtAt=2026-10-08T08:40:53.366663+00:00`). Uživatel následně ověřil standardní službu: dnešní data byla správně přeskočena; timer je zapnutý s příštím termínem 9. 10. 2026 4:07 CEST. První skutečný ranní běh časovače ještě nebyl pozorován. Prošlo 10 lokálních testů VPS spouštěče; chyby se zapisují do journalu, proaktivní upozornění zatím není nastavené.

- Zavést pravidelnou aktualizaci GTFS standardním Pages workflow. Spouštění denně ve 4:07 `Europe/Prague`, včetně letního/zimního času; GitHub může běh zpozdit. Ruční spuštění ponechat. Testy a ověření dat musí projít před nahrazením produkce; výpadek zdroje zachová poslední úspěšnou verzi.
- Trvale zachovat ověřený předchozí vstupní GTFS snapshot, nezávisle na dočasné Actions cache. Při novém feedu převzít z předchozího snapshotu předchozí **provozní den** potřebný pro úplnost prvního občanského dne nového feedu. Jde zejména o dojezdy s GTFS časy nad 24:00. Samotné prodloužení data platnosti bez dat není řešení.
- Zachovat související kalendář a výjimky, spoje, zastávkové časy, geometrie, směry, dopravce a klasifikaci typů provozu ze stejného snapshotu; nepřiřazovat staré časy k nové geometrii jen podle shodného ID. Sloučení musí ošetřit kolize ID, výběr autoritativního feedu pro jednotlivé provozní dny a deduplikaci při překryvu platnosti. Nový feed má přednost pro dny, které pokrývá; starý doplňuje chybějící předchozí den.
- Nejde o úplný historický archiv všech zobrazitelných minulých dnů. Úplnost lze slíbit jen tam, kde uložený předchozí feed skutečně pokrývá potřebný den; při prvním spuštění, delším výpadku nebo chybějícím snapshotu přiznat neúplnost. Nepublikovat falešnou informaci o úplném prvním dni.
- Testy: změna feedu přes půlnoc, >24:00 a případné časy nad 48:00 dle skutečných PID dat, calendar_dates, překryv/kolize ID, změněná geometrie a stop-time příznaky, chybějící předchozí snapshot, selhání aktualizace. Úplnost ověřit porovnáním s původním feedem. Terén přebírat z 3B bez DEM.

### U2: pamatování začátku průjezdů mezi body – k implementaci

- Při mapovém režimu **Celý den** zachovat datum, režim seznamu (`day`/`from`/`now`) a zvolený začátek průjezdů při výběru jiného bodu, včetně blízkého bodu v sousední ulici. Platí pro ruční datum/čas i tlačítko **Teď**.
- **Teď** zachovává zachycený okamžik (včetně dosavadní rezervy pěti minut), nikoli nový čas při každém kliknutí na mapu. Nové zachycení až dalším stiskem Teď. Výběr Celý den v detailu tuto volbu výslovně zruší.
- Nenastavovat kvůli tomu časový filtr mapy a nespojovat začátek seznamu s nezávislým časem světla. Zachovat existující pravidla při skutečně aktivním mapovém časovém filtru; změna data nesmí ponechat časový údaj vztažený k nesprávnému dni.
- Potvrzená příčina v současném kódu: `snapPoint()` při každém výběru přepisuje `pointMode` a `pointStart` výchozími hodnotami filtru mapy. Opravit odděleně od datového buildu 3D a přidat testy bod A → B, ruční čas/datum, Teď, návrat na Celý den, půlnoc a aktivní filtr mapy.

Implementace 3D: `gtfs_update.py` připravuje zdroj a provenienci (`sourceSnapshot`, `continuity`, `automaticUpdate`), kontroluje aktuální pražský den a ZIP. Sloučení streamuje tabulky; importované služby mají jedinou explicitní calendar_dates výjimku pro předchozí den, nové kalendáře se omezí na začátek nového feedu. `serviceStartDate` povoluje engine předchozí den bez rozšíření výběru data v UI. ZIPy jsou v Release s úplným SHA-256 v tagu; metadata odkazují na aktuální i případný předchozí snapshot. Při chybě zůstává poslední produkce. Běhy nasazení se nepřerušují navzájem. Zdrojový archiv vzniká až po testech/regresích a před deployem. První archiv nelze použít k rekonstrukci období před jeho platností; příznak `complete` zůstane false. U2 je stále samostatný neimplementovaný úkol.

Doplnění 3D: přechodné síťové chyby mají 3 pokusy (odstupy 5/20 sekund), celý neúspěšný ranní postup dostane záložní běhy v 5:07 a 6:07 Europe/Prague. Kontrola živé produkce je přeskočí až po úspěšné dnešní aktualizaci od 4:00; samotný úspěšný build nebo uložený ZIP nejsou potvrzením deploye. Testy a integritu dat nelze přeskočit. Ruční spuštění zůstává.

Pro první experiment 6. → 7. října je dostupný starý kompletní compiled Pages build. Původní GTFS ZIP ze 6. října se nedochoval. Bootstrap proto ověřuje obsahové SHA-256 tří souborů a uchovává samostatný compiled Release; metadata jej výslovně označují `previousCompiledSnapshot`. Importuje aktivní staré spoje zasahující za 24:00, přesné původní shape vzdálenosti, lokální směry, stop-time příznaky, kalendářové výjimky a identitu dopravců/linek. Nový feed je autoritativní pro vlastní dny, starý je aktivní výhradně v předchozím dni. Test porovnává 42 kombinací skutečných dojezdů s původním compiled buildem a vyžaduje nenulové výsledky. Bootstrap se použije pouze pro chybějící den 20261006; při dalším začátku feedu pokračuje standardní raw GTFS archivace. Obecná produkční regrese již nepoužívá pevné datum 6. října.

### U3: filtr pouze dobře nasvícených autobusových průjezdů – k návrhu a implementaci

- V detailu vybraného místa nabídnout zaškrtávací volbu „Pouze autobusy s dobrým světlem“. Vyjasnit při návrhu, jak spolupracuje s existujícím výběrem druhů dopravy; uživatel požaduje autobusové průjezdy.
- Hodnotit každý spoj podle jeho skutečného času průjezdu, místního směru jízdy a polohy Slunce v daném bodu, nikoli podle nezávislého času světelného posuvníku.
- Kritérium „dobré světlo“ navázat na novou škálu U4. Lehké čelo a boční světlo mohou být vhodné; současná oranžová automaticky neznamená špatné světlo.
- Rozlišit nevhodný směr světla, noc, potvrzený terénní stín a neověřený stav. Neověřený stav nevydávat za jistě dobré nebo špatné světlo; způsob jeho zobrazení rozhodnout při návrhu.
- Jde o filtr seznamu v detailu: zachovat provozní výběr mapy a původní data. Výslovně určit návaznost na počet zobrazených průjezdů, stránkování a CSV, aby seznam a export nepůsobily rozporně.
- Přidat testy obou směrů, různých časů stejného spoje/místa, hranic vhodnosti, noci a terénního stínu. Nevytvářet nové síťové požadavky pouze kvůli zaškrtnutí filtru.

### U4: barevná škála směru světla odpovídající fotografické použitelnosti – k návrhu a implementaci

- Přepracovat barevnou škálu: současná oranžová může označovat stále dobře fotitelné lehké čelo nebo bok a působí příliš varovně.
- Návrh uživatele: přímé čelní nasvícení tmavě zelené; s rostoucím úhlem světle zelené přibližně do 60°, potom přechod přes žlutou a oranžovou až k červené. Červená má znamenat převážně nasvícený zadek vozidla / světlo zezadu.
- Úhel jednoznačně definovat jako nejmenší rozdíl místního směru jízdy a azimutu Slunce: 0° = Slunce před vozidlem (čelní nasvícení), 90° = boční, 180° = Slunce za vozidlem (nasvícený zadek). Nezaměnit směr ke Slunci se směrem dopadu paprsků.
- Přibližných 60° je návrhový orientační bod, nikoli schválená finální hranice. Přesné přechody, rozsah fotitelného boku a hranici „dobré světlo“ pro U3 doladit před implementací; červenou nepoužít předčasně pro ještě vhodné boční světlo.
- Sjednotit mapu, směrové zobrazení, značky průjezdů, legendu, textová hodnocení a doporučení. Noční/stínové a nehodnocené stavy zůstanou oddělené od škály směru.
- Zachovat přesné místní azimuty, skutečný čas jednotlivých průjezdů a pravidla agregace kreslicích LODů. Barevná změna nesmí měnit intenzity, počty ani jízdní řády.

## Blok 3E: závěrečná kontrola 7. 10. 2026

Technické kontroly, řízený přechod dvou ověřených původních archivů a živé UI jsou popsány v [reportu](BLOK3-ACCEPTANCE.md). Běžný raw import nyní stejně jako compiled bootstrap přebírá pouze aktivní předchozí tripy s arrival/departure >=24:00. Raw i compiled cesta mají integrační porovnání skutečných průjezdů přes parser a Engine. První skutečný časovač a přechod na nově publikovaný feed 8. října nelze 7. října označit za pozorované. Fyzická mobilní kontrola zůstává samostatná; blok 3 není definitivně uzavřen.

## Blok A – nasvícení

Škála v `photographyLight` používá absolutní úhel 0–180° a RGB interpolaci přes body 0 / 30 / 50 / 75 / 90 / 105 / 120 / 180°. Plateau 30–50° a 120–180°. Skóre směru je monotónní `1−úhel/180`, včetně zadních směrů; neklasifikuje levou/pravou stranu. Původní pravidla noci, terénu a nehodnoceného metra zůstávají.

Canvas hodnotí pouze viditelné hrany jednou na kreslení, využívá současnou cache Slunce. Horší hrany kreslí první; shoda používá stabilní index. U ručně rozdělených směrů se lepší směr kreslí poslední. `surfaceForward` a `surfaceBackward` jsou již omezené aktivními provozními filtry. Předběžná geometrie nemá šipky ani hodnocení světla.

`PHOTO_ARROWS` v `photo-light.js`: zoom 15, prostorová buňka 110 px, velikost 7 px, nejvýše 120 šipek. V každé obsazené buňce má přednost lépe nasvícená hrana. Jeden chevron u středu dostatečně dlouhého segmentu, bílý obrys pro čitelnost; žádné další Leaflet objekty ani síťové požadavky.

`goodPassageLight` používá hodnocení každého průjezdu z `sunFor(row)` (Praha, `row.time`, včetně následujícího dne). Přesných 90° neprojde. Přepnutí pouze obnoví `listRows`, počet a viditelnost existujících řádků; nevolá worker ani výpočet jízdního řádu. CSV exportuje celé `listRows`, ne skryté výsledky mimo filtr ani jen aktuální dávku. Denní doporučení/statistiky zůstávají nezávislé a zachovávají dosavadní definici vhodného světla; tento přepínač mění pouze seznam a CSV. Chybějící terén stále výslovně neověřený, počasí není součástí filtru.

Lokální automatické ověření: 105/105 testů `npm test`, včetně barevných bodů, spojitosti, striktní hranice 90°, vlastního civilního času, nezávislosti slideru, aktivních povrchových směrů, shody a zoomového prahu. Finální kód `efd63a60d6775446fa97cf72016cd5125c77c282` je nasazený přes [workflow 37624631609](https://github.com/anlexcz/sotofoto/actions/runs/37624631609); build a deploy jsou success. Celá sada 105/105 prošla i v Actions, produkční regrese, kontrola 42 kombinací s 788 půlnočními průjezdy, terén a finalizace uspěly.\n\nProdukční desktop Chrome 1363 × 936: Náměstí Míru 7. 10. 2026, 2 112 průjezdů → po zapnutí filtru 448 → vypnutí obnoví 2 112 včetně metra/noci. Čas světla změněn z 15:00 na 08:00 a 07:55; filtrovaný počet zůstal 448. Šipky a nové barvy jsou viditelné v režimu focení na zoomu 16. Řádek počet · CSV | chip má ve sloupci 346 px správné rozložení bez překryvu, oba ovladače jsou vysoké 44 px. Původně zjištěná chyba starého modulu v cache je odstraněna verzovanými importy; stejný prohlížeč po finálním deployi aplikaci úspěšně načetl. CSV nadále iteruje celé filtrované `listRows`; samotný soubor nebyl v této browser kontrole stažen a porovnán.\n\nLimit: úplná funkční kontrola mobilního/velmi úzkého viewportu a výkon na fyzickém telefonu nebyly provedeny. Lokální Chrome nelze spustit kvůli zákazu socketů; dostupný cloudový browser nemá API změny viewportu a pokus o zoom jeho CSS šířku nezměnil. Responzivní řádek má povolené zalomení, ale nejde o náhradu skutečného mobilního testu.\n\nBěhem načítání nového detailu je také filtr Dobré světlo vypnutý, spolu s CSV, aby staré `pointRows` nemohly obnovit export neaktuálního výběru.


Přepínač „☀ Dobré světlo“ pouze skrývá již vykreslené nevhodné průjezdy; nemaže seznam ani rozbalené detaily, neresetuje scroll a nespouští worker. Dávkování zůstává nad nefiltrovanými průjezdy, CSV a počet nad celým filtrovaným seznamem. Přepnutí samo nespouští automatickou další dávku.

Tlačítko „☀ Dobré světlo“ má minimální výšku 30 px a svislé odsazení 4 px; šířka zůstává podle textu a původního vodorovného odsazení.


## Bod 5 – dokončení filtru Dobré světlo (8. 10. 2026)

Aktuální pravidla nahrazují starší popis počtu nad seznamem: řádek obsahuje jen CSV a Dobré světlo. Celkové statistiky zůstávají v rozbalovacím přehledu. CSV exportuje celý filtrovaný výběr, nikoli jen vykreslené dávky; tlačítko má vysvětlující tooltip.

Detail rozlišuje prázdné vykreslené období (uvede poslední zkontrolovaný civilní čas a nabídne další dávku) a celý výběr bez vhodného průjezdu (nabídne vypnout filtr, další dávky v tomto stavu skrývá). Při zapnutém filtru se dávky přidávají výhradně na tlačítko; text „Prohledáno do“ označuje hranici zkontrolovaných nefiltrovaných průjezdů. Bez filtru zůstává původní automatické stránkování. Výpočet a hranice vhodnosti se nemění.

Přímý výběr jiného bodu zachová filtr, zavření detailu jej vypne a invaliduje probíhající výběr bodu. Přepnutí filtru zachová DOM řádky, rozbalení i scroll; další dávka připojuje řádky a zachová scroll. Žádný nový síťový požadavek kvůli přepínači. Limity původního dávkování se nemění (body 7–9 nejsou tímto celé vyřešeny).
