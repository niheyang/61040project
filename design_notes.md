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

### Plan for P3

1. **Deploy the application.** Deploy the existing MVP to the class platform and verify that its core journey works online.

2. **Add friend conversations.** Introduce a simple friend list and a conversation view for each friend, combining sent messages with available incoming messages. Opening a conversation should not automatically start a receiving window or reveal pending messages.

3. **Improve usability through feedback.** Ask several people to try the application, identify confusing labels or interactions, and revise them. Add concise first-use instructions explaining usernames, catch-up windows, and message availability.

4. **Refine the visual design.** Complete the typography and color inspiration slides, then use them to revise the interface. The current colors and typography resemble a note-taking application; I want the visual design to better communicate casual exchanges between friends.

5. **Update validation and documentation.** Extend tests for new functionality, save their execution output, and check complete user journeys through the interface. Update the specifications, user journey, screen recording, and design notebook.

6. **Explore media sharing as a stretch goal.** If time permits after the core experience is complete and tested, add image and voice messages. These attachments must follow the same availability rules as text messages.