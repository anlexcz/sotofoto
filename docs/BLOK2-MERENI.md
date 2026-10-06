# Blok 2 — měření a ověření

## Metoda a reprodukce

Stejný místně uložený feed jako při bloku 1; tři opakování čtyř výřezů. Výchozí kód `26fc388`, nový kód bloku 2. Node offline spouští skutečný ViewportEngine a skutečné metody canvas vrstvy; canvas zaznamenává kreslicí operace bez rasterizace. V každém scénáři se měří studený provoz, opakovaný výřez, posun, změna filtru, přesný bod a osm posunů světla po pěti minutách. Testované projekce: desktop 1050×860 a telefon 390×768; **nejde o skutečnou emulaci telefonu**. Veškerá data, časy, počty průjezdů, cache, heap/ArrayBuffers procesu a maximum RSS jsou v [před](block2-before.json) a [po](block2-after.json). RAM procesu není RAM prohlížeče ani telefonu.

```sh
npm test
python scripts/build_data.py --input /cesta/PID_GTFS.zip
node --expose-gc --max-old-space-size=6144 scripts/regression.mjs dist/data
git worktree add --detach /tmp/sotofoto-before 26fc388
node --expose-gc --max-old-space-size=6144 scripts/block2-benchmark.mjs /tmp/sotofoto-before/src dist/data docs/block2-before.json
node --expose-gc --max-old-space-size=6144 scripts/block2-benchmark.mjs src dist/data docs/block2-after.json
```

Pro přímou reprodukci původního metadata přenosu je nutný i starý `chunks.json`; test s novým manifestem na starém kódu nemění přesné hrany/provoz, ale měří větší nový index. Po finalize se monolity zahodí, takže regrese vyžaduje buildový dataset před finalizací. Offline časy neobsahují internetovou latenci, mapové dlaždice ani první obrazovku browseru. Čas prvního render chunku neznamená dokončení celého výřezu. Canvas benchmark měří celkový CPU čas; u širokého focení jsou jeho dávky v aplikaci rozloženy mezi snímky. Nástroj zde nepřidává režii síťového přenosu, structured clone ani GPU.

## Srovnání

Mediány; časy ms, přenos komprimovaných lokálních souborů MB. Poslední sloupec zahrnuje provoz + právě zvolenou render úroveň, bez metadat a dlaždic.

| Scénář | Kreslené hrany před → po | První render chunk po | Přesný provoz před → po | Posun světla CPU před → po | Vstup před → po MB |
|---|---:|---:|---:|---:|---:|
| desktop-start | 10285 → 7380 | 25 | 1066 → 1103 | 28.8 → 47.8 | 6.02 → 6.16 |
| mobile-start | 2801 → 1901 | 23 | 436 → 430 | 6.9 → 12.3 | 2.54 → 2.58 |
| wide-PID | 139964 → 61777 | 4 | 5602 → 5965 | 615.9 → 635.4 | 26.92 → 28.08 |
| dense-close | 2157 → 1855 | 26 | 348 → 383 | 1.7 → 2.6 | 1.90 → 1.93 |

Podstatný přínos je dřívější náhled, méně kreslených hran a rychlejší sestavení canvas vrstvy (např. široký výřez přibližně 1,54 → 0,76 s), nikoli zrychlený výpočet jízdních řádů. Posuny světla **nemají doložené snížení celkového CPU času**; zachování všech místních azimutů a dávkování přidává režii. Report to neoznačuje za zrychlení slideru. Samostatně změřený startovní přenos metadata + index je 0.69 → 0.48 MB díky explicitnímu gzip indexu (fallback na starý JSON zůstává). Přenos oblasti vzrostl o malé render soubory: přesnou provozní geometrii nelze touto změnou vynechat. Samostatné úrovně přesto neposílají všechny tři kreslicí varianty najednou. Zjednodušování je buildové, výběr/dynamické hranice ve workeru. Main thread dostává pouze aktivní kreslicí hrany a jejich nezbytné původní sluneční vzorky; přesné shapes, GTFS vzdálenosti a zastávkové časy zůstávají ve workeru.

Široký přehled překračuje rozumný čas jedné hlavní úlohy i po snížení hran. Proto focení nad 20 000 kreslených hran rozděluje výpočet/kreslení mezi requestAnimationFrame s cílem 12 ms (kontrola každých 128 hran). Změna času/výřezu ruší rozpracované staré snímky. Nesnižuje věrnost dat nebo počet průjezdů. Celkový CPU čas stále může být vysoký; není to měření skutečné FPS telefonu.

