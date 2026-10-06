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

Publikace používá nezměněné standardní `.github/workflows/pages.yml` s unit testy a produkční regresí. Skutečný výsledek nasazení a živé kontroly bude při předání uveden v závěrečné zprávě; offline výsledky výše samy o sobě nejsou ověřením produkce.
