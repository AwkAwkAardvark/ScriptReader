# Preparing a script for Script Reader

Prepare two matching UTF-8 CSV files: a **script** describing the records and their participants, and a **cast** mapping character identifiers to names. The cast defines who exists; script tags define who participates in each record. Neither file assigns students to roles.

This is the standard input format, including for hosted publishing. Single-file import is a [fallback](#single-file-fallback), not the recommended preparation path. The reader takes character names and scenes from the input; it is not tied to one production.

## Prepare the inputs

1. **Choose the authoritative source.** Confirm the production and source version before editing. Work on a copy. Preserve authored dialogue, translations, directions, and source order. When revising accepted input, preserve its record identifiers. For a new conversion, assign increasing positive `No` values once.
2. **Inventory the characters.** List each individual, including characters who only act or appear in group passages. Resolve numbered members of groups with the production owner. Keep different characters separate even if one actor plays both.
3. **Assign identifiers and build the cast.** Give each character one stable tag and a readable name. For new named characters, use a three-letter tag, such as Jasmine → `Jas`. For numbered ensemble roles, use a three-letter prefix followed by the member number: Guard 1 → `Gua1`, Merchant 2 → `Mer2`, Friend 3 → `Fri3`, Attendant 4 → `Att4`. Keep existing accepted identifiers for named roles, such as `Jas`. Resolve collisions before using a tag; do not silently renumber or rename established characters.
4. **Convert the script into records.** Put each authored dialogue unit, standalone direction/effect, heading, or song marker in its own record. Preserve embedded line breaks inside a quoted cell rather than splitting on visual wrapping or every sentence. Fill `Scene`, `Role`, `English`, and any existing `Korean`; classify records using the supported `Type` values below. For preparation, keep scenes together in performance order and start each with a `Title` record.
5. **Assign participants.** For dialogue, use the speaker's tag. For joint speech and directions, list the confirmed individual participants separated by semicolons. Expand a label such as “friends” using confirmed membership for that moment, not every person in the cast. Use explicit directions or owner confirmation as evidence. Flag uncertain membership rather than guessing.
6. **Review effects and songs.** Tag only confirmed participants. A nearby line, lyric credit, or recorded voice does not establish ensemble membership. Leave global/unattributed cues untagged where appropriate. Song tags may remain blank while participation is undecided; record that as an unresolved content decision.
7. **Export and validate.** Save both CSVs with the exact headers below. Open them in the reader, resolve structural errors, then spot-check speaker names, group membership, and representative passages. Deliver the matching files and a concise list of unresolved content questions. Publishing is a separate operation in the [operations guide](hosted-delivery.md#validate-and-publish-a-production).

Preserve authored text and confirmed participation. Student assignments are separate from character identities. Translations and schema extensions are separate tasks; they are not prerequisites for preparing these inputs.

## Script CSV requirements

Use exactly these nine headers, in this order:

```text
No,Scene,Role,English,Korean,Type,Notes,Tag,Optional
```

| Column | Parser requirement and preparation guidance |
| --- | --- |
| `No` | Unique, increasing positive safe integer; gaps are allowed. Preserve identifiers when revising an existing input. |
| `Scene` | Positive safe integer identifying the scene. Group scenes in performance order and add opening titles as preparation guidance; the parser does not enforce that ordering or require a heading for every scene. |
| `Role` | Authored speaker/group label. With a cast, tagged dialogue may leave this blank; untagged dialogue must supply a label. Without a cast, every `Line` requires a label. See attribution below. |
| `English` | Nonblank primary text, including headings and cues. Preserve wording, punctuation, and embedded newlines. |
| `Korean` | Existing Korean text, or blank. |
| `Type` | One or more supported, case-sensitive tokens separated by semicolons, without duplicates or empty pieces. |
| `Notes` | Source metadata, or blank; not an assignment system. |
| `Tag` | Distinct individual identifiers separated by semicolons, or blank. Each used identifier must exist in the supplied cast. |
| `Optional` | Exactly `Y` or blank. Metadata only; it does not omit a record from the reader. |

Supported type tokens are `Line`, `StageDirection`, `Title`, `Song`, `SFX`, `Lighting`, and `VFX`. For example, a cell may contain `Line`, `StageDirection`, or `VFX; StageDirection`. The list is not a value to put in every cell. Classify from the authored record's purpose, not keyword matching. Parenthetical directions inside spoken text remain part of that `Line`; they do not require another record.

Use a CSV-aware exporter. Quote cells containing commas, double quotes, or newlines, and double any literal quotation marks inside a quoted cell. A multiline cell is still one logical record. Avoid empty records and extra columns. Do not parse CSV by splitting on physical newlines.

## Character identifiers and cast CSV

Use these headers, in this order:

```text
Tag,Name
```

Each row maps one individual tag to a nonblank canonical display name. Tags are case-sensitive and must contain no whitespace, commas, semicolons, or control characters; surrounding whitespace is trimmed. Duplicate tags are errors even if the names agree. Use three-letter tags for newly prepared named characters and three letters plus the member number for numbered ensemble roles. These are preparation conventions, not parser restrictions: preserve established accepted identifiers rather than renaming them to enforce a new format.

In script cells, write `Gua1` for one participant or `Gua1; Gua2` for two. Do not repeat tags or leave empty pieces such as `Gua1;;Gua2`. The reader does not expand group aliases or infer participants from `Role` or dialogue text. Missing dialogue tags need content review even though blank tags can pass parsing.

Every script tag must appear in the cast. Unknown/case-mismatched tags block import. Extra cast entries are permitted and selectable even if they have no matching passages. Names need not be unique; the dropdown adds identifiers where names coincide. Keep cast rows in the intended dropdown order.

An optional third header, `DividerBefore`, supports unnamed dropdown groups: `Tag,Name,DividerBefore`. Set it to `Y` on the first member of a new group and leave other cells blank. The reader inserts a disabled divider before that member, except on the first cast row. This does not define group membership or affect filtering.

The cast supplies individual attributions, including action-only or group-only characters without solo dialogue. With a cast loaded, a single tagged character displays its cast name. For multiple participants, an authored `Role` label is retained; if absent, dialogue lists their cast names while directions remain unlabeled. Original script cells are unchanged.

## Directions and song participation

Expand confirmed group actions into individual tags, including entrances and interactions. The cast contains identities, not permanent participation aliases: not every merchant must join every merchant action. If a direction does not establish the precise members, consult the production's confirmed membership or ask the owner.

For each song, confirm both who participates and what participation means for that production. Put confirmed individuals in the existing `Tag` cell. Do not invent singer/spectator categories or new columns. A blank song tag is valid while casting is pending; a video link does not establish song participants.

Tags drive selection; surrounding context can include untagged records. Headings and songs are structural records and consume no context entries. For display controls, cue hiding, and print behavior, see the [development and use guide](development.md). Keep data preparation separate from changing reader behavior.

## Worked example: Chapter 3

The first ten records of Chapter 3 are followed immediately by its Butter song marker. This teaching excerpt is numbered **1–11**; the full source retains its original identifiers. Scene values, wording, translations, and participation tags are preserved. The jump to the song is intentional; the example does not represent an uninterrupted passage.

First build the cast from the individuals referenced by these records, including those present only in directions:

```csv
Tag,Name
Fri1,Friend Uno
Fri2,Friend Dos
Fri3,Friend Tres
Fri4,Friend Cuattro
Jas,Jasmine
Att1,Attendant Alena
Att2,Attendant Bree
Att3,Attendant Chloe
Att4,Attendant Daisy
Mer1,Merchant Sept
Mer2,Merchant Huit
Mer3,Merchant Neuf
Mer4,Merchant Dix
Gua1,Guard Eins
Gua2,Guard Zwei
Gua3,Guard Drei
Gua4,Guard Vier
```

Then prepare the script:

```csv
No,Scene,Role,English,Korean,Type,Notes,Tag,Optional
1,3,,Market Mayhem,,Title,,,
2,3,,"(In the marketplace, merchants are peddling their goods, attendants are shopping, guards are patrolling and princess Jasmine is walking in disguise)","(시끌벅적한 시장; 상인들은 물건들을 팔고, 궁인들은 물건들을 사고, 근위대는 순찰을 하고 있다. 분장한 자스민이 시장을 돌아다닌다.)",StageDirection,,Jas; Att1; Att2; Att3; Att4; Gua1; Gua2; Gua3; Gua4; Mer1; Mer2; Mer3; Mer4,
3,3,Merchant Sept,Beef! Pork! Chicken! Come get your meat!,소고기! 돼지고기! 닭고기! 고기 사세요!,Line,,Mer1,
4,3,Merchant Huit,"Fresh fish! We live in the desert, but I’ve got fresh fish!",싱싱한 생선 팝니다! 사막이지만 싱싱한 생선이 있습니다!,Line,,Mer2,
5,3,Merchant Neuf,Come get your vegetables! 2 dollars each! Three for 7 dollars!,"채소 사소! 하나에 2달러, 3개에 7달러!",Line,,Mer3,
6,3,,(Aladdin’s friends enter),(친구들 입장),StageDirection,,Fri1; Fri2; Fri3; Fri4,
7,3,Friend Uno,"Oh, I love the marketplace in the morning.",음~ 아침 시장만큼 좋은 곳이 없지.,Line,,Fri1,
8,3,Friend Dos,I’m so hungry. Let’s get some breakfast.,"배고프니까, 뭐 좀 먹자.",Line,,Fri2,
9,3,,(Friends walk over to the merchants),(친구들이 상인에게 말을 건다),StageDirection,,Fri1; Fri2; Fri3; Fri4; Mer1; Mer2; Mer3; Mer4,
10,3,Friend Tres,"Excuse me, could I have some fruit, please?",실례합니다. 과일 좀 시식해 볼 수 있을까요?,Line,,Fri3,
11,3,,(Song: Butter),,Song,,,
```

Read the example as a preparation exercise:

- Record 1 is a scene title and has no participant tags.
- Record 2 lists Jasmine plus the confirmed attendants, guards, and merchants. The prose alone does not identify every numbered member; retain the approved membership rather than deriving it from the group words.
- Records 3–5 map individual merchant names to `Mer1`–`Mer3` through the cast.
- Record 6 tags all four confirmed friends, including `Fri4`, who has no spoken line in this excerpt.
- Record 9 expands both participating groups into their individual tags. No collective alias is passed to the reader.
- Record 11 is `Song`, with participation left blank pending casting. Do not fill that cell merely to make the example look complete.

### Optional hosted media CSV

For this example, associate song record **11** with [BTS (방탄소년단) ‘Butter’ Official MV, published by HYBE LABELS](https://www.youtube.com/watch?v=WMweEpGlu_U):

```csv
No,YouTubeURL
11,https://www.youtube.com/watch?v=WMweEpGlu_U
```

The number references the example's song identifier. For a full production, use that production's actual song `No`. Media is a separate hosted-publishing input, not an extra script column or a local-import control. See [media validation and publishing](hosted-delivery.md#validate-and-publish-a-production).

## Validation and review

Open **Script** and **Cast** in either order using their file controls, or drop each CSV onto its corresponding control. Either can be replaced. Check that both belong to the intended production/version; matching identifiers alone cannot prove that.

Structural problems block import: incorrect headers/CSV structure, invalid or duplicate identifiers, missing required text, unsupported types, malformed tags, unknown cast references, and invalid `Optional`/`DividerBefore` values. An invalid supplied cast is not silently discarded. Diagnostics identify logical CSV records, counting the header as record 1; embedded newlines do not change that count.

Content questions require human review: incorrect speakers, missing tags, uncertain group membership, scene placement, and pending song casting. The parser cannot establish those facts. Keep unresolved questions distinct from parser failures; blank song tags do not fail validation.

Suggested manual checks include substantial dialogue, sparse dialogue, group actions, scene/song boundaries, zero/asymmetric context, **Hide actions & cues** off and on, and Korean display where provided. Full review of every character in every scene is not required.

## Single-file fallback

Local script import without a cast remains supported. Each token then needs a genuine single-token `Line` record whose nonblank `Role` supplies its name. Missing solo identities and conflicting labels are validation errors. **Remove cast** returns to this fallback. Do not invent dialogue to identify action-only characters; supply the cast instead. Hosted publishing requires both script and cast.

## Updating song videos

Media CSV rows use the existing `No,YouTubeURL` format. Supply rows only for songs whose links you want to add or replace. Omitting the file or a row retains existing associations when the old and new Song titles match uniquely; record numbers may move. Titles are compared after trimming, collapsing whitespace, and ignoring case. Renamed, repeated, or removed linked songs require review. Use explicit removal controls in administration (or the publisher's `--remove-media` option); a blank URL is invalid. Inspect all detected songs on the Songs page, or in the upload song-review card before publication, not only those appearing in one character's preview.

## Downloadable examples in administration

The input helpers use selected actual Chapter 3 records: its heading (`107`), merchant lines (`109`, `110`), and Butter marker (`142`). The matching cast sample uses `Mer1` / Merchant Sept and `Mer2` / Merchant Huit. The media sample maps `142` to the official BTS video linked above. This short excerpt intentionally skips intervening records and preserves the original identifiers and authored cells. It is a preparation example, not a continuous scene or the full production.
