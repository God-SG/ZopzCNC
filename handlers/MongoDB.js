const { MongoClient } = require("mongodb");

/**
 * MongoDB client wrapper for managing connections and performing operations.
 */
class MongoDB 
{
  constructor(uri, databaseName) 
  {
    this._uri = uri;
    this._dbName = databaseName;
    this.cachedMongoClient = new MongoClient(uri);
    this._connected = false;
  }

  async connectToDatabase() 
  {
    if (this._connected) 
    {
      throw new Error("MongoDB client is already connected.");
    }
    console.log('Connecting to MongoDB!');
    await this.cachedMongoClient.connect();
    console.log('Connected to MongoDB!');
    this._connected = true;
  }

  async reconnectToDatabase() 
  {
    console.log('Reconnecting to MongoDB!');
    await this.disconnectFromDatabase();
    this.cachedMongoClient = new MongoClient(this._uri);
    await this.cachedMongoClient.connect();
    console.log('Reconnected to MongoDB!');
    this._connected = true;
  }

  async disconnectFromDatabase() 
  {
    if (!this.cachedMongoClient) return;
    await this.cachedMongoClient.close();
    this.cachedMongoClient = null;
    this._connected = false;
  }

  getCollection(collectionName) 
  {
    if (!this.cachedMongoClient || !this._connected) 
    {
      throw new Error("MongoDB client is not connected. Call connectToDatabase() first.");
    }
    return this.cachedMongoClient.db(this._dbName).collection(collectionName);
  }

  async findDocumentByKey(key, value, collectionName) 
  {
    const collection = this.getCollection(collectionName);
    return await collection.findOne({ [key]: value });
  }

  async updateDocumentByKey(key, value, updateObj, collectionName) 
  {
    const collection = this.getCollection(collectionName);
    return await collection.updateOne({ [key]: value }, { $set: updateObj });
  }

  async updateDocumentArrayByKey(key, value, updateObj, collectionName) 
  {
    const collection = this.getCollection(collectionName);
    return await collection.updateOne({ [key]: value }, { $push: updateObj });
  }

  async updateAndRetrieveDocumentByKey(key, value, updateObj, collectionName) 
  {
    await this.updateDocumentByKey(key, value, updateObj, collectionName);
    return await this.findDocumentByKey(key, value, collectionName);
  }

  async addDocument(document, collectionName) 
  {
    const collection = this.getCollection(collectionName);
    return await collection.insertOne(document);
  }

  async hasKey(key, value, collectionName) 
  {
    const doc = await this.findDocumentByKey(key, value, collectionName);
    return !!doc;
  }

  async collectionsCount(collectionName) 
  {
    const collection = this.getCollection(collectionName);
    return await collection.countDocuments({});
  }
}

globalThis.MongoDB = MongoDB;