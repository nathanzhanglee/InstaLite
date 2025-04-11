async function getChatBot() {
  const prompt =
  PromptTemplate.fromTemplate('Given that {context}, answer the following question. {question}');
  const llm = new ChatOpenAI({ modelName: "gpt-3.5-turbo", temperature: 0 });

  const ragChain = RunnableSequence.from([
      {
          context: retriever.pipe(formatDocumentsAsString),
          question: new RunnablePassthrough(),
        },
    prompt,
    llm,
    new StringOutputParser(),
  ]);

  console.log(req.body.question);

  const result = await ragChain.invoke(req.body.question);
  res.status(200).send({message:result});
}

export {
  getChatBot
}