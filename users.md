# Users, Accounts, Security

New users should be able to sign up for an account. They should enter, at the very least, a login name, a password, a first and last name, an email address, an affiliation (such as Penn), and a birthday.

* The password should be *salted* and encrypted following best practices.
* Users should be able to *upload a profile photo* -- on mobile, perhaps even taking a selfie for that photo -- as a starting point.
* Users should include a number of hashtags of interests.  The top-10 most popular hash tags (by occurrence) should be shown so they have a starting point.
* Users should have a *site ID* (string) unique to your project, so you can share user actions with other projects. (SiteID:username should be unique.)

**Linking to an Actor**.
The user should be able to link to a given *actor account* from IMDB by matching the *embedding* of their selfie with the *profile photos* of the 5 most similar actors.  They will be able to choose from those actors.  Multiple users may link to the same actor.

**Suggesting Actor Links**.
We will provide you with a set of actor embeddings and profile photos in the form of a ChromaDB database. You should use this to match the user's selfie to the actor's profile photos.

