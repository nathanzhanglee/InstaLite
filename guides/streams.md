# Bluesky and Federated Posts

A basic Kafka client example is now available.

https://github.com/upenn-nets-2120/basic-kafka-client

Please take a look at app.js in the Kafka project as sample code (not a working app) that you can adapt to your purposes.  It is a very simple program that hooks to a sample topic and just listens for messages and prints things.  You should not expect to directly reuse app.js itself, but rather to leverage elements of the code there.

## Kafka Server

Once you have connected via the tunnel, you should be able to read from the Kafka server.  There are two topics: `FederatedPosts` and `Bluesky-Kafka`.

## Reading from Kafka for Feeds

The sample code we provide has a file called `config.json` which sets some defaults for connecting to a consumer. You are free to use and override this. Note you have more than one topic you'd like to consume.

An important element of Kafka is the notion of a `groupId`. There is a position in the stream associated with each group -- so you need to make sure your group ID is unique, probably named after your team.

You should plan to hook your own callback handler into the Kafka consumer.  That handler essentially should just take posts (Bluesky or federated posts), convert them, and call your existing handler for posting messages.  [You'll likely need to have user ID(s) associated with the Bluesky or external messages, but you can create "proxy"/"dummy" user IDs as needed.]  Things like handling hashtags, adding to the database, etc. should already be part of your existing logic for posting, so you can just leverage that.

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

## Some Example Data

Here is an actual JSON message from Bluesky as posted to the topic:

```
{
  "replies": 0,
  "author": {
    "did": "did:plc:zimtt7q4ei2pcqupfr7s4alp",
    "handle": "rottentomatoes.com",
    "displayName": "Rotten Tomatoes",
    "avatar": "https://cdn.bsky.app/img/avatar/plain/did:plc:zimtt7q4ei2pcqupfr7s4alp/bafkreibdx6dmjwgmibrqerljzot5ztfvuvx4mxibu6ksah2aswocw5nkqe@jpeg",
    "viewer": {
      "muted": false,
      "blockedBy": false,
      "blocking": null,
      "following": null,
      "followedBy": null
    },
    "labels": [

    ]
  },
  "created_at": "2025-03-25T22:05:47.424Z",
  "text": "Season 4 of HBO's #Industry is now in production!",
  "embed": {
    "type": "app.bsky.embed.images",
    "images": [
      {
        "image": {
          "type": "blob",
          "ref": {
            "link": "bafkreihqhmbh7abh7nwv22zbych3fqos4gyd35dchz3exck63gu4sk32tm"
          },
          "mimeType": "image/jpeg",
          "size": 252774
        },
        "alt": ""
      },
      {
        "image": {
          "type": "blob",
          "ref": {
            "link": "bafkreiacnef33zqzww6ey3j7wrsolswxfk3uzrwutzi22gtobkalivw7xu"
          },
          "mimeType": "image/jpeg",
          "size": 560234
        },
        "alt": ""
      }
    ]
  },
  "reply": null,
  "uri": "at://did:plc:zimtt7q4ei2pcqupfr7s4alp/app.bsky.feed.post/3llabq6fw6c25",
  "reposts": 1,
  "likes": 9
}
```
