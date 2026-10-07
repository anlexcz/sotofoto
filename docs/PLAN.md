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

### U5 – směr jízdy přímo v režimu focení

Na barevných úsecích režimu focení zobrazit subtilní šipky ve stejné barvě jako hodnocení nasvícení, aby bylo na první pohled jasné, pro který směr jízdy daná barva platí. U překrývajících se směrů má být nahoře / vizuálně prioritní směr s lepším nasvícením. Pokud je například jeden směr zelený a opačný červený, uživatel má primárně vidět zelenou variantu. Návrh nesmí skrýt existenci opačného směru ani odstranit jeho průjezdy z dat.

## Další funkční backlog

### Zastávky jako mapová vrstva

Přidat samostatně přepínatelnou vrstvu zastávek podobně jako další mapové vrstvy. Zobrazení musí být použitelné i při velkém počtu zastávek a nesmí zbytečně zatěžovat mobil.

### Detail místa a výchozí čas průjezdů

Při otevření nového místa má detail standardně nabídnout co nejpraktičtější časový pohled:

- pokud má uživatel explicitně nastavený hlavní provozní časový filtr, detail se řídí jím,
- pokud žádný časový filtr explicitně nastavený není, výchozí pohled má být „teď“,
- uživatel může následně přepnout na jiný čas nebo celý den jako dosud.

Před implementací je potřeba přesně určit, jak aplikace rozezná „výchozí / nic nenastaveno“ od explicitně nastaveného časového filtru.

### Detail konkrétního průjezdu – sousední zastávky

Po rozkliknutí konkrétního průjezdu zobrazit na mapě předchozí a následující zastávku daného spoje. U bodů zobrazit subtilní popisek, ideálně ve formátu `čas – název zastávky`, aby bylo rychle vidět, odkud vozidlo přijíždí a kam pokračuje. Popisky mají být dočasné a svázané s vybraným průjezdem, aby běžnou mapu nezaplňovaly.

### Mobilní detail – po zavření znovu částečný panel

Pokud uživatel na mobilu roztáhne detail místa na celou obrazovku, zavře jej křížkem a následně otevře jiné místo, nový detail se má znovu otevřít ve výchozí částečné výšce. Stav full-screen nemá přežívat zavření detailu.

### Dávkování seznamu průjezdů podle počtu

Nahradit nebo doplnit současné pevné časové okno praktičtějším limitem podle počtu výsledků. První dávka má mít maximálně přibližně 30 průjezdů. Na hustém místě se tak nezobrazí zbytečně dlouhý seznam; na řídkém místě se naopak mají rovnou ukázat všechny zbývající relevantní průjezdy až přibližně do konce nočního provozu / ranního přechodu kolem 3:30–4:00, pokud se limitu 30 nedosáhne. Další průjezdy lze donačíst na vyžádání.

Před implementací přesně svázat hranici s existující logikou občanského dne a GTFS spojů nad 24:00; nesmí vzniknout nový skrytý „provozní den“, který by rozbil současná pravidla.

### Grafické zpřehlednění detailu průjezdu

Po rozkliknutí konkrétního spoje přepracovat prezentaci podrobností tak, aby byly důležité údaje vizuálně seskupené a rychle čitelné. V tomto hlubším detailu je přijatelné mírné zvětšení panelu výměnou za lepší orientaci.

### Obecná pravidla detailu a průjezdů

- zachovat výběr okolí bodu a všechny relevantní směry i souběžné druhy dopravy,
- hlídat deduplikaci průjezdů bez ztráty smyček a vzácných průjezdů,
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

## Budoucí real-time a databáze vozidel

Tato větev souvisí až s budoucím napojením real-time dat a nemá se míchat do současného jízdního řádu / interpolovaného odhadu.

### Databáze PID vozidel

Rozšířit současný zdroj / proxy seznamu autobusů na obecnou databázi PID vozidel použitelnou pro párování s real-time daty. U vozidla počítat minimálně s evidenčním číslem, značkou, typem/modelovou řadou a případným podtypem nebo přesnější variantou názvu. Datový model navrhnout tak, aby nebyl omezen jen na autobusy, pokud budou v budoucnu dostupná data i pro další druhy dopravy.

### Zobrazení konkrétního vozidla

Po napojení real-time dat zobrazit vedle linky evidenční číslo skutečně přiřazeného vozidla. Evidenční číslo má být klikatelné a otevřít v nové kartě detail konkrétního vozu. V detailu průjezdu zobrazit značku, typ a případný podtyp vozidla.

### Dopravce linky vs. dopravce vozidla

Pokud dopravce konkrétního vozidla odpovídá dopravci výkonu/linky, další údaj nezobrazovat. Pokud se liší například kvůli subdodávce, zobrazit navíc skutečného dopravce vozidla. Je potřeba jasně odlišit plánovaného dopravce z GTFS od real-time / databázového provozovatele konkrétního vozidla.

### Subdodávky ve filtrech dopravců – otevřená otázka

Před implementací real-time vrstvy rozhodnout, zda a jak se mají subdodavatelé / skuteční provozovatelé vozidel promítnout do filtrů mapy. Varianty mohou být oddělený filtr skutečného provozovatele, rozšíření současného filtru dopravce nebo pouze informační údaj v detailu. Nesmí dojít k tomu, že real-time informace změní význam současného GTFS filtru bez jasného označení.

## Nejnižší priorita / odložené experimenty

### Zástavba a lokální stínění

Definitivně odloženo na nejnižší prioritu, ale ponecháno v backlogu pro případ, že se v budoucnu zásadně zlepší dostupná data nebo metoda.

Praktický experiment ukázal, že dostupná data neumožňují spolehlivě určit výšku většiny budov, významná část odhadnutelných výšek je pro fotografické plánování nepřesná a dostatečně spolehlivý stín lze určit jen přibližně u 3 % budov. Experimentální build byl navíc výpočetně příliš náročný. Současný projekt proto zůstává u terénního horizontu a zástavbu nepoužívá.

Znovu otevírat pouze tehdy, pokud se objeví výrazně kvalitnější zdroj výšek / 3D zástavby nebo zásadně jednodušší a levnější metoda. Pokud by se téma někdy obnovilo, geografická data musí zůstat oddělená od GTFS a chybějící údaje se nesmějí prezentovat jako potvrzené dobré světlo.

## Později / výzkum

- další práce s Mapy.com/Panoramou pouze pokud bude existovat spolehlivé a udržitelné řešení; současný obyčejný odkaz na souřadnice je hotový základ.

## Invarianty pro každý další zásah

- občanský den Praha a korektní přechody přes půlnoc,
- čas nasvícení a časový filtr provozu jsou samostatné hodnoty,
- výjezdy, zátahy a vzácné průjezdy zůstávají dostupné,
- potlačení mapového popisku nesmí odstranit spoj z dat,
- jízdní řád, interpolovaný odhad, počasí a real-time data musí být rozlišitelné,
- chybějící terén, počasí nebo případná budoucí data zástavby se nesmějí prezentovat jako ověřené dobré podmínky,
- priorita je mobilní použitelnost, nízké nároky na zařízení a řešení bez zbytečné infrastruktury.
