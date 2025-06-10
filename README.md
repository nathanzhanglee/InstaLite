# InstaLite 

InstaLite is a social media platform developed as part of the NETS 2120 Spring 2025 final project. The platform mimics Instagram's core features, allowing users to register, interact with others, and scroll through personalized posts. It includes multiple features such as user registration, profile management, chat functionality, post ranking, and integration with Kafka for cross-team data sharing.

### Key Features

1. **User Registration & Profile Setup**:
   - Users can sign up with basic details such as name, email, and birthday.
   - Profile pictures can be uploaded, with an option for users to select a similar actor using image embeddings. This process uses **image embeddings** to match user selfies with a precomputed vector database of actor images.
   - Hashtags based on user interests are also part of the registration process.

   ![Create Account](screenshots/createAccount.png)  
   *(Placeholder for account creation screenshot)*  
   ![Profile Creation](screenshots/profilecreation.png)  
   *(Placeholder for profile creation screenshot)*  
   ![Celebrity Match](screenshots/celebritymatch.png)  
   *(Placeholder for celebrity match screenshot)*  
   ![No Celebrity Match](screenshots/nocelebritymatch.png)  
   *(Placeholder for no celebrity match screenshot)*  
   ![Adding Hashtags](screenshots/addinghashtags.png)  
   *(Placeholder for adding hashtags screenshot)*  

2. **Feed and Ranking System**:
   - Personalized news feed showing posts from friends, followed actors, and trending topics.
   - A **ranking algorithm** powered by **Apache Spark**, which computes personalized post recommendations based on social interactions and user interests. The ranking uses the **adsorption algorithm**, running periodically on AWS EMR to ensure users receive highly relevant posts.

   ![Feed Post](screenshots/feedpost.png)  
   *(Placeholder for feed post screenshot)*  

3. **Real-Time Chat**:
   - Users can create chat groups with friends and send real-time messages using **WebSockets**.
   - Messages persist in the database, allowing users to access their chat history at any time.
   - Users can invite more friends to chat and leave rooms freely.

   ![Chatroom](screenshots/chatroom.png)  
   *(Placeholder for chatroom screenshot)*  

4. **Natural Language Search (Chatbot)**:
   - A **chatbot** powered by **OpenAI API** allows users to search for posts using natural language queries, fetching results relevant to user interests and hashtags.

   ![Chatbot](screenshots/chatbot.png)  
   *(Placeholder for chatbot screenshot)*  

5. **Cross-Team Data Integration (Kafka)**:
   - Posts are exchanged between different InstaLite teams via **Kafka**. We subscribe and post to the `FederatedPosts` and `BlueSky` topics for data synchronization, ensuring consistency across all participating teams.

6. **Friend Requests**:
   - Users can send friend requests, which can be accepted or rejected, allowing for the creation of a social network.

   ![Add Friend](screenshots/addfriend.png)  
   *(Placeholder for add friend screenshot)*  
   ![Add Friend Empty](screenshots/addfriendempty.png)  
   *(Placeholder for add friend empty screenshot)*  

7. **Real-Time Online Status**:
   - Users can see if their friends are online in real time using **WebSockets**, updating their status dynamically.

   ![WebSocket Online Status](screenshots/profilehome.png)  
   *(Placeholder for online status screenshot)*  

8. **Profile Page**:
   - Users can view and edit their profiles, including personal information, posts, followers, and following.

   ![Profile Home](screenshots/profilehome.png)  
   *(Placeholder for profile page screenshot)*
