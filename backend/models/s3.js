import { S3Client, ListObjectsV2Command, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { fromIni } from '@aws-sdk/credential-provider-ini';
import fs from 'fs';
import path from 'path';

// Helper function to convert stream to string
const streamToString = (stream) => new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', (chunk) => chunks.push(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
  });

  // Helper function to convert stream to string
const streamToBuffer = (stream) => new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', (chunk) => chunks.push(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(Buffer.concat(chunks)));
  });

  
class S3KeyValueStore {
  bucketName;
  client;

  constructor(bucket, profile = 'default') {
    this.bucketName = bucket;
    this.client = new S3Client({ region: 'us-east-1', credentials: fromIni({ profile: profile }) });
  }

  async listObjects() {
    const params = {
      Bucket: this.bucketName
    };
  
    try {
      const data = await this.client.send(new ListObjectsV2Command(params));
      console.log('Objects in bucket:', data);
      return data;
    } catch (err) {
      console.error('Error listing objects:', err);
      throw err;
    }
  }

  async fetchFile(key) {
    const params = {
      Bucket: this.bucketName,
      Key: key
    };
  
    try {
      const data = await this.client.send(new GetObjectCommand(params));
      const body = await streamToString(data.Body);
      console.log('File size:', body.length);
      return body;
    } catch (err) {
      console.error('Error fetching file:', err);
      throw err;
    }
  }

  async fetchFileBinary(key) {
    const params = {
      Bucket: this.bucketName,
      Key: key
    };
  
    try {
      const data = await this.client.send(new GetObjectCommand(params));
      const body = await streamToBuffer(data.Body);
      console.log('File size:', body.length);
      return body;
    } catch (err) {
      console.error('Error fetching file:', err);
      throw err;
    }
  }

  async uploadBuffer(buffer, key, contentType) {
    const params = {
      Bucket: this.bucketName,
      Key: key,
      Body: buffer,
      ContentType: contentType
    };
  
    try {
      await this.client.send(new PutObjectCommand(params));
      console.log(`Successfully uploaded ${key} to ${this.bucketName}`);
      return `https://${this.bucketName}.s3.amazonaws.com/${key}`;
    } catch (err) {
      console.error(`Error uploading ${key}:`, err);
      throw err;
    }
  }

  async uploadFile(filePath, bucketName, keyPrefix) {
    const fileContent = fs.readFileSync(filePath);
    const key = path.join(keyPrefix, path.relative(process.cwd(), filePath));
  
    const params = {
      Bucket: bucketName,
      Key: key,
      Body: fileContent
    };
  
    try {
      await this.client.send(new PutObjectCommand(params));
      console.log(`Successfully uploaded ${key} to ${bucketName}`);
    } catch (err) {
      console.error(`Error uploading ${key}:`, err);
    }
  }
  
  async uploadDirectory(directoryPath, bucketName, keyPrefix = '') {
    const files = fs.readdirSync(directoryPath);
  
    for (const file of files) {
      const filePath = path.join(directoryPath, file);
      const stat = fs.statSync(filePath);
  
      if (stat.isFile()) {
        await this.uploadFile(filePath, bucketName, keyPrefix);
      } else if (stat.isDirectory()) {
        await this.uploadDirectory(filePath, bucketName, path.join(keyPrefix, file));
      }
    }
  }

  async downloadFile(bucketName, key, downloadPath) {
    const params = {
      Bucket: bucketName,
      Key: key
    };
  
    try {
      const data = await this.client.send(new GetObjectCommand(params));
      const fileStream = fs.createWriteStream(downloadPath);
      data.Body.pipe(fileStream);
      console.log(`Successfully downloaded ${key} to ${downloadPath}`);
    } catch (err) {
      console.error(`Error downloading ${key}:`, err);
    }
  }
  
  async downloadDirectory(bucketName, prefix, downloadDir) {
    const params = {
      Bucket: bucketName,
      Prefix: prefix
    };
    try {
        const data = await this.client.send(new ListObjectsV2Command(params));
        const files = data.Contents;
    
        for (const file of files) {
          const key = file.Key;
          const relativePath = path.relative(prefix, key);
          const downloadPath = path.join(downloadDir, relativePath);
    
          // Ensure the directory exists
          fs.mkdirSync(path.dirname(downloadPath), { recursive: true });
    
          await this.downloadFile(bucketName, key, downloadPath);
        }
    } catch (err) {
        console.error('Error listing objects:', err);
    }
  }
}


export default S3KeyValueStore;
