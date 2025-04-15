import { getChatBot, getVectorStore } from "./backend/routes/routes.js";
import { ChatOpenAI } from "@langchain/openai";
import { PromptTemplate } from "@langchain/core/prompts";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { OpenAIEmbeddings } from "@langchain/openai";
import { formatDocumentsAsString } from "langchain/util/document";
import { RunnableSequence, RunnablePassthrough } from "@langchain/core/runnables";
import { Chroma } from "@langchain/community/vectorstores/chroma";

// Test results if ChromaDB returns no matches.

// Test results if IMDB VectorStore returns empty context.

// Test error if embedding query fails.

// Test normal path based on fake question, question embedding, and LLM response.