# Šotofoto

Interaktivní mapa PID pro plánování focení dopravy. **Web:** https://anlexcz.github.io/sotofoto/

## Co umí

- Všechny druhy dopravy obsažené v PID GTFS; kombinovatelné filtry linek, dopravců a druhů dopravy.
- Konkrétní datum v platnosti balíčku a libovolný časový rozsah, včetně přechodu přes půlnoc. Stejný čas od/do znamená 24 hodin.
- Tloušťka společných úseků podle počtu průjezdů ve vybraném čase. Výchozí zobrazení sčítá oba směry; lze zobrazit protisměry vedle sebe nebo filtrovat místní směry S/SV/V/JV/J/JZ/Z/SZ.
- Kliknutí kdekoliv poblíž trasy: průjezdy v okolí 20–150 m, linka, cílová zastávka, dopravce, místní směr a azimut, odhad času a odjezd z předchozí zastávky. Celý den nebo vybraný čas.
- Režim focení: celé vyfiltrované trasy se obarví podle slunce ve zvoleném okamžiku. Zelená = čelo, přes žlutou k oranžové = boční světlo, několik stupňů za bokem přechod do červené = světlo zezadu / protislunce. Pod obzorem šedá. Posuvník po 5 minutách od hodiny před východem do hodiny po západu, s označeným východem a západem. Lze zadat libovolný přesný čas; rozsah se v případě potřeby rozšíří. Posuvník nemění filtry ani počty spojů.
- Poloha slunce v době skutečného průjezdu, počty průjezdů s příznivým nasvícením po hodinách i ráno/poledne/odpoledne. Kliknutí na sloupec nastaví danou hodinu pro filtr provozu.
- Tloušťka tras se přizpůsobuje přiblížení, aby při oddálení nezakrývaly mapový podklad.
- Barvy podle druhu dopravy, linky, dopravce, intenzity nebo jedna vlastní barva; průhlednost.
- CSV export průjezdů a sdílení odkazu: URL uchovává datum, čas, filtry, pohled mapy, vybrané místo, režim focení, jeho nastavený čas a režim barev.
- Responzivní ovládání pro mobil; výpočty ve Web Workeru.

## Data a pravidla výpočtu

