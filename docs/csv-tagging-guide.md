# Preparing a script for Script Reader

Use this guide when converting an authorized script or reviewing its participation tags. The format works across productions; cast names, cast size, scene count, and songs come from the file.

## Instructions for an assisting agent

1. Confirm the authoritative source version and the owner's participation rules. Preserve existing dialogue, translations, stage directions, source order, and identifiers. Do not replace an accepted version with an older source.
2. Inventory the individual characters and propose a stable tag-to-name mapping. Resolve unclear identities with the owner before tagging their material.
3. Tag each record with its individual participants. Use explicit speakers and directions as evidence; flag uncertain membership instead of inferring it from vague wording.
4. Review collective speeches, entrances, exits, effects, and songs separately. Resolve each group into its actual individual participants for that record.
5. Validate the CSV and review representative passages in the reader. Deliver the private CSV, character mapping, validation summary, and any unresolved participation questions.

Do not rewrite dialogue, invent a character's speech, add student assignments, or introduce new columns to make the file fit. Keep production files out of Git, app assets, shared fixtures, and deployment output. Use the ignored `data/` directory for local input. Only open private material when authorized; do not log full records. Automated fixtures and documentation must use synthetic text.

## CSV contract

Use UTF-8 CSV with exactly these nine headers, in this order:

```text
No,Scene,Role,English,Korean,Type,Notes,Tag,Optional
```

| Column | Preparation rule |
| --- | --- |
| `No` | Unique, increasing positive integer in original record order. Preserve existing identifiers; gaps are permitted. For a new conversion, assign increasing identifiers once. |
| `Scene` | Positive integer identifying the scene. Keep scenes in script order and put a `Title` record at the beginning of each scene. |
| `Role` | Displayed speaker or participant label. Required for `Line`; may be blank for other types. A group label is display text, not a membership definition. |
| `English` | Required primary text, including headings and cues. Preserve wording, punctuation, and embedded newlines. |
| `Korean` | Existing Korean text, or blank. Preserve it; do not generate a translation unless separately requested. |
| `Type` | One or more approved type tokens separated by semicolons. See below. |
| `Notes` | Preserve source metadata, or leave blank. Do not invent an application feature or student-assignment system here. |
| `Tag` | Participating individual character tokens separated by semicolons, or blank when no participant has been assigned. |
| `Optional` | `Y` or blank. Optional records remain eligible for display; this is metadata, not an instruction to omit them. |

Use a proper CSV reader/writer. Quote cells containing commas, double quotes, or newlines; escape a literal double quote by doubling it. A multiline cell remains part of one source record. Do not split a CSV on physical newlines to parse it. Avoid empty records and extra columns.

Approved, case-sensitive type tokens:

```text
Line; StageDirection; Title; Song; SFX; Lighting; VFX
```

The list above enumerates the choices, not the required contents of every cell. `Line`, `StageDirection`, and `VFX; StageDirection` are example cell values. `Title` marks a scene heading; `Song` marks a song boundary. Parenthetical actions embedded in a dialogue record do not turn that record into a separate stage direction. Do not identify record types by searching their English text for keywords.

## Individual character tags

- Give each character one stable, case-sensitive token, such as `Iv` for Ivo. Use simple letters and digits for portability; tokens must not contain whitespace or commas. Do not repeat a token within a cell or leave empty pieces such as `Iv;;Te`.
- Tag a single speaker with their token: `Iv`. Tag a joint contribution with each participant: `Iv; Te`.
- Expand collective labels such as “both friends,” “guards,” or “everyone” into the explicit individuals participating in that particular record. The reader does not expand aliases or infer participation from `Role` or the script text.
- Keep identity separate from casting: tokens identify characters, not the students or actors assigned to play them. Preserve separate characters even if one actor plays both.
- Leave a global or unattributed cue untagged when appropriate. It can still appear as surrounding context. Flag a missing dialogue-participant tag for review rather than silently treating it as complete.

### How dropdown names are established

Every token used anywhere in the file must have at least one genuine `Line` record whose `Tag` contains only that token and whose `Role` contains that character's readable name. For example:

```text
Role = Ivo, Type = Line, Tag = Iv
```

Use the same `Role` spelling on every single-token dialogue record for that character. Conflicting names are validation errors. Plural/group `Role` labels belong on records with the corresponding multiple individual tags, so they do not become character identities.

**Current limitation:** an action-only character with no identifying dialogue row cannot be added to the dropdown under this contract. Do not invent a dialogue row or misclassify a direction to bypass this. Report the limitation and request a separately approved format/application change.

## Directions, effects, and songs

Tag the characters whose participation is explicitly indicated or confirmed by the owner. A cue's presence near a character's line does not establish that character's participation. Recorded voices are not automatically members of a physical ensemble.

For each song, ask the owner to confirm who participates and what participation means for that production. Do not infer a complete onstage cast from lyric credits, proximity, or a generic group name. Do not invent singer/spectator categories or add participation columns. Put confirmed individual tokens in the existing song `Tag` cell. If the assignment is pending, leave it blank and report it as unresolved; blank song tags are valid.

When reviewing the result, remember:

- Dialogue matches select passages for their tagged characters. With actions/cues enabled, tagged non-dialogue can also select passages.
- All selected context records remain visible, including untagged directions and effects. Each nonstructural source row counts as one context entry, regardless of text wrapping or embedded newlines.
- Scene and song markers consume no context entries. Context expansion stops at both scene changes and song boundaries.
- An included scene shows its heading and its song markers. A boundary song belongs to the passage that reaches it; passages sharing that song merge without pulling additional context across it. Omitted source rows and scene changes still separate passages.
- Korean display uses the existing `Korean` column. Changing interface language does not translate or rewrite script content.

## Synthetic example

The following invented excerpt uses `Iv` (Ivo) and `Te` (Tess). Assume the owner explicitly confirmed both characters for its group action and song. The first dialogue cell demonstrates a quoted embedded newline.

```csv
No,Scene,Role,English,Korean,Type,Notes,Tag,Optional
1,1,,The lantern room,,Title,,,
2,1,Ivo,"The lantern is ready,
shall we begin?",등불이 준비됐어요.,Line,,Iv,
3,1,Tess,Let us open the shutters.,덧문을 열어요.,Line,,Te,
4,1,Both friends,One small light is enough.,,Line,,Iv; Te,
5,1,,(Ivo and Tess carry the lantern to the window.),,StageDirection,,Iv; Te,
6,1,,A distant bell rings.,,SFX,,,
7,1,,A light for the journey,,Song,,Iv; Te,
8,1,Ivo,The path is clear now.,,Line,,Iv,Y
9,2,,The garden gate,,Title,,,
10,2,Tess,We can leave when you are ready.,,Line,,Te,
```

## Validation and owner review

Open the resulting file with **Open Script**. The reader validates header order, field counts, numeric identifiers, required text, supported types, tag syntax/identity mappings, and `Optional` values. Diagnostics identify logical CSV records, including the header as record 1; embedded cell newlines do not change this numbering.

Also check content decisions the parser cannot establish: correct speakers, missing participants, resolved collective membership, scene placement, and owner-confirmed song participation. Do not hard-code expected record counts or character names from another production.

For acceptance, sample a character with substantial dialogue, one with sparse dialogue, a character participating in group actions, and relevant scene/song boundaries. Try zero context, asymmetric context, actions/cues OFF and ON, and Korean display where provided. Report unresolved content decisions separately from parser or application failures. Exhaustive manual review of every character in every scene is not required.
