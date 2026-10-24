# P3 user journey

Alice wants to send a message while Bob is busy. She wants to send it before she forgets, without asking him to engage immediately. After they create accounts and exchange usernames, Alice adds Bob, opens Bob's chat and sends the message. Her message shows **Waiting for catch-up**, confirming that Catchup has stored it. Bob can sign in and browse earlier conversations without seeing pending messages, previews, or a waiting count. Later, when he wants to hear from friends, he selects **Catch up now**. A 15-minute window opens across all his chats, and Alice's message appears in their conversation with its original timestamp; further messages arriving during the window also become available. Bob can reply, or privately save the message to revisit. His reply follows Alice's own receiving window. When Bob selects **End catch-up**, his released history remains available, while subsequent incoming shares wait for his next window. This journey demonstrates control over when new content becomes available; it does not guarantee attention, a response, or that Bob remembers to return.

## Demonstration steps

Use two accounts in separate browser tabs. Sign-in credentials are kept in each tab's memory, so reloading requires signing in again; messages and windows persist in MongoDB.

1. Keep Bob's window closed. Alice starts a chat using his exact username and sends a short share. Confirm **Waiting for catch-up** on Alice's side.
2. Check Bob's view. The pending share must not create a conversation row, preview, badge, count, or visible message. An already existing conversation remains browsable.
3. Bob selects **Catch up now**. Confirm a countdown beginning at 15:00 and the incoming share in Alice's conversation. On Alice's side, **Available** means Bob can access it, not that he has read it.
4. While Bob's window is open, Alice sends a second share. Confirm it appears without another opening action.
5. Bob replies. Confirm the two directions share one thread, and his outgoing reply waits while Alice's window remains closed.
6. Bob saves an incoming message and selects **Saved only**. Confirm that this filter is private and removing a bookmark preserves the original message in the ordinary thread.
7. Bob ends catch-up. Alice sends another share. Confirm that Bob retains released history while the new incoming share stays hidden.
8. Reload and sign in again. Confirm that stored messages and bookmarks remain, and that sign-in itself does not open a new window.

## Inputs and access checks

- Try an unknown friend username: show a helpful error without creating an empty chat or sending a message.
- Try an invalid username, your own username, a duplicate registration, and an incorrect password.
- Try sending only spaces; the send control should remain disabled. The server also validates message text.
- Search a partial friend username; only existing authorized conversations should be filtered. Search is not a global people or message search.
- Verify that another user cannot save or directly retrieve a message they do not have permission to access. API assertions cover spoofed identities and unreleased incoming content.

These are expected checks for the journey. The design notebook and saved validation output distinguish completed checks from checks still awaiting a browser or live deployment run.
