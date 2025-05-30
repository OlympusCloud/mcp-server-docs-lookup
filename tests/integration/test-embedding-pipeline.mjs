#!/usr/bin/env node

/**
 * Simple test to verify the embedding pipeline works
 */

async function testEmbeddingPipeline() {
  console.log('🧪 Testing embedding pipeline...\n');

  try {
    // Import the services using the compiled JavaScript
    const { EmbeddingService } = await import('./dist/services/embedding.js');
    const { QdrantClient } = await import('@qdrant/js-client-rest');

    console.log('📦 Imported services successfully');

    // Create embedding service
    const embeddingService = new EmbeddingService({
      provider: 'local',
      model: 'Xenova/all-MiniLM-L6-v2',
    });

    console.log('🧠 Created embedding service');

    // Test embedding generation
    const testText = "This is a test document for MCP server documentation.";
    console.log(`🔍 Generating embedding for: "${testText}"`);
    
    const embedding = await embeddingService.generateEmbedding(testText);
    console.log(`✅ Generated embedding with ${embedding.length} dimensions`);
    console.log(`📊 First 5 values: [${embedding.slice(0, 5).map(v => v.toFixed(4)).join(', ')}]`);

    // Test Qdrant connection
    const client = new QdrantClient({
      url: 'http://localhost:6333'
    });

    console.log('\n🔌 Testing Qdrant connection...');
    const collections = await client.getCollections();
    console.log(`✅ Connected to Qdrant, found ${collections.collections.length} collections`);

    // Test storing a point with embedding
    const testPoint = {
      id: Math.floor(Date.now() / 1000), // Use numeric ID
      vector: embedding,
      payload: {
        content: testText,
        type: 'test',
        timestamp: new Date().toISOString()
      }
    };

    console.log('💾 Testing point storage...');
    await client.upsert('documentation', {
      wait: true,
      points: [testPoint]
    });

    console.log('✅ Successfully stored test point with embedding');

    // Verify the point was stored
    const collectionInfo = await client.getCollection('documentation');
    console.log(`📊 Collection now has ${collectionInfo.points_count} points and ${collectionInfo.indexed_vectors_count} indexed vectors`);

    console.log('\n🎉 Embedding pipeline test completed successfully!');
    console.log('\n💡 This proves the embedding service and Qdrant integration work correctly.');
    console.log('The issue is likely in the document processing pipeline or event handling.');

  } catch (error) {
    console.error('❌ Test failed:', error);
    
    if (error.message && error.message.includes('No such file')) {
      console.log('\n💡 Suggestion: Run "npm run build" first to compile the TypeScript code.');
    }
  }
}

testEmbeddingPipeline().catch(console.error);
