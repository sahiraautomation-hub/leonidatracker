# Content backlog

Topics not yet on the site. Pick from the top when nothing more urgent (a newly confirmed cheat code or a needed correction) is waiting. Remove a line once its guide is published. Add new ideas at the bottom.

## Cheat codes: all 61 listed (re-check every run)
All 61 codes are in `data/cheats.json`. Nothing is left to add, but check every run that the listed codes still match.

Note (2026-11-28): the last 34 codes were added on this date. GamesRadar (updated 27 November) and GTA BOOM (updated 26 November) now print all 61, and both match GTABase input for input. Both had held these 34 back as unknown for days while GTABase already showed them, which is why they are counted as separate sources. op.gg and gtabites print the same 61 and were not counted. None of these pages says how the codes were obtained or tested. PowerPyx, PC Gamer, TrueAchievements, Red Bull, Vice, Insider Gaming and G2A still marked the 34 as unknown on this date. All 61 sequences are unique and none is the start of another.

Each run: re-read GamesRadar and GTA BOOM first. If PowerPyx, PC Gamer or another outlet that tests codes prints a DIFFERENT sequence for any cheat, set that cheat's `code` back to `null`, log a "Correction:" entry and say that sources differ. Known slips elsewhere: Dexerto appeared to print an extra press on Cycle Weather and Raise Wanted Level (read from a cut-off fetch, so check it), and iGeeksBlog prints a different Vehicle Force and gives Pause Time of Day the Cycle Weather code. Reading tip: the GTABase page is long and automated fetches cut off before the later spawns, time cheats and filters.

Re-check (second run on 2026-11-28): GamesRadar (updated 27 November) and GTA BOOM (updated 26 November) were read in full and all 61 sequences still match. PowerPyx (17 codes, last modified 19 November), PC Gamer (21 codes, updated 23 November) and TrueAchievements (19 codes) still mark the rest as unknown, and none of them differs on a code it does print. The Dexerto fetch was cut off again: its summary showed an extra press on Cycle Weather and Raise Wanted Level and a different Unlimited Focus, which could not be checked against the page text.

## Priority: proven search demand (Search Console, 2026-11-24)
People already search these and land on the site at positions 8 to 50. Do these before the general list below. The fact rules still apply: skip any line you cannot confirm with two sources, and never invent car names, locations or codes.

New guides:
- (none waiting; the characters guide was published on 2026-11-28 as `gta-6-characters`. It names no voice actors, because CLAUDE.md allows nothing about real people beyond credited developers and publishers.)

Add to existing guides (a new section or FAQ, not a new page):
- `gta-6-how-to-save`: multiple save slots, whether there is a setting to turn autosave on, saving on Xbox (searches rank 17 to 28).
- `gta-6-bank-vault-robbery`: "when can I rob banks", what triggers bank alarms.
- `gta-6-gun-shops`: whether you can sell guns. (Keeping guns after Chapter 1 was added on 2026-11-28.)
- `gta-6-make-money-fast`: more detail on Chapter 2 money.
- `gta-6-jewelry-store-robbery`: how the safe code is found (only if two sources agree).
- `gta-6-best-weapons` and `gta-6-fastest-cars`: these rank 20 to 50 for their main search. Add depth, a comparison table and internal links from the home page and related guides.

## Guides to write (only when facts are confirmed by 2+ sources)
- GTA 6 Chapter 3 missions list (26 main missions; do not print the chapter's crude title)
- GTA 6 Chapter 4 missions list (25)
- GTA 6 Chapter 5 missions list (7)
- GTA 6 all weapons list (66 standard weapons; two guides count 53 guns, 9 melee and 4 explosives)
- GTA 6 all vehicles list by class
- GTA 6 Kenton treasure dives (7 dive sets)
- GTA 6 gang operations / Illegal Operations (Pest Control trophy)
- GTA 6 armored truck robbery (A Classic Blitz Play trophy)
- GTA 6 marked bills and money laundering (Dime on the Dollar trophy)
- GTA 6 shooting range challenges (The Shootist trophy, ammo cheats)
- GTA 6 drone races / Top Fun locations
- GTA 6 races list (Earn Cash, Not Kudos trophy)
- GTA 6 fishing guide (Cal, Baited My Tackle)
- GTA 6 hunting guide (Bret Vogel)
- GTA 6 Snap Gun and Key Cloner: how to get both
- GTA 6 WAiNK app explained
- GTA 6 phone apps list (Scooter Bros, BuckMe, Fitness, Real Estate, WAiNK)
- GTA 6 Jason vs Lucia: differences
- GTA 6 best settings (PS5 / Xbox)
- GTA 6 hidden trophies explained (spoiler-tagged)
- GTA 6 arcade games (Stick Fiddler trophy)
- GTA 6 clothing and outfits
- GTA 6 pets
- GTA 6 Online: what is confirmed
- GTA 6 PC release: what is confirmed

## Checks for a later run (added 2026-11-28)
- 100% requirements: PowerPyx and GTABase list more categories than the Tracker has, including 50 of 66 standard weapons, 15 of 18 meditations and 70 of 79 discovered styles. The meditation figure now has three sources (PowerPyx, Beebom, AllThings.How) and is stated as reported in `gta-6-meditation-spots`. Confirm the full list with two sources, then add the missing rows to `completionRequirements` and the 100% guide.
- Randy's Wish List total: PowerPyx lists 16 cars and GTABase says the list starts with 15, against the 20 on the site. The cars guide now says sources differ. Settle it when a third detailed source appears, and re-check the `gta-6-randys-wish-list-cars` title then.
- Mission totals: Dexerto, Red Bull and Push Square support 91 (22, 11, 26, 25, 7). GTABase numbers 109 and PowerPyx lists more. The mission guide now says counts differ.
- Guide dates: every guide page shows the single `lastVerified` date from `data/keywords.json` (2026-11-22). It was not bumped, because not every guide was re-checked. The two guides added on 2026-11-28 (`gta-6-meditation-spots`, `gta-6-characters`) therefore show 2026-11-22 as well. A per-guide date would need a small change to `scripts/build.js`, which is for Sahir to decide.
