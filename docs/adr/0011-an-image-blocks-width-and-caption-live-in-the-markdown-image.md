---
status: accepted
date: 2026-11-05
---

# An Image block's width and caption live in the Markdown image

An Image block can be resized and captioned, and both used to be dropped on save: the Markdown had `![alt](url)` and nothing else, so a resize or a caption vanished the next time the Document was opened. The Document's Markdown is the only place Plumo keeps anything about a Document, so both have to be written into the image itself.

The width goes after the alt text, as Obsidian writes it: `![alt|400](url)`. The caption is the CommonMark title: `![alt|400](url "caption")`, the same place a file Attachment already keeps its caption. On read, `|400` and `|400x300` both give the width, and only the width is kept; the width is written as a whole number of pixels, and not at all when the image fills the text column. An Image block is always centred, so there is no alignment to store.

## Considered Options

- **An HTML `<img src width>`**. BlockNote parses it and every renderer honours it, but every resized image would turn into a line of HTML in Raw mode and in the file, which is the opposite of a Markdown editor's promise.
- **Not keeping the width**, and taking resizing away. Resizing is what people reach for first with a screenshot that is too big.

## Consequences

- Another renderer shows `|400` as part of the alt text rather than as a width, and shows the caption as a tooltip rather than under the picture. Nothing is lost, only shown less well.
- An alt text that really ends in `|` and a number is read as a width. That is accepted.
