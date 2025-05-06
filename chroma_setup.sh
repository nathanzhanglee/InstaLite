apt-get install -y python3
apt install python3-pip
pip3 install chromadb

mkdir -p chroma
cd chroma
mkdir -p chroma_db    # will eventually store embeddings

npm install

mkdir -p face_models  # will store face models
cd face_models
if [ "$(ls -A)" ]; then
    echo "Face model files already exist. Skipping download."  # if for whatever reason someone runs this script twice, it won't cause issues
else
    wget https://github.com/justadudewhohacks/face-api.js/raw/master/weights/face_landmark_68_model-shard1
    wget https://github.com/justadudewhohacks/face-api.js/raw/master/weights/face_landmark_68_model-weights_manifest.json
    wget https://github.com/justadudewhohacks/face-api.js/raw/master/weights/face_landmark_68_tiny_model-shard1
    wget https://github.com/justadudewhohacks/face-api.js/raw/master/weights/face_landmark_68_tiny_model-weights_manifest.json
    wget https://github.com/justadudewhohacks/face-api.js/raw/master/weights/face_recognition_model-shard1
    wget  https://github.com/justadudewhohacks/face-api.js/raw/master/weights/face_recognition_model-shard2
    wget  https://github.com/justadudewhohacks/face-api.js/raw/master/weights/face_recognition_model-weights_manifest.json
    wget https://github.com/justadudewhohacks/face-api.js/raw/master/weights/ssd_mobilenetv1_model-shard1
    wget  https://github.com/justadudewhohacks/face-api.js/raw/master/weights/ssd_mobilenetv1_model-shard2
    wget  https://github.com/justadudewhohacks/face-api.js/raw/master/weights/ssd_mobilenetv1_model-weights_manifest.json
fi

npm rebuild @tensorflow/tfjs-node --build-from-source 
npm install long
cd ../..
