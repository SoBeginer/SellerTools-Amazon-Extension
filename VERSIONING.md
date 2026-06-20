# Versioning — SellerTools Amazon Extension

## Aktuální verze: 0.13.0

## Schéma: `MAJOR.MINOR.PATCH`

| Segment | Kdy zvýšit |
|---------|-----------|
| **MAJOR** | Zásadní přepis, breaking change, nová architektura |
| **MINOR** | Nová funkce přidána do extension (+1 za každou funkci) |
| **PATCH** | Bugfix, drobná úprava existující funkce, úprava UI/textu |

## Funkce (Minor = počet funkcí = 13)

1. Shipping Template Creator
2. Shipping Price Changer
3. Delete Shipping Templates
4. IBA Confirmation Automation
5. IBA Retool Search
6. Draft Feed Submission
7. Market Switcher
8. B2B Price Fixer
9. Console Log Download
10. Dry Run Mode
11. Multi-market Template Loading
12. Options / Settings Page
13. MCF Orders toggle / Account Profile settings

## Postup při vydání nové verze

1. Claude načte tento soubor
2. Zeptá se: **"Jde o novou funkci (minor), bugfix (patch), nebo breaking change (major)?"**
3. Podle odpovědi zvýší příslušné číslo v `manifest.json` a aktualizuje `Aktuální verze` zde
4. Při přidání nové funkce přidá ji do seznamu výše
