# Face Matching

For the face matching component of the project, you will likely want to leverage:

1. ChromaDB and the `vector.js` file from Homework 2 MS1. You may want to use a prior zipfile with the ChromaDB loaded.  Note that you will need to figure out which directory in the zipfile contains the data. (It should have some UUID-looking files alongside chromadb.sqlite.)  Depending on this, you may need to update the command line parameter you use to run ChromaDB. (If you are using a version of `run-chroma.sh`, you may want to edit it.)

2. The `s3.js` file from Homework 2 MS 1, which includes mechanisms for uploading / downloading images (such as users' faces) to AWS.

3. You may want to take a look at the Homework 2 MS1 face indexer (`index-data.js`) and the related `face_embed.js` to figure out how to create face embeddings from images.

Be sure to synchronize with your teammate who is using ChromaDB for the chatbot, to make sure you can use the same ChromaDB database instance with different collection / table names.
