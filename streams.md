# Bluesky and Federated Posts

The Kafka server with the Twitter feed is now available.  There is a tunnel server which requires a .pem file posted to Ed Discussion.


https://github.com/upenn-nets-2120/basic-kafka-client

Please take a look at app.js in the Kafka project as sample code (not a working app) that you can adapt to your purposes.  It is a very simple program that hooks to a sample topic and just listens for messages and prints things.  You should not expect to directly reuse app.js itself, but rather to leverage elements of the code there.

## Reading from Kafka for Feeds

You should plan to hook your own callback handler into the Kafka consumer.  That handler essentially should just take posts (Tweets or federated posts), convert them, and call your existing handler for posting messages.  [You'll likely need to have user ID(s) associated with the Twitter or external messages, but you can create "proxy"/"dummy" user IDs as needed.]  Things like handling hashtags, adding to the database, etc. should already be part of your existing logic for posting, so you can just leverage that.

A "federated post" is just a post from someone else's project implementation.  It won't have a separate list of hashtags; rather they could be inside the text of the post.  You should reuse your backend logic for making posts, but associate it with a different ID.

## Posting to Kafka

For posting federated posts to Kafka, you will similarly call the Kafka producer and send to the appropriate topic (the Kafka slides show an illustration of this).

```
{
    username: 'bobhope',
    source_site: 'g01',
    post_uuid_within_site: '40',
    post_text: 'A <b>bold</b> post',
    content_type: 'text/html'
}
```