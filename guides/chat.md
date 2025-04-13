## Chat Interface

See socket.io details here:

https://sites.google.com/seas.upenn.edu/nets2120/labs

There should be a way for users to chat with each other. You can implement this functionality with basic AJAX requests using polling; for extra credit, consider using WebSockets with socket.io. Read more about the different implementation choices [here](https://medium.com/geekculture/ajax-polling-vs-long-polling-vs-websockets-vs-server-sent-events-e0d65033c9ba).

**Chat invites**: When a user’s friend is currently online, the user should be able to invite the friend to a chat session, and the friend should receive a notification of some kind that enables him or her to join the chat. If the friend accepts the invitation, a chat session should be created between the two users. If the friend rejects the invitation, no chat session should be created.

**Persistence**: The contents of a chat session should be persistent - that is, if two users have chatted before and a new chat session between the same pair of users is established later, the new session should already contain the messages from the previous chat.

**Leaving chat**: Any member of a chat session should be able to leave the chat at any time. The chat should continue to work as long as it contains at least one member. When the last member leaves a chat session, the chat session should be deleted.

**Group chat**: There should also be a way to establish a group chat by inviting additional members to an ongoing chat. When a new member joins a chat, they are able to see previous chat history starting from the creation of the group chat. Each group chat created is a unique and independent chat session, even when the same users are involved (e.g., X, Y, and Z created Chat 1; X, Y, and W created Chat 2; if Z and W leave their chats, X and Y should now have two independent group chats). However, if a new invite results in a chat session involving the same user group as an existing chat session, the invite should not be allowed. You also may not invite an existing member to a chat session.

**Ordering**: The messages in a chat (or group chat) session should be ordered consistently - that is, all members of the chat should see the messages in the same order. One way to ensure this is to associate each chat message with a timestamp, and to sort the messages in the chat by their timestamps.

