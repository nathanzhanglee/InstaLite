//import jest from 'jest-mock';
import jest from 'jest';
import fs from 'fs';
import path from 'path';
import { get_db_connection } from '../models/rdbms.js';
import ChromaDB from '../models/vector.js';
import S3 from '../models/s3.js';
import FaceEmbed from '../models/face_embed.js';
import { registerProfilePicture } from '../routes/routes.js';

// Mock dependencies

jest.mock('../models/rdbms.js');
jest.mock('../models/vector.js');
jest.mock('../models/s3.js');
jest.mock('../models/face_embed.js');
jest.mock('fs');

describe('Profile Picture Upload and Vector Matching Tests', () => {
  let req, res, mysqlDbMock, chromaDbMock, s3Mock, faceEmbedMock;
  
  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Mock request and response objects
    req = {
      session: { user_id: 123 },
      file: {
        buffer: Buffer.from('test image data'),
        originalname: 'test_profile.jpg',
        mimetype: 'image/jpeg'
      }
    };
    
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
    
    // Configure mock database connections
    mysqlDbMock = {
      connect: jest.fn().mockResolvedValue(),
      send_sql: jest.fn().mockResolvedValue([{ affectedRows: 1 }])
    };
    get_db_connection.mockReturnValue(mysqlDbMock);
    
    // Configure mock S3
    s3Mock = {
      uploadBuffer: jest.fn().mockResolvedValue('https://bucket-name.s3.amazonaws.com/profile-pics/123-uuid.jpg'),
      fetchFileBinary: jest.fn().mockResolvedValue(Buffer.from('test image data'))
    };
    jest.mock('../models/s3.js', () => {
      return jest.fn().mockImplementation(() => s3Mock);
    });
    
    // Configure mock face embedding
    faceEmbedMock = {
      getEmbeddingsFromBuffer: jest.fn().mockResolvedValue([[0.1, 0.2, 0.3, 0.4]])
    };
    jest.mock('../models/face_embed.js', () => {
      return jest.fn().mockImplementation(() => faceEmbedMock);
    });
    
    // Configure mock ChromaDB
    chromaDbMock = {
      get_client: jest.fn().mockResolvedValue({}),
      get_items_from_table: jest.fn().mockResolvedValue({
        ids: ['actor1', 'actor2', 'actor3', 'actor4', 'actor5'],
        documents: [
          JSON.stringify({ name: 'Actor One', score: 0.92 }),
          JSON.stringify({ name: 'Actor Two', score: 0.85 }),
          JSON.stringify({ name: 'Actor Three', score: 0.78 }),
          JSON.stringify({ name: 'Actor Four', score: 0.72 }),
          JSON.stringify({ name: 'Actor Five', score: 0.65 })
        ],
        embeddings: [
          [0.11, 0.21, 0.31, 0.41],
          [0.12, 0.22, 0.32, 0.42],
          [0.13, 0.23, 0.33, 0.43],
          [0.14, 0.24, 0.34, 0.44],
          [0.15, 0.25, 0.35, 0.45]
        ]
      })
    };
    jest.mock('../models/vector.js', () => jest.fn().mockReturnValue(chromaDbMock));
    
    // Mock configuration
    fs.readFileSync.mockReturnValue(JSON.stringify({
      chromaDbName: 'actor_embeddings',
      s3BucketName: 'test-bucket'
    }));
  });
  
  test('should upload profile picture and return top matches', async () => {
    // Act
    await registerProfilePicture(req, res);
    
    // Assert
    // Check DB connection and query
    expect(mysqlDbMock.send_sql).toHaveBeenCalledWith(
      'UPDATE users SET profile_pic_link = ? WHERE user_id = ?',
      ['https://bucket-name.s3.amazonaws.com/profile-pics/123-uuid.jpg', 123]
    );
    
    // Check S3 upload
    expect(s3Mock.uploadBuffer).toHaveBeenCalledWith(
      expect.any(Buffer),
      expect.stringContaining('profile-pics'),
      'image/jpeg'
    );
    
    // Check face embedding generation
    expect(faceEmbedMock.getEmbeddingsFromBuffer).toHaveBeenCalledWith(
      expect.any(Buffer)
    );
    
    // Check ChromaDB query
    expect(chromaDbMock.get_items_from_table).toHaveBeenCalledWith(
      'actor_embeddings',
      [0.1, 0.2, 0.3, 0.4],
      5
    );
    
    // Check response
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      message: 'Profile picture added successfully',
      top_matches: expect.objectContaining({
        ids: expect.arrayContaining(['actor1', 'actor2', 'actor3', 'actor4', 'actor5']),
        documents: expect.any(Array),
        embeddings: expect.any(Array)
      })
    });
  });
  
  test('should return error when not logged in', async () => {
    // Arrange
    req.session.user_id = null;
    
    // Act
    await registerProfilePicture(req, res);
    
    // Assert
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: 'Not logged in.' });
    expect(mysqlDbMock.send_sql).not.toHaveBeenCalled();
  });
  
  test('should return error when no file uploaded', async () => {
    // Arrange
    req.file = null;
    
    // Act
    await registerProfilePicture(req, res);
    
    // Assert
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'No profile picture uploaded' });
    expect(mysqlDbMock.send_sql).not.toHaveBeenCalled();
  });
  
  test('should handle database error properly', async () => {
    // Arrange
    mysqlDbMock.send_sql.mockRejectedValue(new Error('Database error'));
    
    // Act
    await registerProfilePicture(req, res);
    
    // Assert
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Internal server error' });
  });
  
  test('should handle ChromaDB query error properly', async () => {
    // Arrange
    chromaDbMock.get_items_from_table.mockRejectedValue(new Error('ChromaDB error'));
    
    // Act
    await registerProfilePicture(req, res);
    
    // Assert
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Internal server error' });
  });
  
  test('should handle S3 upload error properly', async () => {
    // Arrange
    s3Mock.uploadBuffer.mockRejectedValue(new Error('S3 upload error'));
    
    // Act
    await registerProfilePicture(req, res);
    
    // Assert
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: expect.stringContaining('Internal server error') });
  });
});

