import tf from '@tensorflow/tfjs-node';
import faceapi from '@vladmandic/face-api';
import path from 'node:path';

/**
 * Helper function, converts "descriptor" Int32Array to JavaScript array
 * @param {Int32Array} array 
 * @returns JavaScript array
 */
const getArray = (array) => {
    var ret = [];
    for (var i = 0; i < array.length; i++) {
      ret.push(array[i]);
    }
    return ret;
  }

class FaceEmbed {
  constructor(modelPath = 'models') {
    this.faceapi = faceapi;
    this.tf = tf;
    this.faceapi.env.monkeyPatch({ tf });
    this.modelLoaded = false;
    this.modelPath = modelPath;
  }

  async loadModel() {
    let modelPath = this.modelPath;
    console.log("Initializing FaceAPI...");

    await tf.ready();
    try {
      await faceapi.nets.ssdMobilenetv1.loadFromDisk(modelPath);
    } catch (err) {
      if (err.code === 'ENOENT') {
        console.log("[WARN] in face_embed.js > loadModel(): weights not found. Searching parent directory...");
        modelPath = path.resolve("..", modelPath);                   //could be searching in backend when need to search in home dir
        await faceapi.nets.ssdMobilenetv1.loadFromDisk(modelPath);
      } else {
        throw err;
      }
    }
    this.optionsSSDMobileNet = new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5, maxResults: 1 });
    await this.faceapi.nets.faceLandmark68Net.loadFromDisk(modelPath);
    this.modelLoaded = true;
    console.log("Model loaded successfully!");
    return this.faceapi.nets.faceRecognitionNet.loadFromDisk(modelPath);
  }

    /**
     * Compute the face embeddings within an image buffer
     * 
     * @param {*} buffer
     * @returns List of detected faces' embeddings
     */
  async getEmbeddingsFromBuffer(buffer) {
    if (!this.modelLoaded) {
      await this.loadModel();  //dynamic loading: won't happen if method not called, happens only once
    }
    const tensor = tf.node.decodeImage(buffer, 3);
  
    const faces = await faceapi.detectAllFaces(tensor, this.optionsSSDMobileNet)
      .withFaceLandmarks()
      .withFaceDescriptors();
    tf.dispose(tensor);
  
    // For each face, get the descriptor and convert to a standard array
    return faces.map((face) => getArray(face.descriptor));
  };  

  async getEmbeddingsFromPath(path) {
    const buffer = fs.readFileSync(path);

    return this.getEmbeddingsFromBuffer(buffer);
  }
  

    /**
   * Given a list of images, index their embeddings
   * within the ChromaDB collection.
   * 
   * @param {*} pathName Path to image
   * @param {*} image Image filename
   * @param {*} collection ChromaDB collection
   */
  async indexAllFaces(pathName, image, collection) {
    const embeddings = await this.getEmbeddingsFromPath(pathName);

    var success = true;
    var inx = 1;
    for (var embedding of embeddings) {
      const data = {
        ids: [image + '-' + inx++],
        embeddings: [
          embedding,
        ],
        metadatas: [{ source: "imdb" } ],
        documents: [ image ],
      };
      var res = await collection.add(data);

      if (res === true) {
        console.info("Added image embedding for " + image + " to collection.");
      } else {
        console.error(res.error);
        success = false;
      }
    }
    return success;
  }

  /**
   * 
   * @param {*} collection ChromaDB collection
   * @param {*} image Path to image
   * @param {*} k How many results
   * @returns 
   */
  async findTopKMatchesToFile(collection, image, k) {
    var ret = [];

    var queryEmbeddings = await this.getEmbeddingsFromPath(image);
    for (var queryEmbedding of queryEmbeddings) {
      var results = await collection.query({
        queryEmbeddings: queryEmbedding,
        // By default embeddings aren't returned -- if you want
        // them you need to uncomment this line
        // include: ['embeddings', 'documents', 'metadatas'],
        nResults: k
      });

      ret.push(results);
    }
    return ret;
  }

  /**
   * 
   * @param {*} collection ChromaDB collection
   * @param {*} image Buffer with image
   * @param {*} k How many results
   * @returns 
   */
  async findTopKMatchesToBuffer(collection, image, k) {
    var ret = [];

    var queryEmbeddings = await this.getEmbeddingsFromBuffer(image);
    for (var queryEmbedding of queryEmbeddings) {
      var results = await collection.query({
        queryEmbeddings: queryEmbedding,
        // By default embeddings aren't returned -- if you want
        // them you need to uncomment this line
        // include: ['embeddings', 'documents', 'metadatas'],
        nResults: k
      });

      ret.push(results);
    }
    return ret;
  }
}

export default FaceEmbed;