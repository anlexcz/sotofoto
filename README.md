# Šotofoto

Interaktivní mapa PID pro plánování focení dopravy. **Web:** https://anlexcz.github.io/sotofoto/

## Co umí

- Všechny druhy dopravy obsažené v PID GTFS; kombinovatelné filtry linek, dopravců a druhů dopravy.
- Konkrétní datum v platnosti balíčku a libovolný časový rozsah, včetně přechodu přes půlnoc. Stejný čas od/do znamená 24 hodin.
- Tloušťka společných úseků podle četnosti pravidelného provozu po aplikaci všech filtrů. Výchozí zobrazení sčítá oba směry; lze zobrazit protisměry vedle sebe nebo filtrovat místní směry S/SV/V/JV/J/JZ/Z/SZ.
- Kliknutí kdekoliv poblíž trasy: průjezdy v okolí 20–150 m, linka, cílová zastávka, dopravce, místní směr a azimut, odhad času a odjezd z předchozí zastávky. Celý den nebo vybraný čas.
- Režim focení: celé vyfiltrované trasy se obarví podle slunce ve zvoleném okamžiku. Zelená = čelo, přes žlutou k oranžové = boční světlo, několik stupňů za bokem přechod do červené = světlo zezadu / protislunce. Pod obzorem šedá. Metro je neutrálně šedé s označením „Metro — nasvícení se nehodnotí“, bez výpočtu světla. Posuvník po 5 minutách od hodiny před východem do hodiny po západu, s označeným východem a západem. Tlačítka −5 / +5 minut i výběr hodiny a minuty po pěti minutách jsou na mapě i v detailu počasí. Lze zadat libovolný přesný čas; rozsah se v případě potřeby rozšíří. Posuvník nemění filtry ani počty spojů.
- Poloha slunce v době skutečného průjezdu, počty průjezdů s příznivým nasvícením po hodinách i ráno/poledne/odpoledne. Kliknutí na sloupec nastaví danou hodinu pro filtr provozu.
- Tloušťka tras se přizpůsobuje přiblížení, aby při oddálení nezakrývaly mapový podklad.
- Barvy podle druhu dopravy, linky, dopravce, intenzity nebo jedna vlastní barva; průhlednost. Tlačítko ⓘ vedle režimu focení otevírá legendu četnosti a aktuálních barev; v režimu focení vysvětluje nasvícení. Zavření tlačítkem, křížkem, klepnutím mimo nebo Escape.
- Přepínač „☀ Dobré světlo“ v detailu filtruje průjezdy podle vlastního plánovaného času: absolutní úhel striktně <90°, mimo noc, známý terénní stín a nehodnocené metro. Počet i CSV odpovídají celému filtrovanému seznamu, včetně dosud nerozbalených dávek. Neověřený terén a počasí zůstávají samostatné informace; filtr nepotvrzuje skutečné podmínky.
- Řídké směrové šipky v režimu focení od zoomu 15: jen aktivní povrchový provoz, při obou směrech lepší nasvícení, při shodě stabilně dopředný směr hrany. Barva odpovídá trase. Lépe nasvícené překrývající se hrany se kreslí nahoře.
- CSV export všech vybraných průjezdů včetně metra; u metra jsou sluneční údaje prázdné a světlo výslovně nehodnocené. Krátký odkaz na místo zachovává polohu, zoom a provozní filtry a otevře výchozí datum / celý den. Samostatný odkaz na plán zachovává i datum, provozní čas a nezávislý čas světla. Nové odkazy neukládají vzhled; staré serializované odkazy se dál načítají.
- Detail bodu nabízí ikonu mapy napravo od souřadnic v hlavičce („Otevřít v Mapy.com“) jako obyčejný odkaz na přesné souřadnice se značkou, bez API klíče. Jemné bílé zastření podkladu zlepšuje čitelnost tras.
- Při posunu a změně zoomu zůstávají potvrzené trasy se stejným provozním filtrem barevné až do nového přesného výsledku, také v režimu focení. Nově odkrytá oblast se může doplnit až po ověření provozu.
- Responzivní ovládání pro mobil; data podle výřezu mapy, omezené cache a výpočty ve Web Workeru. Při startu se nestahuje celý PID.

## Data a pravidla výpočtu

