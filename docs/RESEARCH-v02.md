# Research 0.2 — pracownia leja podudzia

## Potwierdzony zakres i brakujące dowody
Użytkownik wskazał pracownie protetyczne projektujące leje podudzia i eksport STL/3MF do dalszego CAM, bez adaptera i CNC. Może dostarczyć skany i ocenę protetyka, ale nowych skanów jeszcze nie przekazano. To ustalenia projektu, nie dowód popytu lub klinicznej gotowości.

Nie ustalono gotowości do zakupu, ceny, oszczędności czasu ani potrzeb reprezentatywnej próby polskich pracowni. Funkcje konkurencji nie są dowodem sprzedaży. Rekomendacje poniżej są syntezą projektową.

## Odczytane źródła i ich ograniczenia
Badanie EG sockets z 2025 r. podkreśla istotny, ceniony przez użytkowników udział klinicysty przy indywidualizacji projektu. Nie przenosimy jego wyników komfortu ani nieinferiorności na OrthoSculpt.[7]

Badanie skanera z 2024 r. wskazuje potrzebę standaryzacji układów współrzędnych kikuta. Badano modele kończyn oraz konkretny sprzęt; nie jest to pomiar dokładności OrthoSculpt ani walidacja żywych kończyn.[8]

Badanie powtarzanych pomiarów objętości wykazało różnice użyteczności i niezawodności pomiędzy konkretnymi połączeniami skanera i oprogramowania, przy ograniczonym doświadczeniu operatorów. Uzasadnia to ocenę całego procesu, nie samych rozszerzeń plików.[9]

Producent Canfit dokumentuje zachowywanie pomiarów/korekt i śledzenie zmian. To dowód podaży funkcji, nie niezależny dowód skuteczności lub popytu.[1]

Program szkoleniowy Canfit obejmuje taśmy/pomiary oraz raportowanie. To również dowód zakresu narzędzia, nie badanie użytkowników.[2]

## Kierunek produktu — synteza
| Priorytet | Kryterium techniczne |
|---|---|
| Jawna strona i rama | R/L bez odbicia, X ku prawej pacjenta, zapis punktów i macierzy; odporność na retriangulację |
| Referencja i raport różnic | Identyczne Z, rzeczywiste CAD/baza/taśma/AP/ML/pole; bez interpolacji dowodów i mapy nacisku |
| Dziennik i plik rewizji | Rewizja w raporcie/nazwie pliku, parametry, brak starych wyników przedstawianych jako aktualne |
| Ochrona pracy | Ostrzeżenie o niezapisanych zmianach, jawny zapis zamiast cichego kasowania |
| Prywatność | Szyfrowany projekt i brak cichego autosave danych zdrowotnych; jawne ostrzeżenia dla plaintext/raportu |
| Kontrole geometrii | FAIL/UNKNOWN z przyczyną i budżetem; minimum grubości niezależne od offsetu |
| Ocena specjalisty | Raport konkretnej rewizji, bez pozornego kliknięcia zwalniającego wyrób do produkcji |

Dziennik 0.2 nie jest pełnym odtwarzalnym archiwum wszystkich siatek ani podpisem cyfrowym. Bieżąca geometria i baza są zapisywane; ważne warianty należy zachowywać jako osobne pliki. Pełny branching/replay, swobodna linia obrzeża i adnotacje przymiarki są osobnymi funkcjami, nie należy ich deklarować na podstawie dziennika.

## Pilotaż — propozycja, nie wykonana walidacja
1. Przyjąć wyłącznie legalnie udostępnione skany bez identyfikujących nazw i zbędnych danych. Pseudonimizacja nie gwarantuje anonimizacji; materiały nadal wymagają ochrony.
2. Opisać skaner/wersję eksportu, jednostki, stronę, pozycję skanowania, liner, poziomy i sposób pomiaru taśmą. Protetyk ustala kryteria, nie aplikacja na podstawie badań innego skanera.
3. Wykonać cały workflow na lewej i prawej kończynie; osobno przypadki otwarte, odwrócone, barwne, gęste i nierównomierne oraz powtarzane skany.
4. Mierzyć rzeczywisty czas zadania, błędy, prośby o pomoc, utratę pracy i interpretację ostrzeżeń. Nie zastępować tego deklaracją łatwości obsługi.
5. Protetyk dokumentuje ocenę konkretnej rewizji; zmiana geometrii wymaga nowej oceny. Zewnętrznie sprawdzić skalę, orientację, grubość, samoprzecięcia, materiał, mechanikę, zmęczenie i dopasowanie.
6. Osobno zatwierdzić intended use, analizę ryzyka i ścieżkę regulacyjną z kompetentną osobą. Ten dokument nie ustala klasy, CE ani zgodności prawnej.

## Pochodzenie
Research wykonał niezależny subagent i parent. Parent ponownie odczytał XML pełnego tekstu z Europe PMC, abstrakt PubMed API i strony producenta/szkolenia. PMC HTML zwracał reCAPTCHA, nie użyto go jako treści artykułu. Cytaty weryfikuje ledger; ograniczenia badań i brak badań rynku są jawne.

## Sources

[1] https://qwadra.com/solution/canfit-design-software
    > "Every measurement and clinical correction is accurately captured, and patient changes can be tracked over time."
[2] https://academy.vorum.com/courses/LaunchPAD-Canfit-Basics
    > "Sticky Measurements and Tapes"
    > "Canfit Additional Tools and Features - Reporting Reporting Tool"
[7] https://www.ebi.ac.uk/europepmc/webservices/rest/PMC12370269/fullTextXML
    > "Both quantitative and qualitative results indicated how clinician input remains essential and is valued by prosthesis users."
[8] https://www.ebi.ac.uk/europepmc/webservices/rest/PMC11014038/fullTextXML
    > "Therefore, future research should describe a standardized method for the definition of coordinate systems of residual limbs."
[9] https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&id=34932511&retmode=xml
    > "For measuring residual limb volume in TT amputees, Omega software (state version 12.2) combined with the Rodin4D scanner was more usable and reliable than the Rodin 4D or Biosculptor systems, when operated by staff with limited experience and training."
