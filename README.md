# Šotofoto

Interaktivní mapa PID pro plánování focení dopravy. **Web:** https://anlexcz.github.io/sotofoto/

## Co umí

- Všechny druhy dopravy obsažené v PID GTFS; kombinovatelné filtry linek, dopravců a druhů dopravy.
- Konkrétní datum v platnosti balíčku a libovolný časový rozsah, včetně přechodu přes půlnoc. Stejný čas od/do znamená 24 hodin.
- Tloušťka společných úseků podle četnosti pravidelného provozu po aplikaci všech filtrů. Výchozí zobrazení sčítá oba směry; lze zobrazit protisměry vedle sebe nebo filtrovat místní směry S/SV/V/JV/J/JZ/Z/SZ.
- Kliknutí kdekoliv poblíž trasy: průjezdy v okolí 20–150 m, linka, cílová zastávka, dopravce, místní směr a azimut, odhad času a odjezd z předchozí zastávky. Celý den nebo vybraný čas.
- Režim focení: celé vyfiltrované trasy se obarví podle slunce ve zvoleném okamžiku. Zelená = čelo, přes žlutou k oranžové = boční světlo, několik stupňů za bokem přechod do červené = světlo zezadu / protislunce. Pod obzorem šedá. Posuvník po 5 minutách od hodiny před východem do hodiny po západu, s označeným východem a západem. Lze zadat libovolný přesný čas; rozsah se v případě potřeby rozšíří. Posuvník nemění filtry ani počty spojů.
- Poloha slunce v době skutečného průjezdu, počty průjezdů s příznivým nasvícením po hodinách i ráno/poledne/odpoledne. Kliknutí na sloupec nastaví danou hodinu pro filtr provozu.
- Tloušťka tras se přizpůsobuje přiblížení, aby při oddálení nezakrývaly mapový podklad.
- Barvy podle druhu dopravy, linky, dopravce, intenzity nebo jedna vlastní barva; průhlednost. Tlačítko ⓘ vedle režimu focení otevírá legendu četnosti a aktuálních barev; v režimu focení vysvětluje nasvícení. Zavření tlačítkem, křížkem, klepnutím mimo nebo Escape.
- CSV export průjezdů a sdílení odkazu: URL uchovává datum, čas, filtry, pohled mapy, vybrané místo, režim focení, jeho nastavený čas a režim barev.
- Responzivní ovládání pro mobil; data podle výřezu mapy, omezené cache a výpočty ve Web Workeru. Při startu se nestahuje celý PID.

## Data a pravidla výpočtu