// Test face embedding extraction function
describe('Face Embedding Extraction Tests', () => {
  let faceEmbed, s3Mock;
  
  beforeEach(() => {
    jest.clearAllMocks();
    
    s3Mock = {
      fetchFileBinary: jest.fn().mockResolvedValue(Buffer.from('test image data'))
    };
    jest.mock('../models/s3.js', () => {
      return jest.fn().mockImplementation(() => s3Mock);
    });
    
    faceEmbed = new FaceEmbed();
    faceEmbed.getEmbeddingsFromBuffer = jest.fn().mockResolvedValue([[0.1, 0.2, 0.3, 0.4]]);
  });
  
  test('should extract embedding from S3 path', async () => {
    // Arrange
    const filepath = 'https://bucket-name.s3.amazonaws.com/profile-pics/123-uuid.jpg';
    const expectedKey = 'profile-pics/123-uuid.jpg';
    
    // Act
    const result = await getEmbeddingFromPath(filepath);
    
    // Assert
    expect(s3Mock.fetchFileBinary).toHaveBeenCalledWith(expectedKey);
    expect(faceEmbed.getEmbeddingsFromBuffer).toHaveBeenCalledWith(expect.any(Buffer));
    expect(result).toEqual([0.1, 0.2, 0.3, 0.4]);
  });
});

// Integration test for the full flow from upload to matching
describe('Integration Test: Upload and Match', () => {
  // This would typically be done in an integration test environment, not unit tests
  
  test('should process the entire flow from upload to actor matching', async () => {
    // This test would involve setting up a mock server and making actual HTTP requests
    // Here we're just outlining what would be tested in a real integration test
    
    // 1. Create a mock file upload request
    // 2. Send the request to the profile picture upload endpoint
    // 3. Verify the image is stored in S3
    // 4. Verify the face embedding is extracted
    // 5. Verify the embedding is used to query ChromaDB
    // 6. Verify the top matches are returned
    // 7. Verify the profile picture link is updated in the database
    
    // For now, we'll just verify that the controller properly orchestrates these steps
    const filepath = 'https://bucket-name.s3.amazonaws.com/profile-pics/123-uuid.jpg';
    const embedding = [0.1, 0.2, 0.3, 0.4];
    
    // Mock the getEmbeddingFromPath function
    jest.mock('../routes.js', () => {
      const originalModule = jest.requireActual('../routes.js');
      return {
        ...originalModule,
        getEmbeddingFromPath: jest.fn().mockResolvedValue(embedding)
      };
    });
    
    await registerProfilePicture(req, res);
    
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      message: 'Profile picture added successfully',
      top_matches: expect.anything()
    }));
  });
});