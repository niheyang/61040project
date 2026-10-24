## P2
### Plan

Begin with account registration and sign-in, then implement sending, message holding, catch-up windows, and bookmarking. Verify each feature before testing the complete user journey through the interface.

### Significant Decisions

My initial idea was to deliver messages when the recipient was “free.” However, availability is difficult to define reliably. I therefore introduced an explicit 15-minute catch-up window, allowing recipients to choose when to receive new messages by selecting **Catch up now**.

Pending messages remain hidden until the window opens, without previews or waiting-message counts. This supports Catchup’s purpose: recipients can focus without being reminded that messages are waiting. Opening the window releases pending messages and allows newly arriving messages to become available. Closing it stops further releases, while previously released messages remain accessible.

The tradeoff is that recipients must remember to open a window; otherwise, messages may remain pending indefinitely. This is acceptable for the non-urgent exchanges Catchup targets.

### Design Changes

I simplified the MVP interface to emphasize its core workflow. I removed the duplicate original-message dialog, reply shortcut, and decorative onboarding content. Saved already displays the full original message, and users can respond through the ordinary composer.

### Challenges

I was initially unfamiliar with MongoDB and Bun, so I needed time to understand their roles and become comfortable with the development setup before building the application.

### Interesting Moments

I explored several chat applications and compared their features and interaction patterns. This gave me useful context for considering how Catchup should support communication between friends.

### Original P3 Plan

1. **Deploy the application.** Deploy the existing MVP to the class platform and verify that its core journey works online.

2. **Add friend conversations.** Introduce a simple friend list and a conversation view for each friend, combining sent messages with available incoming messages. Opening a conversation should not automatically start a receiving window or reveal pending messages.

3. **Improve usability through feedback.** Ask several people to try the application, identify confusing labels or interactions, and revise them. Add concise first-use instructions explaining usernames, catch-up windows, and message availability.

4. **Refine the visual design.** Complete the typography and color inspiration slides, then use them to revise the interface. The current colors and typography resemble a note-taking application; I want the visual design to better communicate casual exchanges between friends.

5. **Update validation and documentation.** Extend tests for new functionality, save their execution output, and check complete user journeys through the interface. Update the specifications, user journey, screen recording, and design notebook.

6. **Explore media sharing as a stretch goal.** If time permits after the core experience is complete and tested, add image and voice messages. These attachments must follow the same availability rules as text messages.

## P3
### Following the plan to change the design in P3
I first implemented friend conversations, to make it more like a social app than a mailbox.

Then, I refined the visual design. The goal is to make it look less formal, more relaxed, but not making people feel addicted so they don't want to leave the app. I chose a Sans Serif font, and natural color palettes of blue with a switch to night mode.


Then, I planned to make the chat function more complete. Media sharing, Markdown, have a groupchat, etc. 

### Setbacks
I found I shouldn't reimplement existing chat app functions that are only marginally related to the bad situation Catchup tries to solve. For example, I originally decided remove the message to self error since in many chat apps, people can send messages to self as a note or to transfer files, then I remembered a message to self can be kept anywhere, and shouldn't spend that effort on this function.

Moreover, as my grader mentioned, the receiver muting or hiding the chat, or turning on do not disturb almosst solves the bad situation. The advantage of my app compared to existing solutions is that the UI is more clear. The message is completely hidden and the Catchup button explicitly tells the sender that whether receiver can view the message right now, instead of when muting the chat, sender doesn't know whether receiver muted the chat.

### Plan Changes
I think about my earlier discarded idea of a forum where people can only post drawings. I discarded it because Tegaki blog does the same thing I proposed. I decide to reuse it. The bad situation is that sometimes sending text messages can sound not sincere enough. For example, my friend once told me that her friend sent her a meme with caption "You're the best," but she thought sending a meme with a kind message as caption is different from actually saying it. This conversation made me interested in whether handwritten notes or drawings could help people express care in a more personal way. I want to create a dedicated space where exchanging occasional drawings and handwritten notes is the expected activity. I incorporate drawing function using existing open source drawing pad code, and plan to do a A/B test, in A group users can only send drawings; in B group users can either send text or drawings.

### UI Design Changes
Initially I wanted to make the color palette sky blue and green. However the color seems too monotone, so I changed it to sky blue and bright yellow. I also originally wanted to discard the whole catchup plan, then as my TA reminded me, the catchup still has benefits compared to muting the chat since one can view old messages without receiving new messages, so I keep it.