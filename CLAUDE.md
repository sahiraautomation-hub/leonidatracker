# LeonidaTracker: rules for automated daily updates

This repo is the source for **https://theleonidatracker.com**, an unofficial GTA 6 fan site owned by Sahir. It is a static site with no dependencies. `main` holds the source. `live` holds the built site, and Hostinger deploys `live` automatically on every push.

Sahir chose automatic publishing: a daily run may publish without asking him, as long as every rule below is followed. He reads a short summary afterwards.

## Layout

| Path | What it is |
|---|---|
| `data/cheats.json` | All 61 cheats. `code` is `null` until confirmed. |
| `data/tracker-items.json` | Tracker checklist and counters, plus 100% requirements. |
| `data/keywords.json` | Every guide. One object per guide. |
| `data/updates.json` | Public changelog, newest first. |
| `BACKLOG.md` | Topics not yet written. |
| `scripts/build.js` | Generator. Validates data, builds `deploy/`, checks links. |
| `scripts/publish.sh` | Builds and pushes `deploy/` to `live`. |
| `site.config.json` | Domain, email, Analytics and AdSense IDs. **Do not change `url`, `email`, `analytics` or `adsense`.** |

## Daily run, in order

1. `git pull` on `main`. Read `BACKLOG.md` and the last few entries of `data/updates.json` so you do not repeat work.
2. **Research with web search.** Look for, in this priority:
   1. Newly confirmed cheat codes for cheats whose `code` is `null`.
   2. Errors on the site: facts that newer sources now contradict.
   3. Confirmed facts for one backlog topic.
3. **Apply the fact rules below.** Drop anything that fails them.
4. Make the edits. At most **2 new guides** and any number of confirmed cheat codes or corrections per run.
5. Add one entry per kind of change to the top of `data/updates.json` with today's date.
6. Set `lastVerified` in any data file you re-checked, and `lastUpdated` in `site.config.json`, to today's date.
7. Run `node scripts/build.js`. It must finish with no errors. Fix warnings about title or description length.
8. Commit to `main` and push. Then run `bash scripts/publish.sh "<summary>"`.
9. Fetch `https://theleonidatracker.com/updates/` a minute later and confirm today's entry is live.
10. Report: what was published, the sources that confirmed it, and anything you chose not to publish and why.

**If nothing passes the fact rules, publish nothing.** Do not write a filler post, and do not bump dates on pages you did not re-check. Report that nothing was confirmed today. A quiet day is fine. A wrong fact is not.

## Fact rules

- **Two independent sources** must agree before a fact is stated plainly. Two sites that copy each other count as one.
- A fact from one credible source may appear only when worded as "reported" or "players report", and never for a cheat code.
- **Cheat codes need two sources showing the identical sequence.** If two sources differ by even one input, do not publish the code.
- Prices, payouts and counts from guides are "reported" figures. Say so.
- If sources disagree, either leave the fact out or say that sources differ. Never pick one silently.
- Never invent numbers, locations, mission names or steps. If you do not know, leave it out.
- When you correct an earlier mistake, say so in `data/updates.json` with a "Correction:" title.

## Writing rules

- Original wording only. Never copy sentences from other sites or wikis. No quotes longer than a few words.
- Plain English, short sentences, British spelling to match the existing guides. No hype.
- No Rockstar artwork, logos, screenshots or trailer images. No downloads, mods or exploits that break the game's terms.
- **Spoilers:** mission names past Chapter 2 and hidden trophy names are spoilers. Use them only in a guide whose title makes that clear, and never on the home page or in meta descriptions.
- **AdSense-safe language:** no profanity. The official title of Chapter 3 is crude, so never print it. Write "Chapter 3".
- Nothing about real people beyond publicly credited developers and publishers.
- Each new guide needs: a unique `slug`, `title` of 65 characters or fewer, `description` of 70 to 165 characters, an `h1`, an `intro`, at least four sections, three FAQs, and at least two links to existing pages. Aim for 450 words or more of real content.
- Do not create two pages that target the same search. Check `data/keywords.json` first.
- Do not delete or rename existing guides. URLs must stay stable.

## Guide format

```json
{
  "slug": "gta-6-example", "category": "Basics", "keyword": "gta 6 example",
  "title": "…", "description": "…", "h1": "…", "intro": "…",
  "sections": [
    { "h2": "Heading", "p": ["Paragraph with **bold** and [a link](/guides/gta-6-controls/)."],
      "list": ["Bullet (rendered before the paragraphs)"],
      "steps": ["Numbered step (rendered after the paragraphs)"],
      "after": "Optional closing sentence after the steps.",
      "table": { "caption": "…", "headers": ["A", "B"], "rows": [["1", "2"]] } }
  ],
  "data": { "type": "table", "caption": "…", "headers": ["A", "B"], "rows": [["1", "2"]] },
  "faqs": [{ "q": "…", "a": "…" }],
  "tool": "tracker"
}
```

`category` is one of: Basics, Money, Vehicles, Weapons, Cheats, Collectibles, Progress, Missions, World. `tool` is one of: tracker, cheats, calculators, guides. `data` may also be `null`, or one of the `cheats`, `counters` and `missions` block types described in `README.md`.

## Adding a confirmed cheat code

In `data/cheats.json`, set `"code": ["U","D","L","R", …]` on the cheat. The build then creates `/cheats/<id>/` and links it everywhere. Update the count of found codes wherever a guide states it in words (search `data/keywords.json` for the old number).

## Git

- Commit author: `Claude <noreply@anthropic.com>`.
- Never force-push `main`. `scripts/publish.sh` handles `live`.
- Never commit secrets. There are none in this repo, and none are needed.