Zdroj: [PID GTFS](https://data.pid.cz/PID_GTFS.zip), dokumentace a licence: [Otevřená data PID](https://pid.cz/o-systemu/opendata/). Autor dat ROPID / PID, licence dle zdroje CC BY. Data jsou upravena: indexace tras a jízdních řádů, zaokrouhlení geometrie na pět desetinných míst, zjednodušení sdílených větví s tolerancí 2 m při zachování křižovatek a konců tras, agregace průjezdů, interpolace časů. Nejde o skutečné vypravení ani živé polohy vozidel. Konkrétní typy vozidel nejsou odvozovány.

Dopravce se bere z `trips.sub_agency_id`, název z rozšíření PID `route_sub_agencies.txt`; obecné `agency.txt` uvádí společný PID. Kalendář respektuje `calendar.txt` i přidání/odebrání služeb v `calendar_dates.txt`.

Datum je **občanský den v Praze**, nikoliv pouze GTFS provozní den. Spoje předchozího dne s časy nad 24:00 se započtou do časů po půlnoci. U rozsahu přes půlnoc se načítají i služby následujícího dne. Na začátku platnosti feedu nelze rekonstruovat předchozí den; na konci následující den. Tyto hranice aplikace zobrazuje. Na dni změny letního času samotné GTFS wall-clock časy nerozlišují opakovanou hodinu.

Společný úsek je shodná dvojice po sobě jdoucích bodů trasy po zaokrouhlení. Jsou-li dvě téměř shodné trasy v GTFS digitalizovány odlišně, mohou zůstat samostatné. Intenzita úseku je počet průjezdů **v jeho středu** v intervalu `[od, do)`; u dlouhých úseků se přesný čas ve vybraném bodě může lišit. Překrývající se úsek má v režimu linka/dopravce barvu prvního přispívajícího spoje, nikoliv směs barev; podrobnosti poskytne seznam průjezdů.

Čas mezi zastávkami se odhaduje podle `shape_dist_traveled`: odjezd z předchozí zastávky → příjezd do další. Nezahrnuje stání v předchozí zastávce. Zastávkový čas je čas odjezdu. Příznak `≈` označuje odhad; vždy je k dispozici předchozí zastávka a její odjezd. Nezobrazuje se neobsloužený začátek/konec shape. Při chybějící shape se použijí označené přímé spojnice zastávek, při chybějících vzdálenostech monotónní projekce zastávek na trasu.

Kliknutí zahrnuje nejbližší body tras uvnitř zvoleného poloměru. Navazující segmenty stejného průjezdu se spojí; smyčka může vytvořit více průjezdů stejného spoje. Může se započítat i souběžná ulice či kolej, zejména při velkém poloměru. Směr je azimut nejbližšího segmentu, proto na ostrém oblouku doporučujeme kliknout přímo do zamýšleného místa záběru.

Výpočet slunce používá astronomickou aproximaci a časovou zónu `Europe/Prague`. Režim focení hodnotí úhel mezi směrem jízdy a azimutem slunce, bez volby strany vozu. Spektrum: 0° zelená, 45° žlutá, 85–90° sytě oranžová, 98° červená, světlo zezadu tmavě červené. Slunce se středem pod geometrickým obzorem je šedé. Společná čára v obou směrech ukazuje **lepší z přítomných směrů** podle aktivního filtru provozu, nikoliv zaručené nasvícení pro oba. Automatické rozdělení směrů není zapnuto; již existující ruční rozdělení protisměrů lze použít a pak má každý vlastní barvu.

Rozsah časové osy a značky východu/západu se počítají podle středu aktuálního výřezu mapy. Astronomický východ/západ používá výšku středu slunce −0,833° (běžná aproximace refrakce a horního okraje slunečního disku), takže šedá pro geometrický střed může přetrvat několik minut po značce východu. Jednotlivé úseky se barví podle své skutečné polohy. Posuvník jen překresluje nasvícení, nepřepočítává provozní filtr, intenzitu ani seznam průjezdů. Ruční zadání času mimo výchozí rozsah rozšíří osu, aby byl zvolený čas dosažitelný. Kliknutý seznam a jeho doporučení stále hodnotí **skutečný plánovaný čas každého spoje**, nikoliv okamžik z posuvníku.

Jde o geometrické doporučení pro přímé slunce. Nezohledňuje počasí, stíny budov, terén, vegetaci, tunely ani fyzickou dostupnost místa. Ráno 5–10, poledne 10–14, odpoledne 14–20; noční spoje zůstávají v seznamu a hodinovém grafu.

## Spuštění a ruční aktualizace

Stačí Python 3.12+ a Node 22+ pro testy, žádné balíčky se neinstalují.

```bash
npm test
python scripts/build_data.py
python -m http.server 8000 --directory dist
```

Pro vlastní stažený balíček: `python scripts/build_data.py --input /cesta/PID_GTFS.zip`. Výstup je v `dist/`, surový ZIP ani generovaná data se necommitují. Komprimovaný dataset je zpracováván přímo v prohlížeči pomocí `DecompressionStream`; vyžaduje moderní Chrome, Firefox či Safari. První načtení přenáší přibližně 22 MB dat (velikost závisí na feedu).

Workflow `.github/workflows/pages.yml` spouští testy, stáhne aktuální GTFS, zpracuje jej a nasadí na GitHub Pages při commitu na `main` nebo ručně pomocí **Actions → Build and publish Šotofoto → Run workflow**. Nemá časový plán. V nastavení repozitáře musí být **Pages → Source → GitHub Actions**. Pokud automatické zapnutí Pages nemá oprávnění, je nutné tento přepínač nastavit jednou ručně.

Leaflet 1.9.4 je přibalen lokálně (BSD-2-Clause, viz `public/vendor/LICENSE`). Mapové dlaždice poskytuje OpenStreetMap, fonty Google Fonts; bez nich aplikace použije systémové písmo. Výpočty a filtry nepotřebují backend.

### Počasí a terén

V režimu focení se načítá počasí pro vybraný bod, jinak pro střed mapy. Detail místa ukazuje dohlednost, celkovou a nízkou oblačnost, srážky a přímé normálové sluneční záření v čase posuvníku. Zdroj je ČHMÚ ALADIN Seamless přes Open-Meteo (1km česká doména, hodinové hodnoty, předpověď tří dnů). Jde o modelovou předpověď, nikoli živé měření; místní mlhu může minout. Mimo dostupný čas se ukazuje chybějící předpověď. Čas detailu lze změnit i na mobilu, nezávisle na filtru průjezdů. Počasí nemění barvy ani počty spojů. API nepotřebuje klíč; bezplatný endpoint je pro nekomerční použití, má limity a vyžaduje uvedení zdroje. Požadavky jsou zpožděné o 400 ms a data sdílená pro přibližně kilometrové buňky se uchovávají 30 minut (nejvýše 30 oblastí).

`scripts/build_terrain.py` stáhne veřejné dlaždice Copernicus DEM GLO-30 z AWS a předpočítá obzory poblíž středů úseků. Výpočet používá raster zjednodušený na 3 obloukové sekundy (přibližně 90 m), sdílené buňky ~220 × 280 m, azimuty po 5° a vzorky do vzdálenosti 20 km. Výška cíle je 1,5 m nad modelem, zohledňuje se zakřivení Země. Nejde o přesný model stínů domů, stromů, zářezů nebo mostů; původní Copernicus je model povrchu včetně vegetace a staveb. Úseky se sluncem zakrytým obzorem jsou v režimu focení šedé, i když už nastal astronomický východ. Průjezdy a doporučení respektují dostupný terénní obzor; chybějící profil se nepovažuje za prokázaný stín. Detail výslovně ukazuje neověřený terén. Značky východu/západu na časové ose zůstávají astronomické.

Terén je statický soubor `terrain.json.gz`; posuvník nepotřebuje výškové API. GitHub Actions instaluje `numpy` a `rasterio` a terén sestaví po GTFS. Výpadek počasí nebo načtení terénu neblokuje mapu. Zdroj výšek: Copernicus DEM, © DLR e.V. 2010–2014 and © Airbus Defence and Space GmbH 2014–2018; data upravena pro Šotofoto. Zdroj počasí: Open-Meteo / ČHMÚ, CC BY 4.0.

### Plošná vrstva počasí

Režim focení automaticky zapíná překryv přes celý výřez mapy. Modrošedá ukazuje horší dohlednost (síla roste pod 10 km, nejvýraznější při mlze), šedé zastření oblačnost se slabým přímým sluncem. Dobré podmínky jsou průhledné. Noc nevyvolává šedé zastření jen kvůli nulovému slunečnímu záření. Počasí je pod trasami a značkami, nad mapovým podkladem; nemění barvy tras ani intenzitu spojů. V legendě lze vrstvu skrýt. Volba se ukládá do odkazu spolu s mapou.

`src/weather-layer.js` načítá ALADIN pro pravidelnou geograficky zarovnanou síť celého výřezu, nikoli jen pro vybraný bod. Minimum je přibližně 1 km; na širších výřezech se vzorky adaptivně rozestupují, maximálně 64 bodů na výřez. Skutečný rozestup je uveden v legendě. Plynulý překryv používá bilineární interpolaci, která nezvyšuje přesnost modelu a může vyhlazovat lokální mlhu. Údaje všech bodů přicházejí v jedné dávce Open-Meteo; poskytovatel může počítat každý bod proti limitům API. Načítání se spustí 600 ms po ustálení mapy. Cache obsahuje nejvýše 256 bodů na 30 minut; změna času jen překresluje uložené hodinové hodnoty. Pozdní odpověď předchozího výřezu nesmí přepsat nový výřez nebo znovu zapnout vypnutou vrstvu.

Chybějící předpověď, nepokrytá oblast a chyba API jsou šrafované, nikoli prezentované jako dobré podmínky. Legenda ukazuje načítání, neúplné pokrytí nebo chybějící čas. Detail místa ponechává přesné číselné hodnoty. API nevyžaduje klíč ani server. Testy pokrývají rozsah sítě, omezení počtu vzorků, průhlednost, noční chování a interpolaci chybějících dat.

### Rychlé ovládání v terénu
GPS tlačítko pod zoomem jednorázově požádá o polohu a ukáže kruh přesnosti. Poloha se neposílá do projektu. „Teď“ nastaví dnešek a nejbližších pět minut; „Průjezdy teď ±10 min“ filtruje detail kolem aktuálního času podle jízdního řádu, bez živých zpoždění. Kliknutí se přichytí k nejbližší zobrazené trase do 250 m. Souběžné trasy lze přepnout; pokročilý výběr umožňuje původní vyhledávání v okruhu. Hodinový graf dohlednosti v detailu mění čas nasvícení kliknutím. Mlha a slunce jsou modelové odhady, místní stav se může lišit.
