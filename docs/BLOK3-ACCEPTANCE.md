# Blok 3E – acceptance 7. října 2026

## Ověřeno

- Produkční regrese simulovaného přechodu: 56 provozních a 63 LOD kombinací prošlo.
- Celá sada: 100/100 automatických testů, včetně raw i compiled obnovy předchozího dne přes skutečný parser a Engine.
- Dva původní ZIP archivy ověřeny SHA-256; oba začínají 7. října. Řízená simulace posouvá pouze feed_start_date novějšího archivu na 8. října. Nejde o nově publikovaný feed a simulovaná data se nenasazují.
- Simulace importuje 1 181 aktivních předchozích spojů zasahujících přes půlnoc. Porovnání 42 kombinací nad sedmi oblastmi ověřilo 766 skutečných dojezdů proti původnímu feedu: časy, směry, klasifikace, příznaky a metadata linek/dopravců.
- Živá produkce: první den bez falešného upozornění na neúplnost, náhled následovaný přesnými trasami, oddálení a detail, denní/noční filtr, samostatný čas světla. Bod 50.08262, 14.42183: 597 průjezdů, včetně původních dojezdů B v 00:01 a 00:05.

## Oprava

Raw sloučení dříve přidávalo i předchozí spoje končící před půlnocí. Ty nemohou ovlivnit první zobrazitelný občanský den. Import nyní zachovává jen aktivní tripy s alespoň jedním arrival/departure >=24:00. Zůstávají celé jejich stop_times, geometrie a provozní příznaky. Test ověřuje vyloučení nepotřebných denních tripů a shodu skutečných půlnočních průjezdů.

## Cache a terén

Hashované soubory používají HTTP force-cache, měnitelné manifesty no-cache. Eviction omezené RAM LRU vyžaduje nové dekódování, nikoli automaticky plný přenos. Souběžné stejné chunky sdílejí Promise; úspěšná data nepadají se zrušeným viewportem. Terén má 4 MiB / 16 položek LRU, dvě globální download pozice a vlastní aktivní výřez mimo LRU. Není to tvrdý limit celkové RAM. Změna světla nevyžaduje GTFS ani DEM.

Cache, eviction, revalidaci, souběh a rychlé změny výřezu ověřuje automatická sada. Nový síťový trace ani nový mobilní benchmark nebyly v této kontrole pořízeny. Dřívější skutečné měření A–B–A je v reportu bloku 2.

## Co ještě nelze uzavřít

- Pozorovat první skutečný scheduled běh 8. října kolem 04:07 Europe/Prague, případně recovery 05:07/06:07, a jeho nasazený výsledek.
- Ověřit následující reálně publikovaný denní raw feed. Dnešní simulace ověřuje mechanismus, ne budoucí externí vstup.
- Fyzický telefon: ovládání detailu, pan/zoom, světlo a terén při rychlém pohybu. Desktopové UI není náhradou tohoto testu.

Definitivní DONE celého bloku 3 zatím nevyhlašujeme. U2 (paměť času mezi body), U3/U4 a budovy jsou samostatné úkoly.
