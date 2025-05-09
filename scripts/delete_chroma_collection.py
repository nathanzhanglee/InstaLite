import chromadb

# Initialize the Chroma client
client = chromadb.Client()

# Specify the name of the collection you want to delete
collection_name = "text_embeddings"

# Delete the collection
client.delete_collection(name=collection_name)
