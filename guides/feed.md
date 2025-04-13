# Feed

As with Instagram, your user will see a **feed** of different posts. All posts are public, i.e. they will be considered for the feed based on the criteria below even when the post owner and the user aren't friends. These posts:

1. Come from the user's friends
2. Reference the user's selected hashtags of interests
3. Come from others with high SocialRank
4. Come from the course project **Twitter/X Feed** and score highly.  This will be made accessible to you through an Apache Kafka Topic.

**Feed updates**: Your server, while running, should refresh the data necessary for computing the feed once an hour.  This will involve fetching any "new news" from Kafka and from recent posts / activities; and ranking the content.  If you precompute the data, it should be easy for the client to produce the page upon login.

**User actions**:
Users should be able to “like” posts, and should be able to comment on them.  If a post or comment includes **hashtags** a link between the hashtag and post should be established.

**Ranking posts**: Every candidate post should be assigned (for each user) a weight. Weights will be computed with an implementation of the adsorption algorithm in Spark. This should run periodically, once per hour as descried above.

The Spark job should start by building a graph from the data underlying your social platform. The
graph should have a node for each user, each movie, each hashtag, and each post. It should also have
the following directed edges:

1. `(u, h)` and `(h, u)`, if user `u` has selected hashtag `h` as an interest
2. `(h, p)` and `(p, h)`, if post `p` is associated with hashtag `h`
3. `(u, p)` and `(p, u)`, if user `u` has “liked” post `p`
4. `(u1, u2)` and `(u2, u1)` if users `u1` and `u2` are friends

The Spark jobs should assign weights to the edges.

- For each hashtag node `h`, the weights on the `(h, a)` edges adjacent should be equal and add up
  to 1.
- Similarly, the outgoing edges from a post `p` should have equal weights that sum to 1.
- For each user `u`:
    - The weights on the `(u, h)` edges should be equal and sum up to 0.3
    - The weights on the `(u, p)` edges should be equal and sum up to 0.4
    - The weights on the `(u, u′)` edges should be equal and sum up to 0.3

Now run adsorption from the users to assign a user label + weight to each node (including the article nodes). Run to a maximum of 15 iterations or until convergence. Given the ranked graph as above, the social network recommender should take the set of potential articles (those from the same day, minus ones that have already been recommended), and normalize the adsorption-derived weights on these articles. Then it should randomly choose an article based on this weighted random distribution.

**Interfacing the Spark job with the Web Application**: We recommend your group thinks carefully about how the different components (data storage, Spark job to recompute weights, search / recommendation) interface.  You likely will want to invoke the Spark task via Livy or the equivalent, with an easily configurable address for the Spark Coordinator Node. Most likely you’ll want to use some form of persistent storage (e.g. RDS) to share the graph and other state.

### Federated Posts

Your site should have a *unique ID* distinguishing it from all other NETS 2120 sites. This will be your team number (e.g. `g01`). Through the Kafka `FederatedPosts` channel, your site should both *read* and *send* posts that can be used by other projects' InstaLite sites. Posts should have a JSON component called `post_json`:

```
{
    username: 'bobhope',
    source_site: 'g01',
    post_uuid_within_site: '40',
    post_text: 'A <b>bold</b> post',
    content_type: 'text/html'
}
```

as well as a binary component, `attach`, including an optional image.  The `content_type` field in the JSON should be the HTTP content-type associated with the binary data.


## User interactions with the Feed

**User Posts**: Each user should be able to make posts, containing an optional image and optional text. The post might include hashtags. Although each field is optional, a post should at least have *some* content to be valid.

**Commenting**: Users should be able to add a comment under any post they can see (that is, both their own posts and their friends’ posts). These comments should appear under the post they respond to, in a threaded fashion.

**User actions**:
Users should be able to “like” posts, and should be able to comment on them.  If a post or comment includes **hashtags** a link between the hashtag and post should be established.