## Kontroly

- Unit testy zahrnují buildové LODy, hranice identit/kategorií a otočených směrů, nesčítání hodnot, předběžný náhled při blokovaném schedule, zrušené generace a výpadek renderu, konzervativní světlo zatáčky, metro bez výpočtu, výchozí checkbox a jeho skutečný handler, dávkované překreslení a zrušení předchozí práce.
- Test skutečného workeru ověřuje inicializaci, předběžný i konečný přenos bufferů, filtr bez provozu, přesný snap a průjezdy. Přichycení bodu nestahuje detailní render variantu.
- Produkční regrese: původních 56 kombinací (7 oblastí × 8 filtrů), shoda atributů průjezdů i počtů s monolitickým enginem; navíc 63 variant úroveň/oblast/filtr. Každá aktivní původní hrana se v nekulovaném výsledku vyskytla přesně jednou se shodnými orientovanými hodnotami. CSV/doporučení používají původní Engine a dosavadní testy včetně metra/půlnoci.
- Browser nástroj neposkytuje mobilní viewport, throttling ani heap/síťové profily; lokální HTML nebylo v předchozím ověření povolené. Mobilní projekce, unit testy a velikosti dotykových cílů nenahrazují test telefonu. Uživatel ověřil mobilní Mapy.com z bloku 1, nové chování bloku 2 je oddělená kontrola.

## Nasazení a živé ověření

Publikace používá nezměněné standardní `.github/workflows/pages.yml` s unit testy a produkční regresí. Závěrečná publikace a živá acceptance kontrola jsou doložené v dodatku níže; offline výsledky výše samy o sobě nejsou ověřením produkce.

## Závěrečná acceptance kontrola a cache

Výchozí `main` `4aad4702051e41366d53de8566ffb303011c3720`: standardní Pages workflow 37525999713 úspěšný. Produkční HTML, app, worker, chunks a chunk-engine byly bajtově porovnány s touto revizí a souhlasily. Původní report nedoložil závěrečnou živou kontrolu; tento dodatek ji doplňuje po nasazení opravy.

Oprava: `force-cache` pouze pro 16znakové obsahové hashe, revalidace všech nehashovaných vstupů, verzované vstupní moduly a potlačení částečného preview nad plně cachovaným výsledkem. RAM limity zůstávají 4 MiB / 8 data, 4 MiB / 16 render, 8 MiB / 24 výsledky, 4 MiB / 16 terén. Velikosti jsou účetní limity, nikoli celkový heap.

Lokálně: 80/80 unit testů; plná produkční regrese 56 kombinací + 63 LOD kombinací. Browser HTTP test s `max-age=0` doložil jeden serverový přenos A i B při A → B → A a souběžném A; manifesty po simulaci nové verze načetl dvakrát a následoval nový hash. Lokální Chromium prošlo desktopem 1440 × 900 i mobilním viewportem 390 × 844, všemi LOD, den/noc, intenzitou, světlem, bodem a rychlým pan/zoom. Světlo a intenzita nevytvořily GTFS request ani counts message.

Reprodukce nad instalovaným Playwright/Chromium: `node scripts/acceptance-http-cache.cjs` a `node scripts/acceptance-browser.cjs https://anlexcz.github.io/sotofoto/ /tmp/block2-live.json`. Runtime lze zadat přes `CODEX_PRIMARY_RUNTIME_NODE_MODULES`, cestu Chromium přes `CHROME_PATH`. Druhý runner zaznamenává skutečné worker Resource Timing (transferSize/encodedBodySize); neinterceptuje síť a nemění produkční soubory. Mobilní viewport/touch nejsou fyzický telefon. Počasí může být v testovacím prostředí nedostupné, zůstává explicitně neověřené a neblokuje provoz.