Zdroj: [PID GTFS](https://data.pid.cz/PID_GTFS.zip), dokumentace a licence: [Otevřená data PID](https://pid.cz/o-systemu/opendata/). Autor dat ROPID / PID, licence dle zdroje CC BY. Data jsou upravena: indexace tras a jízdních řádů, zaokrouhlení geometrie na pět desetinných míst, zjednodušení sdílených větví s tolerancí 2 m při zachování křižovatek, konců tras a hranic typů provozu, agregace průjezdů, interpolace časů. Nejde o skutečné vypravení ani živé polohy vozidel. Konkrétní typy vozidel nejsou odvozovány.

Dopravce se bere z `trips.sub_agency_id`, název z rozšíření PID `route_sub_agencies.txt`; obecné `agency.txt` uvádí společný PID. Kalendář respektuje `calendar.txt` i přidání/odebrání služeb v `calendar_dates.txt`.

Datum je **občanský den v Praze**, nikoliv pouze GTFS provozní den. Spoje předchozího dne s časy nad 24:00 se započtou do časů po půlnoci. U rozsahu přes půlnoc se načítají i služby následujícího dne. Předchozí den na začátku platnosti se doplňuje z ověřeného archivu, pokud je dostupný; bez něj aplikace přizná neúplnost. Na konci platnosti chybí následující den. Na dni změny letního času samotné GTFS wall-clock časy nerozlišují opakovanou hodinu.

Společný úsek je shodná dvojice po sobě jdoucích bodů trasy po zaokrouhlení. Jsou-li dvě téměř shodné trasy v GTFS digitalizovány odlišně, mohou zůstat samostatné. Průjezdy pro intenzitu úseku se počítají **v jeho středu** v intervalu `[od, do)`; u dlouhých úseků se přesný čas ve vybraném bodě může lišit. Překrývající se úsek má v režimu linka/dopravce barvu prvního přispívajícího spoje, nikoliv směs barev; podrobnosti poskytne seznam průjezdů.

Čas mezi zastávkami se odhaduje podle `shape_dist_traveled`: odjezd z předchozí zastávky → příjezd do další. Nezahrnuje stání v předchozí zastávce. Zastávkový čas je čas odjezdu. Příznak `≈` označuje odhad; vždy je k dispozici předchozí zastávka a její odjezd. Nezobrazuje se neobsloužený začátek/konec shape. Při chybějící shape se použijí označené přímé spojnice zastávek, při chybějících vzdálenostech monotónní projekce zastávek na trasu.

Kliknutí zahrnuje nejbližší body tras uvnitř zvoleného poloměru. Navazující segmenty stejného průjezdu se spojí; smyčka může vytvořit více průjezdů stejného spoje. Může se započítat i souběžná ulice či kolej, zejména při velkém poloměru. Směr je azimut nejbližšího segmentu, proto na ostrém oblouku doporučujeme kliknout přímo do zamýšleného místa záběru.

Výpočet slunce používá astronomickou aproximaci a časovou zónu `Europe/Prague`. Režim focení hodnotí úhel mezi směrem jízdy a azimutem slunce, bez volby strany vozu. Spektrum podle absolutního úhlu: 0° tmavší zelená, 30–50° světle zelené plateau (čelo + bok), 75° žlutá, 90° oranžová, 105° červená, 120–180° tmavě červená. Mezi body je plynulá RGB interpolace. Slunce se středem pod geometrickým obzorem je šedé. Společná čára v obou směrech ukazuje **lepší z přítomných směrů** podle aktivního filtru provozu, nikoliv zaručené nasvícení pro oba. V oddáleném přehledu delší čára zachovává horší z místních hodnocení svých částí. Automatické rozdělení směrů není zapnuto; již existující ruční rozdělení protisměrů lze použít a pak má každý vlastní barvu.

Rozsah časové osy a značky východu/západu se počítají podle středu aktuálního výřezu mapy. Astronomický východ/západ používá výšku středu slunce −0,833° (běžná aproximace refrakce a horního okraje slunečního disku), takže šedá pro geometrický střed může přetrvat několik minut po značce východu. Jednotlivé úseky se barví podle své skutečné polohy. Posuvník jen překresluje nasvícení, nepřepočítává provozní filtr, intenzitu ani seznam průjezdů. Ruční zadání času mimo výchozí rozsah rozšíří osu, aby byl zvolený čas dosažitelný. Kliknutý seznam a jeho doporučení stále hodnotí **skutečný plánovaný čas každého spoje**, nikoliv okamžik z posuvníku.

Jde o geometrické doporučení pro přímé slunce. Počasí ukazuje samostatná předpovědní vrstva; dostupný terénní obzor může označit stín. Přesné stíny budov, vegetaci, tunely ani fyzickou dostupnost místa neověřuje. Ráno 5–10, poledne 10–14, odpoledne 14–20; noční spoje zůstávají v seznamu a hodinovém grafu.

## Spuštění a ruční aktualizace

Stačí Python 3.12+ a Node 22+ pro testy, žádné balíčky se neinstalují.

```bash
npm test
python scripts/build_data.py
python scripts/terrain_dataset.py install  # hotový verzovaný terén, bez DEM
python -m http.server 8000 --directory dist
```

Pro vlastní stažený balíček: `python scripts/build_data.py --input /cesta/PID_GTFS.zip`. Výstup je v `dist/`, surový ZIP ani generovaná data se necommitují. Komprimovaný dataset je zpracováván přímo v prohlížeči pomocí `DecompressionStream`; vyžaduje moderní Chrome, Firefox či Safari. Start načítá metadata a prostorový index, pak balíčky aktuální oblasti. Blok 2 přidává samostatné kreslicí chunky pro rychlý předběžný náhled. Geometrie je JSON, zastávkové časy kompaktní uint32 buffer. Výchozí mapa má zoom 13; sdílené odkazy zachovávají svůj zoom. Podrobnosti: [technická dokumentace](docs/PROJEKT.md), [měření P2](docs/P2-MERENI.md).

Workflow `.github/workflows/pages.yml` spouští unit i produkční regresní testy, stáhne aktuální GTFS, zpracuje jej a nasadí na GitHub Pages při commitu na `main` nebo ručně pomocí **Actions → Build and publish Šotofoto → Run workflow**. Automaticky běží denně ve 4:07 v časové zóně `Europe/Prague` (letní i zimní čas; GitHub může spuštění zpozdit). Ověřený zdrojový GTFS se uchovává v GitHub Releases. Chybějící předchozí provozní den se doplňuje z ověřeného předchozího snapshotu; při prvním spuštění bez archivu zůstává neúplnost výslovně uvedená. V nastavení repozitáře musí být **Pages → Source → GitHub Actions**. Pokud automatické zapnutí Pages nemá oprávnění, je nutné tento přepínač nastavit jednou ručně.

Leaflet 1.9.4 je přibalen lokálně (BSD-2-Clause, viz `public/vendor/LICENSE`). Mapové dlaždice poskytuje OpenStreetMap, fonty Google Fonts; bez nich aplikace použije systémové písmo. Výpočty a filtry nepotřebují backend.

### Počasí a terén

V režimu focení se načítá počasí pro vybraný bod, jinak pro střed mapy. Detail místa ukazuje dohlednost, celkovou a nízkou oblačnost, srážky a přímé normálové sluneční záření v čase posuvníku. Zdroj je ČHMÚ ALADIN Seamless přes Open-Meteo (1km česká doména, hodinové hodnoty, předpověď tří dnů). Jde o modelovou předpověď, nikoli živé měření; místní mlhu může minout. Mimo dostupný čas se ukazuje chybějící předpověď. Čas detailu lze změnit i na mobilu, nezávisle na filtru průjezdů. Počasí nemění barvy ani počty spojů. API nepotřebuje klíč; bezplatný endpoint je pro nekomerční použití, má limity a vyžaduje uvedení zdroje. Požadavky jsou zpožděné o 400 ms a data sdílená pro přibližně kilometrové buňky se uchovávají 30 minut (nejvýše 30 oblastí).

`scripts/build_terrain.py` stáhne veřejné dlaždice Copernicus DEM GLO-30 z AWS a předpočítá obzory poblíž středů úseků. Výpočet používá raster zjednodušený na 3 obloukové sekundy (přibližně 90 m), sdílené buňky ~220 × 280 m, azimuty po 5° a vzorky do vzdálenosti 20 km. Výška cíle je 1,5 m nad modelem, zohledňuje se zakřivení Země. Nejde o přesný model stínů domů, stromů, zářezů nebo mostů; původní Copernicus je model povrchu včetně vegetace a staveb. Úseky se sluncem zakrytým obzorem jsou v režimu focení šedé, i když už nastal astronomický východ. Průjezdy a doporučení respektují dostupný terénní obzor; chybějící profil se nepovažuje za prokázaný stín. Detail výslovně ukazuje neověřený terén. Značky východu/západu na časové ose zůstávají astronomické.

Terén tvoří geografické balíčky s manifestem `terrain-index.json`; běžná mapa je nestahuje, focení načítá výřez a detail okolí bodu. Posuvník nepotřebuje výškové API ani další síťové požadavky. Běžný Pages build přebírá neměnný geografický dataset z GitHub Release, připnutý tagem a SHA-256 v `config/terrain.json`. Nestahuje DEM, nepočítá horizonty a nepotřebuje Actions cache ani `numpy`/`rasterio`. Samostatný workflow `terrain.yml` vytváří nové verze na ruční požadavek; postup, rezervu pokrytí a obnovu popisuje [Blok 3B](docs/BLOK3-TEREN.md). Výpadek počasí nebo načtení terénu neblokuje mapu. Zdroj výšek: Copernicus DEM, © DLR e.V. 2010–2014 and © Airbus Defence and Space GmbH 2014–2018; data upravena pro Šotofoto. Zdroj počasí: Open-Meteo / ČHMÚ, CC BY 4.0.

### Plošná vrstva počasí

Režim focení automaticky zapíná překryv přes celý výřez mapy. Modrošedá ukazuje horší dohlednost (síla roste pod 10 km, nejvýraznější při mlze), šedé zastření oblačnost se slabým přímým sluncem. Dobré podmínky jsou průhledné. Noc nevyvolává šedé zastření jen kvůli nulovému slunečnímu záření. Počasí je pod trasami a značkami, nad mapovým podkladem; nemění barvy tras ani intenzitu spojů. V legendě lze vrstvu skrýt. Volba je místní vzhledové nastavení a do nových odkazů se neukládá.

`src/weather-layer.js` načítá ALADIN pro pravidelnou geograficky zarovnanou síť celého výřezu, nikoli jen pro vybraný bod. Minimum je přibližně 1 km; na širších výřezech se vzorky adaptivně rozestupují, maximálně 64 bodů na výřez. Skutečný rozestup je uveden v legendě. Plynulý překryv používá bilineární interpolaci, která nezvyšuje přesnost modelu a může vyhlazovat lokální mlhu. Údaje všech bodů přicházejí v jedné dávce Open-Meteo; poskytovatel může počítat každý bod proti limitům API. Načítání se spustí 600 ms po ustálení mapy. Cache obsahuje nejvýše 256 bodů na 30 minut; změna času jen překresluje uložené hodinové hodnoty. Pozdní odpověď předchozího výřezu nesmí přepsat nový výřez nebo znovu zapnout vypnutou vrstvu.

Chybějící předpověď, nepokrytá oblast a chyba API jsou šrafované, nikoli prezentované jako dobré podmínky. Legenda ukazuje načítání, neúplné pokrytí nebo chybějící čas. Detail místa ponechává přesné číselné hodnoty. API nevyžaduje klíč ani server. Testy pokrývají rozsah sítě, omezení počtu vzorků, průhlednost, noční chování a interpolaci chybějících dat.

### Detail místa a ovládání v terénu

Kliknutí vybírá okolí bodu bez přepínání segmentů. Do 25 m od trasy zachovává původní kliknutí (důležité u křižovatek), dál se přichytí k nejbližší zobrazené trase do 150 m. Okolí je 40 m, v členité geometrii 55 m, nezávisle na zoomu. Kruhem a zvýrazněním jsou vyznačené zahrnuté části tras. Sousední segmenty stejného průjezdu se deduplikují; pozdější návrat do oblasti je samostatný průjezd. Metro se při souběhu s povrchovou dopravou neskrývá; všechny druhy podléhají stejným aktivním filtrům.

Mobilní panel začíná v dolní třetině (s minimální výškou pro dva průjezdy), zvětšuje se přes celou obrazovku tlačítkem nebo tažením za hlavičku. Rozbalení počasí či statistik jej zvětší, sbalení nemění zvolenou výšku. Souřadnice lze zkopírovat klepnutím. Jednotlivé průjezdy mají čas, linku, cíl a značku světla v prvním řádku, předchozí zastávku s časem ve druhém; dopravce a azimuty jsou po rozbalení.

„Teď“ zachytí dnešek a začátek pět minut zpátky; opětovným stisknutím čas obnoví. „Od času“ mění den celé aplikace a začátek seznamu, „Celý den“ zobrazí vybraný civilní den. Budoucí seznam je dostupný do konce následujícího dne v rozsahu platnosti GTFS. Po půlnoci používá 00:00 a oddělovače dnů. Nejde o živá zpoždění. První dávka cílí na dvě hodiny / maximálně 50 řádků; u řídkého provozu rozšíří okno nejvýše na šest hodin. Další dávky načítá u konce seznamu nebo tlačítkem. Výpočet denní statistiky není omezen dávkou seznamu.

„Kdy fotit“ počítá celý vybraný den podle filtrů. Spojuje obsazené pětiminutové intervaly vhodných průjezdů s mezerou nejvýše 15 minut; řadí je podle počtu vhodných spojů, poté podílu vhodných a kratší délky. Ukazuje počet vhodných / všech povrchových průjezdů; metro se do obou stran poměru nezahrnuje. Hodinové počty, běžné statistiky a CSV metro zachovávají. Hodnotí pouze slunce a dostupný terén, bez počasí. Tlačítko doporučení nastaví začátek seznamu i světlo mapy.

Počasí je sbalený přehled dohlednosti, oblačnosti, teploty a času. Rozbalený graf má dohlednost v km, hranici 1 km, vybraný čas a samostatný pás slunce/noci/chybějících dat. Hodinová tlačítka mění čas světla a počasí, nikoli seznam. Technické zdroje jsou pod „O datech“. GPS tlačítko pod zoomem jednorázově požádá o polohu a ukáže kruh přesnosti.

Počty spojů a legenda tloušťky nejsou trvale na mapě. Stavový banner se zobrazuje pouze při načítání či chybě. Posuvník tloušťky je ve vzhledu; škála má sedm pevných kategorií četnosti pravidelného provozu a přizpůsobuje se zoomu. Legenda četnosti je pod tlačítkem ⓘ vedle režimu focení.

### Četnost pravidelného provozu

Tloušťka i barevný režim intenzity používají sedm kategorií efektivního intervalu: **≤ 2 min**, **> 2 až 5 min**, **> 5 až 10 min**, **> 10 až 20 min**, **> 20 až 40 min**, **> 40 až 90 min**, **> 90 min**. Stejná škála platí pro všechny druhy dopravy; noční linky v celodenním režimu mají jednotnou nejtenčí čáru. Efektivní interval je délka hodnoceného období v minutách / počet relevantních **pravidelných** průjezdů. Nejde o medián rozestupů ani příslib pravidelného taktu. Jeden pravidelný průjezd má nejtenčí čáru a interval `null`.

V ručním časovém úseku se používá přesná délka `[od, do)`, včetně přechodu přes půlnoc. Stejné od/do je ručně zvolených 24 hodin a liší se od režimu Celý den.

V režimu **Celý den** se vybírá občanský den **00:00–24:00 v Praze**, včetně dojezdů předchozího GTFS service day s časy >24:00. Celodenní intenzita denních linek používá pevný srovnávací základ **19 hodin (1 140 minut)** dělený počtem jejich pravidelných průjezdů po všech filtrech. Započítají se i průjezdy před 05:00; nejde o časový filtr 05:00–24:00. Délka se neodvozuje z prvního/posledního průjezdu ani z největší mezery. Vnitřní mezery a krátké shluky nezkrátí základ. Shodné časy se počítají jako samostatné průjezdy.

Pevných 19 hodin je zvolená konvence pro srovnání celodenní dostupnosti, nikoli skutečná provozní doba nebo odhad rozestupů. Dva průjezdy na odbočce linky 259 tedy dávají srovnávací interval 570 minut; tři ranní školní spoje 380 minut. Takové krátké shluky už nepůsobí jako celodenní častý provoz. Kompromisem je tenká čára i u krátce provozované, ale během svého provozu časté linky (např. náhradní XS9). Její četnost v konkrétní době ukáže ruční časové okno.

Při celodenním výběru pouze **Noční** mají všechny viditelné úseky jednotnou nejtenčí čáru a stejnou nejnižší kategorii barevného režimu intenzity; konkrétní interval se neurčuje. Jsou-li zapnuté **Denní i Noční**, tloušťka a kategorie intenzity vycházejí pouze z pravidelných denních průjezdů. Úseky bez denního provozu zůstávají jednotně nejtenčí. Noční průjezdy jsou stále v mapě, detailu, statistikách a CSV. V **ručním časovém okně** se naopak do četnosti započítají všechny vybrané pravidelné průjezdy, denní i noční.

#### Výjezdy, zátahy a přejezdy

Build čte explicitní PID **`stop_times.txt.trip_operation_type`**: `1` pravidelný provoz, `7` výjezd, `8` zátah, `9` přejezd na lince, `10` přejezd na jinou linku. Příznak zastávky platí pro úsek od ní k další zastávce; na hranici se použije nový typ. [Dokumentace PID](https://pid.cz/o-systemu/opendata/) například ukončuje typ 7 před první zastávkou na běžné trase a začíná typ 8 na poslední zastávce běžné trasy. Neoznačujeme celý trip podle jediného flagu. Výjezdy/zátahy vedené PID přímo na vlastní trase jako typ 1 zůstávají pravidelným provozem.

Do četnosti přispívá **jen typ 1**. Ostatní typy nezmění pravidelný interval, ale zůstávají v datasetu, mapě, klikacím detailu, statistikách jednotlivých průjezdů a CSV. Úsek bez pravidelného provozu, ale se speciálními průjezdy, zůstává viditelný nejtenčí čárou, bez pravidelného intervalu (`null`). Úsek bez jakýchkoli průjezdů se nekreslí. Detail rozbaleného průjezdu a CSV uvádějí lidský typ speciálního provozu; běžný řádek detailu není zatížen štítkem „Pravidelný“.

Dataset verze 2 uchovává malé číselné typy sdíleně v `schedule.patterns[i][4]`, po jednom pro každou zastávku. Čistě pravidelné patterny toto pole vynechávají (implicitní typ 1). Typy jsou součástí klíče patternu, takže totožná geometrie s rozdílným provozem nesdílí nesprávnou klasifikaci. Build zachová v zjednodušené geometrii body změny typu; pokud u existující shape nelze změnu přesně přiřadit podle PID vzdálenosti, build skončí chybou místo smíchání dvou typů. Chybějící/prázdná klasifikace ve feedu způsobí chybu buildu; neodhaduje se z čísla linky, módu ani času. Neznámé kladné typy zůstávají dostupné, ale nepočítají se jako pravidelné.

#### Denní a noční linky

Filtr provozu má dvě stejně široká, nezávisle přepínaná tlačítka **Denní** se sluncem a **Noční** s měsícem. Výchozí stav má oba typy zapnuté; lze vybrat pouze jeden nebo oba vypnout (žádné průjezdy). Filtr používá explicitní PID `routes.txt.is_night`: 0 = denní, 1 = noční. Předzpracování jej uchovává v `meta.routes[i][5]`. [Dokumentace PID](https://pid.cz/o-systemu/opendata/) tento příznak popisuje jako klasifikaci nočních linek. Hodina ani číslo linky nerozhodují; denní linka po půlnoci zůstává denní. Filtr je součástí výběru spojů v enginu pro mapu, detail, CSV i denní statistiky/doporučení a ukládá se do URL jako `operation`; hodnoty `all` / `day` / `night` / `none` zachovávají i prázdný výběr. Staré odkazy bez filtru mají oba typy zapnuté. Detail si zachovává vlastní dosavadní časové ovládání a denní statistiky nadále hodnotí celý den.

Pravidelné průjezdy linek a dopravců na společném úseku se sčítají po všech filtrech podle výše popsaného režimu; speciální průjezdy je nenavyšují. Sloučené směry používají součet obou směrů, rozdělené protisměry každý svůj počet; oba používají stejný základ 19 hodin nebo délku ručního okna. Směrový filtr omezuje i tyto počty. Worker sbírá celkové, pravidelné a pro celodenní intenzitu denní pravidelné počty v jednom průchodu. Nesbírá ani neřadí časy pro výpočet intenzity. Zoom, vzhled a posuvník světla používají uložené kategorie bez další agregace jízdních řádů.

## Stav výkonové optimalizace P2

P2 je dokončené a nasazené: data se načítají podle oblasti, cache jsou omezené a terén má samostatnou geografickou cache. Na produkci bylo ověřeno i úspěšné načtení předpovědi v detailu a mapové vrstvě. Výsledky měření, mobilní zpětná vazba a limity ověření jsou v [reportu P2](docs/P2-MERENI.md#závěrečná-kontrola-a-uzavření-p2--6-10-2026). Tlačítka −5 / +5 minut a odkaz na bod v Mapy.com jsou součástí bloku 1.

## Návrat před P3 – 6. 10. 2026

Zástavba a lokální stínění P3 byly na žádost uživatele odstraněné kvůli potlačení barev nasvícení při neověřených datech. Aplikace opět používá původní výpočet Slunce a terénu z dokončeného P2. P1/P2, počasí i provozní filtry zůstávají zachované.

## Blok 1 – ovládání a přehlednost (6. 10. 2026)

Implementováno: nehodnocené metro bez jeho automatického potlačování, oddělené sdílení místa/plánu bez vzhledu, pohodlné ovládání času světla, odkaz Mapy.com a bílé zastření podkladu. −5 / +5 minut končí na 00:00 / 23:59 vybraného dne; nemění datum, provozní filtr, GTFS ani načítání terénu/počasí. Přesný čas lze zadat samostatným časovým polem. Na smíšené hraně se barva vybírá jen podle přítomných povrchových směrů; metro samotné zůstává šedé. Výpočet Slunce, terén a počasí P2 jsou zachované, P3 se neobnovuje.

Nasazeno standardním GitHub Pages workflow; kód `4b848a1` byl ověřen na živém webu. Prošlo 65 unit testů a produkční regrese (7 oblastí × 8 filtrů). Na desktopu byly ověřené průjezdy, doporučení, skutečný CSV export, časové ovládání, nové i staré odkazy a mapové vrstvy. Podrobnosti a limity jsou v technické dokumentaci. Odkaz Mapy.com používá [oficiální `/fnc/v1/showmap`](https://developer.mapy.com/further-uses-of-mapycz/mapy-cz-url/), ověřený v desktopovém prohlížeči se značkou a správnými souřadnicemi. Mobilní viewport / fyzický telefon a předání do nativní mobilní aplikace nebyly v dostupném prostředí přímo ověřené.


## Blok 2 – rychlý náhled a geometrie podle zoomu

Implementováno: tři předpočítané kreslicí úrovně po prostorových chunkech, předběžné trasy při načítání provozu a checkbox **Intenzity** v mapovém ⓘ, standardně vypnutý. Vypnutí sjednotí tloušťku; počty, průjezdy, doporučení i CSV zůstávají. Náhled výslovně neověřuje provoz v konkrétním dni/čase/směru ani světlo. Potvrdí jej až přesný výpočet na pozadí.

Detail místa a přichycení bodu dál používají přesná data. Zjednodušená fotografie vyhodnocuje skutečné původní azimuty a ukazuje nejhorší dílčí nasvícení; hrubá spojnice nevyrobí falešně dobré světlo. Metro, civilní dny, noční linky, půlnoc a zvláštní průjezdy zůstávají. Výsledky a skutečný stav nasazení: [měření bloku 2](docs/BLOK2-MERENI.md). Menší kreslicí geometrie nezmenšuje přesný provozní vstup; náhledové soubory jsou dodatečný přenos. Mobilní otevření Mapy.com už uživatel ověřil ve své aplikaci, nové ovládání bloku 2 potřebuje vlastní telefonní kontrolu.

### Cache chunků (závěrečná kontrola Bloku 2)

Hashované render/LOD, přesné geometrické, schedule a terénní soubory používají `fetch` s `force-cache`. Po vyhození z malé RAM LRU se mohou znovu dekomprimovat, ale browser znovu použije i prošlou HTTP odpověď stejného hashe. Manifesty `meta`, gzip/JSON index a terénní index používají `no-cache` (revalidaci, nikoli zákaz uložení). Limity RAM se nezvyšují. HTTP cache může prohlížeč sám vyprázdnit; potom je nový přenos nutný. Známý výřez s hotovými výsledky nepřepisuje potvrzené trasy částečným náhledem. Výsledky závěrečného nasazení a živé kontroly jsou v [reportu Bloku 2](docs/BLOK2-MERENI.md).

Blok 2 je **DONE**: standardní Pages nasazení a následná živá acceptance kontrola desktopu i mobilního viewportu prošly. 80/80 unit testů, 56 provozních + 63 LOD regresních kombinací; při návratu A → B → A opakované známé chunky přenesly 0 B. Podrobnosti a omezení jsou v reportu výše.

### Dodatek: plynulejší pan/zoom a výraznější LOD (6. 10. 2026)

Malý posun uvnitř potvrzené oblasti se stejným filtrem a LOD neodesílá nový výpočet: canvas pouze přepočítá obrazové souřadnice. Výpočet připravuje rezervu 16 % kolem mapy, kontrolovaný viditelný výřez má rezervu 8 %. Worker uchovává jeden přesný výsledek pro stejnou sadu chunků a filtr; změna LOD pak mění pouze kreslicí geometrii. Nová oblast nebo filtr může stále vyžadovat výpočet.

Aktuální LOD: regional do z9 / 320 m, overview z10–11 / 80 m, medium z12–14 / 10 m, detail od z15 / přesná geometrie. Při rozdílném provozu se segment rozdělí na souvislé části se stejnými hodnotami; zjednodušují se jednotlivé části, nikoli přes hranice počtů či identit. Původní hrany a vzorky světla zůstávají zachované.

Jeden uchovaný výsledek a LRU výsledků sdílejí původní rozpočet 8 MiB; počet malých LRU položek je nejvýše 256. Kreslicí/datová/terénní RAM a HTTP politika se nemění. Rozpočet je odhad paměti, nikoli tvrdý limit celé JS haldy. Samostatná funkční a výkonová acceptance tohoto dodatku je na žádost uživatele odložená; starší označení DONE a měření níže patří předchozí verzi.

### Oprava skládání náhledu po čtvercích (7. 10. 2026)

Kreslicí chunky celého výřezu se načtou nejvýše ve čtyřech souběžných požadavcích před výpočtem přesného provozu. Mapa přijme jeden kompletní náhled, ne postupně rostoucí sadu čtverců. Dosavadní canvas zůstává během čekání; při chybě kreslicího chunku se neúplný náhled nepublikuje, přesný výpočet může pokračovat. Potvrzený výsledek nahradí náhled až po dokončení všech potřebných provozních dat. Nová generace zastaví další plánování starého výřezu, ale úspěšně načtená data zůstávají v omezené cache.

Přesné chunky se zpracovávají postupně (nejprve dostupné výsledky, potom bližší části), aby se nezvýšila paměťová zátěž. Paměťové limity ani politika HTTP cache se nemění. Velký výřez stále může dlouho počítat intenzitu; oprava odstraňuje čekání náhledu za každým přesným chunkem, neslibuje okamžitý výpočet celého PID. 82 automatických testů prošlo, včetně úplnosti náhledu před GTFS a potlačení neúplného náhledu. Starší acceptance/měření nelze považovat za měření této opravy.

### Blok 3C – klientské načítání terénu

Terénní cache používá celé hashované cesty, nikoli ID čtverců. Malá RAM LRU zůstává 4 MiB / 16 položek; profily aktuální oblasti se drží zvlášť a při opuštění oblasti se uvolní. Nejvýše dva chunky se načítají souběžně, stejné requesty sdílejí Promise. Chyba jednotlivého chunku nemaže již načtené okolní profily. Detail i legenda rozlišují načítání, chybu a neověřené místo; změna času světla chybu nezamaskuje.

Manifest se revaliduje při prvním použití, zapnutí focení a návratu do aplikace; při pan/zoom a změně světla se znovu nestahuje. Selhání chunku umožní jednou ověřit změnu manifestu a přejít na nové hashe. Změna datasetu (včetně návratu na starší verzi) zneplatní aktivní profily a opožděné odpovědi předchozí verze. Další informace: [Blok 3C](docs/BLOK3-TEREN.md#blok-3c--klient).

### Blok 3D – pravidelná GTFS aktualizace

Síťové operace při přechodné chybě mají nejvýše tři pokusy s čekáním 5 a 20 sekund. K hlavnímu běhu ve 4:07 přibývají záložní běhy v 5:07 a 6:07 pražského času. Záložní běh se přeskočí pouze tehdy, když živá produkce dokládá úspěšnou aktualizaci od dnešních 4:00 a zdroj pokrývá dnešek. Selhání buildu, testů, archivace i deploye tak dostane další celý pokus; trvalá chyba dat nebo testů se nikdy neobchází. Po třech ranních bězích zůstává možnost ručního spuštění.

Jednorázový bootstrap 6. → 7. října využívá kompletní **zkompilovaná** data starého Pages buildu, nikoli rekonstruovaný původní ZIP. `config/gtfs-bootstrap.json` připíná Actions artifact a obsahové SHA-256 metadat/geometrie/jízdních řádů. Z nich se zachovají pouze aktivní spoje předchozího dne dosahující přes půlnoc, s přesnou původní geometrií, časy a příznaky. Ověřený compiled archiv se uloží do samostatného Release; další běhy se neopírají o jednodenní životnost Actions artifactu. Pro novější feedy mají přednost běžné původní GTFS archivy. Regrese porovnává skutečné dojezdy se starým buildem; obecná regrese používá skutečný začátek aktuálního feedu.

Standardní Pages workflow stahuje a kontroluje aktuální GTFS, připravuje případné doplnění předchozího provozního dne, spouští testy a regrese, instaluje připnutý terén bez DEM a publikuje web. Původní ZIP, jeho SHA-256 a metadata se před deployem uloží do neměnně pojmenovaného Release `gtfs-v1-<začátek>-<sha256>`. Existující archiv se porovná, nepřepisuje. Chyba stahování, checksumu, testů nebo archivace zastaví deploy a ponechá poslední produkci. Archiv není závislý na Actions cache.

Aktuální feed je autoritativní pro vlastní platnost; z předchozího snapshotu se importují pouze služby chybějícího předchozího dne. Staré tripy, shapes, stops a services mají oddělená ID. Linky/dopravci sdílejí ID pouze při shodě údajů. První zobrazitelný občanský den zůstává začátkem nového feedu, ale výpočet může zahrnout jeho dojezdy z předchozího dne. Při opakované aktualizaci stejného začátku platnosti se zachová odkaz na potřebný starší snapshot. Výpadek delší než jeho pokrytí nebo první spuštění bez snapshotu zůstává přiznaně neúplné. Nejde o historické prohlížení všech minulých dnů.

### Blok 3E – závěrečná verifikace

Závěrečné kontroly a jejich omezení popisuje [report 3E](docs/BLOK3-ACCEPTANCE.md). Import původního předchozího GTFS zachovává jen aktivní spoje dosahující alespoň 24:00; spoje ukončené dříve první zobrazitelný občanský den neovlivní a nezvětšují mobilní jízdní řády.
