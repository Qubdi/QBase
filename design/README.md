# Design references

Design explorations: what was tried, what was chosen, and what was saved for later. Kept in
git so the pictures and the reasons stay with the code.

One folder per topic. Each has:

- `README.md`, the decision record: the question, what was chosen and where it lives in the
  code, what was saved for later (with a recipe to apply it), and what was rejected and why;
- screenshots of the options that matter, named after the option;
- the options page, when there is one (`options.html`), with the real colours from
  `src/globals.css`.

This folder is not part of the app and is left out of the Docker image (`.dockerignore`).

| Topic | Date | Chosen | Saved for later |
| --- | --- | --- | --- |
| [Checkboxes and switches](checkbox/README.md) | 2026-11-17 | F, Switch (Field Attributes); D, Roomier (every other checkbox) | nothing: both are in use |
| [Description marker in the field rows](field-description/README.md) | 2026-11-17 | B, Icon inside the name box | nothing: the other options are in the record |
| [Where the side-panel popups open](popup-side/README.md) | 2026-11-18 | A, Like the column type: left edge on the button, growing to the right | B, Beside the panel (recipe in the record) |
| [Which tables are in which area](area-tables/README.md) | 2026-11-18 | A, an area row opens to its tables, with a row for the tables in no area | the area shown on the rows of the Tables list |

## Adding a topic

1. Make `design/<topic>/`.
2. Put the options page and the screenshots in it. Name a screenshot after its option, such as
   `F-switch.png`.
3. Write its `README.md`: question, chosen (with the file that implements it), saved for later
   (with the recipe), rejected (with the reason).
4. Add a row to the table above.