**Blok 2: DONE.** Oprava `eacffffaba25ff2afbcbf95b5d246c0983b41a97` prošla [standardním Pages workflow 37532798650](https://github.com/anlexcz/sotofoto/actions/runs/37532798650) včetně unit testů, nové produkční regrese, terénu, finalizace a deploye. Potom proběhla živá kontrola s čistými browser kontexty. Produkční HTML/app/worker/chunks/chunk-engine byly bajtově porovnány s nasazeným kódem a souhlasily. Strojový souhrn: [block2-acceptance.json](block2-acceptance.json).

| Živý scénář | Desktop: fetch / přenos | Mobilní viewport: fetch / přenos |
| --- | ---: | ---: |
| Stejný výřez | 99 / 0 B | 0 / 0 B |
| B → původní A | 99 / 0 B | 42 / 0 B |
| Návrat z overview do známého medium | 99 / 0 B | 30 / 0 B |
| Noční filtr | 99 / 0 B | 28 / 0 B |
| Denní filtr | 99 / 0 B | 28 / 0 B |
| Všechny linky | 99 / 0 B | 28 / 0 B |

Počty jsou volání browser fetch, nikoli počet nových serverových přenosů. Větší výřez přesahuje RAM LRU a po opětovném načtení se znovu dekóduje; pro již známé hashe skutečný worker Resource Timing ukazuje `transferSize=0`. Nová oblast a nová LOD varianta se přenášejí jednou podle potřeby. Malé manifesty se při pohybu/zoomu neopakují; revalidují se při inicializaci stránky/workeru. Terén se načítá jen pro potřebnou oblast při focení nebo detailu, jeho hashe mají stejnou HTTP politiku.

- V obou čistých kontextech přišel označený předběžný náhled před přesným výsledkem. Po dostupnosti metadat první náhled za 279 / 283 ms, přesný výsledek za 8 202 / 3 148 ms (desktop / mobile viewport). Jde o jediný běh přes testovací proxy, nikoli reprezentativní dobu startu na telefonu. Aktivní přesné trasy ověřuje shoda 63 LOD kombinací s původními hranami a hodnotami; neaktivní statické náhledové trasy se po potvrzení provozu správně odstraní.
- Prošly overview z11, medium z13 a detail z15, denní/noční/vše, pan/zoom, intenzity, focení, osm rychlých změn světla, rychlý sled viewportů a přesný detail Náměstí Míru s průjezdy tramvaje/metro/bus. Světlo a přepnutí intenzit: 0 GTFS requestů a 0 counts messages. Zrušené generace neměnily poslední výsledek. Bez JS a worker chyb, bez vodorovného přetečení mobilního layoutu; mapa, detail a první řádky byly vizuálně zkontrolovány.
- Vynucená eviction (RAM LRU pouze 1 položka) v produkčním workeru A → B → A znovu dekódovala první geometrii z HTTP cache s přenosem 0 B. Nezvětšuje se žádný limit RAM. Browser smí svoji HTTP cache smazat; pak je nový síťový přenos nutný.
- První živý síťový pokus selhal kvůli neověřenému certifikátu testovací proxy: Chromium ignorovalo certifikační chybu a neukládalo HTTPS odpovědi do HTTP cache. Diagnostika doložila stejné cacheable Pages hlavičky (`max-age=600`) i při opakovaném plném přenosu. Po důvěryhodném nastavení certifikátu prostředí a odstranění `ignoreHTTPSErrors` test prošel. Runner proto vyžaduje normální ověření HTTPS; chybu certifikátu nesmí skrýt. Produkční aplikace kvůli tomu nepotřebovala další opravu.
- Limity: mobilní viewport/touch a vizuální kontrola nejsou test fyzického telefonu, tepelných limitů nebo slabé CPU. Počasí/externí API není předmětem cache GTFS; chybějící odpověď zůstává explicitně neověřená. Cache nepřidává infrastrukturu, service worker ani trvalou vlastní databázi.

### Dodatek: plynulejší pan/zoom a výraznější LOD (6. 10. 2026)

Malý posun uvnitř potvrzené oblasti se stejným filtrem a LOD neodesílá nový výpočet: canvas pouze přepočítá obrazové souřadnice. Výpočet připravuje rezervu 16 % kolem mapy, kontrolovaný viditelný výřez má rezervu 8 %. Worker uchovává jeden přesný výsledek pro stejnou sadu chunků a filtr; změna LOD pak mění pouze kreslicí geometrii. Nová oblast nebo filtr může stále vyžadovat výpočet.

Aktuální LOD: regional do z9 / 320 m, overview z10–11 / 80 m, medium z12–14 / 10 m, detail od z15 / přesná geometrie. Při rozdílném provozu se segment rozdělí na souvislé části se stejnými hodnotami; zjednodušují se jednotlivé části, nikoli přes hranice počtů či identit. Původní hrany a vzorky světla zůstávají zachované.

Jeden uchovaný výsledek a LRU výsledků sdílejí původní rozpočet 8 MiB; počet malých LRU položek je nejvýše 256. Kreslicí/datová/terénní RAM a HTTP politika se nemění. Rozpočet je odhad paměti, nikoli tvrdý limit celé JS haldy. Samostatná funkční a výkonová acceptance tohoto dodatku je na žádost uživatele odložená; starší označení DONE a měření níže patří předchozí verzi.
