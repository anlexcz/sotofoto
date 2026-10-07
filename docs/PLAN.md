# Šotofoto – plán a otevřené úkoly

Aktualizováno: 7. října 2026.

Tento dokument je kanonický backlog. `README.md` popisuje to, co aplikace skutečně umí; `PROJEKT.md` popisuje současnou implementaci. Historická měření a acceptance reporty jsou v `archive/`.

## Stav hlavních bloků

### P1 / P2 / Blok 2 – hotovo

Prostorové chunkování, lazy loading, binární jízdní řád, Web Worker, Canvas, LOD kreslení, omezené RAM cache, cache výsledků, okamžitý předběžný náhled tras a ochrana proti stale odpovědím jsou součástí současné implementace. Historické benchmarky a acceptance výstupy jsou v `archive/`.

### Blok 3 – implementováno, provozní acceptance ještě otevřená

Implementace zahrnuje verzovaný terén oddělený od GTFS, samostatnou obnovu terénu, automatickou denní aktualizaci GTFS, archiv raw snapshotů, doplnění předchozího provozního dne, validaci, regresní testy a recovery běhy.

K 7. 10. 2026 prošla simulace přechodu i živá kontrola současné produkce. Blok ale nelze definitivně označit DONE před prvním skutečným scheduled během 8. 10. kolem 04:07 Europe/Prague a ověřením následujícího reálně publikovaného raw feedu. Recovery běhy jsou 05:07 a 06:07. Samostatně zbývá fyzická kontrola na telefonu.

## Nejbližší úkoly

### U1 – dokončit provozní acceptance Bloku 3

- ověřit první skutečný scheduled běh 8. 10. 2026 kolem 04:07,
- při selhání ověřit recovery 05:07 / 06:07,
- ověřit nasazený výsledek a následující skutečně publikovaný raw GTFS feed,
- provést fyzickou kontrolu na telefonu: detail, pan/zoom, světlo a terén při rychlém pohybu.

### U2 – pamatovat čas při přechodu mezi body

Při práci s více místy nemá uživatel zbytečně ztrácet zvolený čas světla. Přesné chování je potřeba před implementací svázat s pravidlem, že čas nasvícení a provozní časový filtr jsou dvě samostatné hodnoty.

### U3 – pouze průjezdy s dobrým světlem

V detailu místa přidat možnost zobrazit pouze průjezdy s příznivým nasvícením. Hodnocení se musí dělat podle skutečného plánovaného času každého průjezdu, nikoli pouze podle času posuvníku. Primární požadavek vznikl pro autobusy; návrh má zachovat všechny průjezdy v datech a pouze filtrovat jejich zobrazení.

### U4 – přepracovat barevnou škálu nasvícení

Současná škála hodnotí použitelné boční světlo příliš přísně. Cíl: čelní světlo tmavě zelené, přibližně do 60° světle zelené, potom plynule přes žlutou a oranžovou; červená až pro převážně nasvícený zadek. Přesné hranice před implementací doladit a sjednotit mapu, legendu i detail.

## Další funkční backlog

### Detail místa a průjezdy

- zachovat výběr okolí bodu a všechny relevantní směry i souběžné druhy dopravy,
- hlídat deduplikaci průjezdů bez ztráty smyček a vzácných průjezdů,
- dále zlepšit mobilní panel detailu a práci s dlouhým seznamem průjezdů,
- případné dávkování průjezdů musí korektně pokračovat přes půlnoc.

### Filtry a ovládání

- dále zlepšovat mobilní full-screen výběry linek a dopravců, hledání s diakritikou a štítky,
- při ručním výběru času používat praktické kroky po 5 minutách,
- zachovat možnost současně zvolit denní i noční provoz, jen jeden z nich, nebo ani jeden; nejde o jeden třípolohový přepínač,
- žádný filtr nesmí fyzicky odstranit výjezdy, zátahy ani vzácné průjezdy z dat.

### Intenzita provozu

Pokračovat v ladění kategorií tak, aby celodenní přehled odpovídal běžnému intervalu a nebyl zkreslen nočními hodinami nebo krátkým shlukem spojů. Cílové uživatelské kategorie vycházejí přibližně z intervalů 5 / 10 / 30 / 60 / 120 minut a řidšího provozu. Noční doprava může používat jednotnou nejtenčí kategorii. Změna nesmí rozbít již zavedenou logiku občanského dne a přechodů přes půlnoc.

### Sdílené odkazy

Krátký odkaz na místo má zůstat omezený na polohu, zoom a provozní filtry (zejména linky a dopravce); vzhled mapy se do něj neukládá. Samostatný odkaz na plán může nést datum, provozní čas a nezávislý čas světla. Případné další změny URL musí zachovat zpětné načtení starších odkazů.

### Výkon a mobil

- průběžně ověřovat na skutečném slabším telefonu, ne pouze desktopovým emulátorem,
- nové funkce nesmějí vrátit načítání celého PID při startu,
- pan/zoom v již načtené oblasti má maximálně využívat existující RAM/HTTP cache a nemá bezdůvodně přepočítávat jízdní řád,
- adaptivní omezení detailu pro slabá zařízení je možné až podle reálných měření, ne preventivně.

## Nejnižší priorita / odložené experimenty

### Zástavba a lokální stínění

Definitivně odloženo na nejnižší prioritu, ale ponecháno v backlogu pro případ, že se v budoucnu zásadně zlepší dostupná data nebo metoda.

Praktický experiment ukázal, že dostupná data neumožňují spolehlivě určit výšku většiny budov, významná část odhadnutelných výšek je pro fotografické plánování nepřesná a dostatečně spolehlivý stín lze určit jen přibližně u 3 % budov. Experimentální build byl navíc výpočetně příliš náročný. Současný projekt proto zůstává u terénního horizontu a zástavbu nepoužívá.

Znovu otevírat pouze tehdy, pokud se objeví výrazně kvalitnější zdroj výšek / 3D zástavby nebo zásadně jednodušší a levnější metoda. Pokud by se téma někdy obnovilo, geografická data musí zůstat oddělená od GTFS a chybějící údaje se nesmějí prezentovat jako potvrzené dobré světlo.

## Později / výzkum

- další práce s Mapy.com/Panoramou pouze pokud bude existovat spolehlivé a udržitelné řešení; současný obyčejný odkaz na souřadnice je hotový základ,
- případná real-time data držet striktně oddělená od jízdního řádu a interpolovaného odhadu.

## Invarianty pro každý další zásah

- občanský den Praha a korektní přechody přes půlnoc,
- čas nasvícení a časový filtr provozu jsou samostatné hodnoty,
- výjezdy, zátahy a vzácné průjezdy zůstávají dostupné,
- potlačení mapového popisku nesmí odstranit spoj z dat,
- jízdní řád, interpolovaný odhad, počasí a případná real-time data musí být rozlišitelné,
- chybějící terén, počasí nebo případná budoucí data zástavby se nesmějí prezentovat jako ověřené dobré podmínky,
- priorita je mobilní použitelnost, nízké nároky na zařízení a řešení bez zbytečné infrastruktury.
