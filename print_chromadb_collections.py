import chromadb

# Initialize the ChromaDB client
client = chromadb.PersistentClient(path="./chroma/chroma_db")  # Replace with your actual path

# List all collections
collections = client.list_collections()

# Print the collection names
print("Available collections:", collections)