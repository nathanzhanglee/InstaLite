# Chatbot/Langchain Integration

Our chatbot should be able to answer questions based on Retrieval Augmented Generation over movie info (actors, titles, etc.).

To support this, the simplest approach is to pre-index contents from your MySQL database into your vector database (ChromaDB), via *text embeddings*. You should be able to query (using `rdbms.js`) things like movie descriptions and info, actors, users, etc., compute embeddings for them, and embed them into ChromaDB.  Make sure you have an understanding, for the integration step, of how you'll share the same ChromaDB database with your teammate who is working on image matching.

## Computing Embeddings
ChromaDB (and vector.js) are capable of storing multiple collections (with different embeddings), so your component should coexist with the image embeddings table used for face matching. You can create an embedding of text like this (see [here](https://cheatsheet.md/langchain-tutorials/langchain-embeddings)):

```javascript
import { OpenAIEmbeddings } from "langchain/embeddings/openai";

const embeddings = new OpenAIEmbeddings({
    modelName: "text-embedding-ada-002"
  });

  try {
    const result = await embeddings.embedQuery(paragraph);
    console.log("Embeddings:", result);
    return result;
  } catch (error) {
    console.error("Error embedding paragraph:", error);
    return null;
  }
```

## Storing Embeddings
And use `vector.js` from Homework 2 MS1 (or equivalent) to put items into a table by embedding, and get the matching items by embedding.

## Langchain Integration / Chatbot

Langchain supports *retrieval augmented generation*, whereby you can create a prompt to call GPT with the top results from your database query retrieval.  You will generally want to create a PromptTemplate like this:

```
Answer the question based on the following context:

      Context:
      {context}

      Question: {question}

      Answer:
```

and then populate it with the values of {context} and {question}.
