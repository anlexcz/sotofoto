# Blok 3B – trvalý geografický terén

Běžný build GTFS používá verzovaný GitHub Release místo dočasné Actions cache. Klient nadále načítá pouze místní hashované chunky; RAM LRU a HTTP politika Bloku 2 se nemění. Provozní engine, čas světla a model horizontu se nemění.

## První dataset

[terrain-v1-20261007-01](https://github.com/anlexcz/sotofoto/releases/tag/terrain-v1-20261007-01), vytvořený [samostatným workflow](https://github.com/anlexcz/sotofoto/actions/runs/37577689656).

- 186 034 geografických profilů, 0 neplatných; 1 067 chunků.
- Archiv: 10 117 092 B; gzip chunky: 9 660 986 B; dekódované chunky: 39 154 652 B. Tyto hodnoty nejsou klientská RAM: klient načítá místní oblast.
- Studený výpočet a balení terénu: 49,693 s; celý job včetně GTFS a publikace přibližně 161 s.
- Rezerva ±2 buňky kolem geografických klíčů aktuálního GTFS. Mřížka 0,002° × 0,004°; rezerva přibližně 445 m sever/jih a 570 m východ/západ při 50° zeměpisné šířky. Zahrnuje okolí tras, nikoli celý ohraničující obdélník.
- SHA-256 archivu: `9ce6838d50b509befd72b21895a5de60a7bb2f7325b8c5b9fd0b4ed7fc51c45c`.

## Vytvoření a aktivace nové verze

1. Actions → **Build geographical terrain dataset** → Run workflow. Zadejte nový jedinečný tag `terrain-v1-YYYYMMDD-NN` a `reserve_cells` (výchozí 2; povoleno 0–10). První spuštění bylo vyvoláno explicitní změnou `config/terrain-build.json`; změna tohoto souboru na main může spustit další sestavení. Workflow se nespouští při běžných změnách GTFS ani Pages.
2. Počkejte na úspěšné vytvoření Release s `terrain.zip`, `dataset.json`, `terrain.sha256`. Existující Release nelze tímto workflow přepsat. Nový archiv se sestavuje z čerstvých profilů; manifest obsahuje parametry, licenci a zdroj, hashe použitých DEM dlaždic, commit a hash algoritmu.
3. V `config/terrain.json` změňte tag a SHA-256 podle úspěšného Release. Commit spustí standardní Pages workflow. Samotné vytvoření Release nepřepíná produkční data.
4. Pages stáhne jediný archiv, ověří jeho SHA-256 a ID, parametry, seznam souborů, součty členů, gzip/decoded velikosti a profily. Porovná pokrytí s novým GTFS, přenese hotové chunky a zapíše `terrain-dataset.json` a `terrain-index.json`. Nestahuje DEM a neinstaluje rasterové knihovny. Finální index obsahuje metadata datasetu a počty chybějících buněk; jeho kontrolní součet v distribučním manifestu odpovídá upravenému indexu.
5. Zkontrolujte dokončený deploy a produkční `data/terrain-index.json`: správné ID, `coverageCheck` a chování focení/detailu.

## Selhání a návrat

Chybějící/poškozený archiv nebo nesouhlas verze zastaví Pages build; poslední úspěšná produkce se nepřepíše. Nové trasy mimo pokrytí nevyvolají DEM výpočet: chybějící buňky jsou v `coverageCheck` a klient je označí jako neověřený terén. Je nutné samostatně vytvořit rozšířený dataset a připnout jeho Release. Chybějící profil není nulový horizont.

Návrat znamená commit předchozího tagu a SHA-256 do `config/terrain.json` a nový standardní deploy. Předchozí Release se proto uchovává. Ochrana před přepsáním platí pro tento workflow; administrátor může Release ručně smazat, což způsobí selhání následného buildu, nikoli tichou změnu připnutých dat.

## Ověření a rozsah

Automatické testy ověřují dva různé feedy nad stejnými geografickými klíči bez DEM a cache, chybějící oblast, SHA-256/verzi, poškozený a nebezpečný archiv, jediný Release request a zachování předchozích dat při selhání. Kontrolují také hashe instalovaných souborů. Standardní Pages workflow zachovává kompletní unit testy i produkční GTFS regrese.

3B neobsahuje plánovanou denní aktualizaci GTFS (3D), zástavbu ani širší samostatnou acceptance (3E).

## Blok 3C – klient

Implementace odděluje aktivní výřez od LRU a klíčuje dekomprimované chunky celou hashovanou cestou. Nejvýše dva souběžné požadavky; zastaralý výřez neplánuje další práci, dokončená data zůstávají použitelná. Pan/zoom používá překryv již načtených profilů, chybějící oblasti jsou během čekání neověřené. Jednotlivý výpadek zachová ostatní profily a explicitní chybu. Čas světla nepřistupuje k síti.

Revalidace probíhá při prvním použití, zapnutí focení a návratu do aplikace; ne při každém pohybu mapy. Při selhání chunku se manifest jednou zkontroluje a při změně signatury se jednou obnoví výřez. Nová verze i rollback vymažou aktivní staré profily; opožděné odpovědi je nemohou vrátit. LRU 4 MiB / 16 položek a browser HTTP cache zůstávají oddělené. Současné profily širokého výřezu jsou další paměť nad LRU, stejně jako před touto změnou; limit LRU není limit celé JS haldy.

Testy nově ověřují obnovu po odstranění starých hashů při deploymentu, změnu verze i návrat během probíhajícího requestu, zachování správného překryvu při výpadku, sdílení Promise, eviction a trvalou chybovou hlášku při změně světla. Širší společná acceptance a denní GTFS automatizace zůstávají samostatné kroky.
