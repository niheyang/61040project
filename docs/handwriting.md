# How handwriting works in Catchup

Text remains the default. **Draw** opens a small writing area with three pen
colors, Undo, Clear, and Send drawing. Both kinds of message use the existing
catch-up window and saved-message rules.

## 1. The drawing area is a Vue component

[`DoodlePad.vue`](../web/src/DoodlePad.vue) is the reusable piece of the screen
that contains the canvas and drawing tools. A canvas is a rectangular area the
browser can draw into. [Signature Pad](https://github.com/szimek/signature_pad)
handles mouse, touch, and pen movement and turns it into smooth strokes. Our code
adds the colors, Undo/Clear buttons, draft handling, and limits.

After each completed stroke, the component emits `update:modelValue`. Vue's
`v-model` passes that updated drawing back to the parent component, `App.vue`.
Undo removes the final stroke; Clear returns the draft to `null`, meaning blank.
Send stays disabled when the draft is blank.

The format does not depend on the library's internal settings. In
[`drawingCanvas.ts`](../web/src/drawingCanvas.ts), our code converts between
Signature Pad's points and our stored coordinates. Resizing redraws the completed
strokes instead of discarding them. An unfinished stroke is not yet a draft and
can be discarded if you leave or resize while drawing it.

## 2. App.vue keeps each friend's draft separately

[`App.vue`](../web/src/App.vue) keeps text drafts in `messageDrafts`, drawings in
`drawingDrafts`, and the chosen Text/Draw mode in `composerModes`. Each uses the
friend's username as its key. Switching modes or friends therefore preserves
completed drafts. These are temporary browser values, not MongoDB records:
reloading or signing out clears unsent drafts.

Selecting Send calls the existing `sendMessage()` function. Text mode uses
`api.catchup.send`; Draw mode uses `api.catchup.sendDrawing`. The drawing is
cleared only when the server confirms that it was sent successfully. A failed
send leaves it available to retry.

## 3. The backend validates and saves stroke data

The browser sends a drawing as ordinary JSON: a structured set of values rather
than an uploaded picture. [`src/shared/drawing.ts`](../src/shared/drawing.ts)
defines the format used by both the browser and server. A small example is:

```json
{
  "version": 1,
  "width": 600,
  "height": 300,
  "strokes": [
    { "color": "#173247", "points": [[30, 50, 0, 0.5], [60, 70, 25, 0.5]] }
  ]
}
```

Each point stores `[x, y, elapsedMilliseconds, pressure]`. The 600×300 coordinates
are a stable logical size; the same note can be displayed at a smaller physical
size on a phone.

The `/api/catchup/sendDrawing` request is defined in
[`src/compositions/Catchup.ts`](../src/compositions/Catchup.ts). It authenticates
the sender, finds the recipient's exact username, and calls `Messaging.sendDrawing`.
Request validation rejects unknown fields, unsupported colors, invalid points,
blank drawings, and excessive data. The limit is 120 strokes, 3,000 points, and
96,000 bytes of serialized drawing data. The concept validates the drawing again
so direct internal calls receive the same protection.

[`Messaging.ts`](../src/concepts/Messaging.ts) saves the message in MongoDB's
existing `messaging_messages` collection. A text message has `text` plus
`drawing: null`; a drawing message has empty `text` plus its drawing data. Existing
text records without a `drawing` field are read as `drawing: null`, so no database
reset or migration is needed.

## 4. Catch-up still decides when a drawing becomes visible

`HoldDrawing` enqueues the new message ID in Holding. The same release reactions
used for text make it available when the recipient opens a catch-up window, or
immediately if that window is already open. Pending incoming drawing data is
excluded from the recipient's dashboard. There is no separate public image URL
that bypasses this rule. The sender can still see their own drawing and its
Waiting/Available status.

## 5. Received messages replay the strokes

[`ChatMessage.vue`](../web/src/ChatMessage.vue) chooses between the existing text
display and [`DoodleMessage.vue`](../web/src/DoodleMessage.vue). The latter redraws
the points onto a read-only canvas using the same pen settings and a warm paper
background, including in dark mode. Timestamps, saving, and delivery labels remain
part of the normal message display.

Chat-list previews say **[Drawing]** in a distinct coral color. Search matches usernames and typed message
text; it does not recognize handwriting.

## Trying it yourself

Run `bun run dev` from the project folder and open a conversation. Select Draw,
write something, then choose Send drawing. With a second account, leave reception
closed first and then select Catch up now to see the drawing arrive. You can also
try Undo/Clear, switching friends or modes with an unfinished draft, and saving a
received drawing. Restarting the development command can help if Vite has not
picked up the newly installed dependency.

Automated concept, HTTP, drawing-format, serialization, and preview tests now
cover this feature; see the [P3 validation results](validation/README.md) and saved
output. These runs did not open a browser or verify pointer gestures or visual
layout. Manual verification is still needed. The existing dashboard reloads
accessible histories every three seconds, so this version is intended for small
notes rather than large artwork.