Zdroj: [PID GTFS](https://data.pid.cz/PID_GTFS.zip), dokumentace a licence: [Otevřená data PID](https://pid.cz/o-systemu/opendata/). Autor dat ROPID / PID, licence dle zdroje CC BY. Data jsou upravena: indexace tras a jízdních řádů, zaokrouhlení geometrie na pět desetinných míst, zjednodušení sdílených větví s tolerancí 2 m při zachování křižovatek, konců tras a hranic typů provozu, agregace průjezdů, interpolace časů. Nejde o skutečné vypravení ani živé polohy vozidel. Konkrétní typy vozidel nejsou odvozovány.

Dopravce se bere z `trips.sub_agency_id`, název z rozšíření PID `route_sub_agencies.txt`; obecné `agency.txt` uvádí společný PID. Kalendář respektuje `calendar.txt` i přidání/odebrání služeb v `calendar_dates.txt`.

Datum je **občanský den v Praze**, nikoliv pouze GTFS provozní den. Spoje předchozího dne s časy nad 24:00 se započtou do časů po půlnoci. U rozsahu přes půlnoc se načítají i služby následujícího dne. Na začátku platnosti feedu nelze rekonstruovat předchozí den; na konci následující den. Tyto hranice aplikace zobrazuje. Na dni změny letního času samotné GTFS wall-clock časy nerozlišují opakovanou hodinu.

Společný úsek je shodná dvojice po sobě jdoucích bodů trasy po zaokrouhlení. Jsou-li dvě téměř shodné trasy v GTFS digitalizovány odlišně, mohou zůstat samostatné. Průjezdy pro intenzitu úseku se počítají **v jeho středu** v intervalu `[od, do)`; u dlouhých úseků se přesný čas ve vybraném bodě může lišit. Překrývající se úsek má v režimu linka/dopravce barvu prvního přispívajícího spoje, nikoliv směs barev; podrobnosti poskytne seznam průjezdů.

Čas mezi zastávkami se odhaduje podle `shape_dist_traveled`: odjezd z předchozí zastávky → příjezd do další. Nezahrnuje stání v předchozí zastávce. Zastávkový čas je čas odjezdu. Příznak `≈` označuje odhad; vždy je k dispozici předchozí zastávka a její odjezd. Nezobrazuje se neobsloužený začátek/konec shape. Při chybějící shape se použijí označené přímé spojnice zastávek, při chybějících vzdálenostech monotónní projekce zastávek na trasu.

Kliknutí zahrnuje nejbližší body tras uvnitř zvoleného poloměru. Navazující segmenty stejného průjezdu se spojí; smyčka může vytvořit více průjezdů stejného spoje. Může se započítat i souběžná ulice či kolej, zejména při velkém poloměru. Směr je azimut nejbližšího segmentu, proto na ostrém oblouku doporučujeme kliknout přímo do zamýšleného místa záběru.

Výpočet slunce používá astronomickou aproximaci a časovou zónu `Europe/Prague`. Režim focení hodnotí úhel mezi směrem jízdy a azimutem slunce, bez volby strany vozu. Spektrum: 0° zelená, 45° žlutá, 85–90° sytě oranžová, 98° červená, světlo zezadu tmavě červené. Slunce se středem pod geometrickým obzorem je šedé. Společná čára v obou směrech ukazuje **lepší z přítomných směrů** podle aktivního filtru provozu, nikoliv zaručené nasvícení pro oba. Automatické rozdělení směrů není zapnuto; již existující ruční rozdělení protisměrů lze použít a pak má každý vlastní barvu.

Rozsah časové osy a značky východu/západu se počítají podle středu aktuálního výřezu mapy. Astronomický východ/západ používá výšku středu slunce −0,833° (běžná aproximace refrakce a horního okraje slunečního disku), takže šedá pro geometrický střed může přetrvat několik minut po značce východu. Jednotlivé úseky se barví podle své skutečné polohy. Posuvník jen překresluje nasvícení, nepřepočítává provozní filtr, intenzitu ani seznam průjezdů. Ruční zadání času mimo výchozí rozsah rozšíří osu, aby byl zvolený čas dosažitelný. Kliknutý seznam a jeho doporučení stále hodnotí **skutečný plánovaný čas každého spoje**, nikoliv okamžik z posuvníku.

Jde o geometrické doporučení pro přímé slunce. Počasí ukazuje samostatná předpovědní vrstva; dostupný terénní obzor může označit stín. Přesné stíny budov, vegetaci, tunely ani fyzickou dostupnost místa neověřuje. Ráno 5–10, poledne 10–14, odpoledne 14–20; noční spoje zůstávají v seznamu a hodinovém grafu.

## Spuštění a ruční aktualizace

Stačí Python 3.12+ a Node 22+ pro testy, žádné balíčky se neinstalují.

```bash
npm test
python scripts/build_data.py
# Volitelný terén: pip install numpy rasterio; python scripts/build_terrain.py
python -m http.server 8000 --directory dist
```

Pro vlastní stažený balíček: `python scripts/build_data.py --input /cesta/PID_GTFS.zip`. Výstup je v `dist/`, surový ZIP ani generovaná data se necommitují. Komprimovaný dataset je zpracováván přímo v prohlížeči pomocí `DecompressionStream`; vyžaduje moderní Chrome, Firefox či Safari. Start načítá pouze metadata a prostorový index (na feedu 6. 10. 2026 dohromady přibližně 0,71 MB), pak balíčky aktuální oblasti. Geometrie je JSON, zastávkové časy kompaktní uint32 buffer. Výchozí mapa má zoom 13; sdílené odkazy zachovávají svůj zoom. Podrobnosti: [technická dokumentace](docs/PROJEKT.md), [měření P2](docs/P2-MERENI.md).

Workflow `.github/workflows/pages.yml` spouští unit i produkční regresní testy, stáhne aktuální GTFS, zpracuje jej a nasadí na GitHub Pages při commitu na `main` nebo ručně pomocí **Actions → Build and publish Šotofoto → Run workflow**. Nemá časový plán. V nastavení repozitáře musí být **Pages → Source → GitHub Actions**. Pokud automatické zapnutí Pages nemá oprávnění, je nutné tento přepínač nastavit jednou ručně.

Leaflet 1.9.4 je přibalen lokálně (BSD-2-Clause, viz `public/vendor/LICENSE`). Mapové dlaždice poskytuje OpenStreetMap, fonty Google Fonts; bez nich aplikace použije systémové písmo. Výpočty a filtry nepotřebují backend.

### Počasí a terén

V režimu focení se načítá počasí pro vybraný bod, jinak pro střed mapy. Detail místa ukazuje dohlednost, celkovou a nízkou oblačnost, srážky a přímé normálové sluneční záření v čase posuvníku. Zdroj je ČHMÚ ALADIN Seamless přes Open-Meteo (1km česká doména, hodinové hodnoty, předpověď tří dnů). Jde o modelovou předpověď, nikoli živé měření; místní mlhu může minout. Mimo dostupný čas se ukazuje chybějící předpověď. Čas detailu lze změnit i na mobilu, nezávisle na filtru průjezdů. Počasí nemění barvy ani počty spojů. API nepotřebuje klíč; bezplatný endpoint je pro nekomerční použití, má limity a vyžaduje uvedení zdroje. Požadavky jsou zpožděné o 400 ms a data sdílená pro přibližně kilometrové buňky se uchovávají 30 minut (nejvýše 30 oblastí).

`scripts/build_terrain.py` stáhne veřejné dlaždice Copernicus DEM GLO-30 z AWS a předpočítá obzory poblíž středů úseků. Výpočet používá raster zjednodušený na 3 obloukové sekundy (přibližně 90 m), sdílené buňky ~220 × 280 m, azimuty po 5° a vzorky do vzdálenosti 20 km. Výška cíle je 1,5 m nad modelem, zohledňuje se zakřivení Země. Nejde o přesný model stínů domů, stromů, zářezů nebo mostů; původní Copernicus je model povrchu včetně vegetace a staveb. Úseky se sluncem zakrytým obzorem jsou v režimu focení šedé, i když už nastal astronomický východ. Průjezdy a doporučení respektují dostupný terénní obzor; chybějící profil se nepovažuje za prokázaný stín. Detail výslovně ukazuje neověřený terén. Značky východu/západu na časové ose zůstávají astronomické.

Terén tvoří geografické balíčky s manifestem `terrain-index.json`; běžná mapa je nestahuje, focení načítá výřez a detail okolí bodu. Posuvník nepotřebuje výškové API ani další síťové požadavky. GitHub Actions instaluje `numpy` a `rasterio` a po GTFS sestaví pouze chybějící geografické profily; již spočítané výsledky zachovává Actions cache. Výpadek počasí nebo načtení terénu neblokuje mapu. Zdroj výšek: Copernicus DEM, © DLR e.V. 2010–2014 and © Airbus Defence and Space GmbH 2014–2018; data upravena pro Šotofoto. Zdroj počasí: Open-Meteo / ČHMÚ, CC BY 4.0.

### Plošná vrstva počasí

Režim focení automaticky zapíná překryv přes celý výřez mapy. Modrošedá ukazuje horší dohlednost (síla roste pod 10 km, nejvýraznější při mlze), šedé zastření oblačnost se slabým přímým sluncem. Dobré podmínky jsou průhledné. Noc nevyvolává šedé zastření jen kvůli nulovému slunečnímu záření. Počasí je pod trasami a značkami, nad mapovým podkladem; nemění barvy tras ani intenzitu spojů. V legendě lze vrstvu skrýt. Volba se ukládá do odkazu spolu s mapou.

`src/weather-layer.js` načítá ALADIN pro pravidelnou geograficky zarovnanou síť celého výřezu, nikoli jen pro vybraný bod. Minimum je přibližně 1 km; na širších výřezech se vzorky adaptivně rozestupují, maximálně 64 bodů na výřez. Skutečný rozestup je uveden v legendě. Plynulý překryv používá bilineární interpolaci, která nezvyšuje přesnost modelu a může vyhlazovat lokální mlhu. Údaje všech bodů přicházejí v jedné dávce Open-Meteo; poskytovatel může počítat každý bod proti limitům API. Načítání se spustí 600 ms po ustálení mapy. Cache obsahuje nejvýše 256 bodů na 30 minut; změna času jen překresluje uložené hodinové hodnoty. Pozdní odpověď předchozího výřezu nesmí přepsat nový výřez nebo znovu zapnout vypnutou vrstvu.

Chybějící předpověď, nepokrytá oblast a chyba API jsou šrafované, nikoli prezentované jako dobré podmínky. Legenda ukazuje načítání, neúplné pokrytí nebo chybějící čas. Detail místa ponechává přesné číselné hodnoty. API nevyžaduje klíč ani server. Testy pokrývají rozsah sítě, omezení počtu vzorků, průhlednost, noční chování a interpolaci chybějících dat.

### Detail místa a ovládání v terénu

Kliknutí vybírá okolí bodu bez přepínání segmentů. Do 25 m od trasy zachovává původní kliknutí (důležité u křižovatek), dál se přichytí k nejbližší zobrazené trase do 150 m. Okolí je 40 m, v členité geometrii 55 m, nezávisle na zoomu. Kruhem a zvýrazněním jsou vyznačené zahrnuté části tras. Sousední segmenty stejného průjezdu se deduplikují; pozdější návrat do oblasti je samostatný průjezd. Povrchová doprava má při souběhu přednost před metrem; samostatný filtr metra vrátí metro v obou směrech.

Mobilní panel začíná v dolní třetině (s minimální výškou pro dva průjezdy), zvětšuje se přes celou obrazovku tlačítkem nebo tažením za hlavičku. Rozbalení počasí či statistik jej zvětší, sbalení nemění zvolenou výšku. Souřadnice lze zkopírovat klepnutím. Jednotlivé průjezdy mají čas, linku, cíl a značku světla v prvním řádku, předchozí zastávku s časem ve druhém; dopravce a azimuty jsou po rozbalení.

„Teď“ zachytí dnešek a začátek pět minut zpátky; opětovným stisknutím čas obnoví. „Od času“ mění den celé aplikace a začátek seznamu, „Celý den“ zobrazí vybraný civilní den. Budoucí seznam je dostupný do konce následujícího dne v rozsahu platnosti GTFS. Po půlnoci používá 00:00 a oddělovače dnů. Nejde o živá zpoždění. První dávka cílí na dvě hodiny / maximálně 50 řádků; u řídkého provozu rozšíří okno nejvýše na šest hodin. Další dávky načítá u konce seznamu nebo tlačítkem. Výpočet denní statistiky není omezen dávkou seznamu.

„Kdy fotit“ počítá celý vybraný den podle filtrů. Spojuje obsazené pětiminutové intervaly vhodných průjezdů s mezerou nejvýše 15 minut; řadí je podle počtu vhodných spojů, poté podílu vhodných a kratší délky. Ukazuje počet vhodných / všech průjezdů. Hodnotí pouze slunce a dostupný terén, bez počasí. Tlačítko doporučení nastaví začátek seznamu i světlo mapy.

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

P2 je dokončené a nasazené: data se načítají podle oblasti, cache jsou omezené a terén má samostatnou geografickou cache. Na produkci bylo ověřeno i úspěšné načtení předpovědi v detailu a mapové vrstvě. Výsledky měření, mobilní zpětná vazba a limity ověření jsou v [reportu P2](docs/P2-MERENI.md#závěrečná-kontrola-a-uzavření-p2--6-10-2026). Tlačítka −5 / +5 minut a odkaz na bod v Mapy.com jsou odložené samostatné úpravy UI.

## Návrat před P3 – 6. 10. 2026

Zástavba a lokální stínění P3 byly na žádost uživatele odstraněné kvůli potlačení barev nasvícení při neověřených datech. Aplikace opět používá původní výpočet Slunce a terénu z dokončeného P2. P1/P2, počasí i provozní filtry zůstávají zachované.
