#!/usr/bin/env node

/**
 * Manually trigger the document processing pipeline to test embedding generation
 */

import path from 'path';
import fs from 'fs/promises';

async function testDocumentProcessing() {
  console.log('📝 Testing document processing pipeline...\n');

  try {
    // Import services
    const { DocumentProcessor } = await import('./dist/services/document-processor.js');
    const { EmbeddingService } = await import('./dist/services/embedding.js');
    const { VectorStore } = await import('./dist/services/vector-store.js');

    console.log('📦 Imported services successfully');

    // Create services
    const documentProcessor = new DocumentProcessor();
    const embeddingService = new EmbeddingService({
      provider: 'local',
      model: 'Xenova/all-MiniLM-L6-v2',
    });
    const vectorStore = new VectorStore({
      type: 'qdrant',
      qdrant: {
        url: 'http://localhost:6333',
        collectionName: 'documentation'
      }
    }, 384);

    await vectorStore.initialize();
    console.log('🔌 Services initialized');

    // Read a test document
    const testFile = './README.md';
    const content = await fs.readFile(testFile, 'utf-8');
    console.log(`📖 Read test file: ${testFile} (${content.length} characters)`);

    // Mock repository config
    const mockRepo = {
      name: 'test-repo',
      category: 'documentation',
      priority: 'high',
      branch: 'main'
    };

    console.log('🔄 Processing document...');
    const result = await documentProcessor.processDocument(testFile, content, mockRepo);
    console.log(`✅ Document processed: ${result.chunks.length} chunks created`);

    console.log('🧠 Generating embeddings...');
    const chunksWithEmbeddings = await embeddingService.generateChunkEmbeddings(result.chunks);
    console.log(`✅ Embeddings generated: ${chunksWithEmbeddings.length} chunks with embeddings`);

    // Verify embeddings were created
    const firstChunk = chunksWithEmbeddings[0];
    if (firstChunk.embedding && firstChunk.embedding.length > 0) {
      console.log(`📊 First chunk embedding: ${firstChunk.embedding.length} dimensions`);
      console.log(`📝 First chunk content preview: ${firstChunk.content.substring(0, 100)}...`);
    } else {
      console.log('❌ No embedding found in first chunk');
      return;
    }

    console.log('💾 Storing chunks in vector store...');
    await vectorStore.upsertChunks(chunksWithEmbeddings);
    console.log('✅ Chunks stored successfully');

    // Check final state
    const stats = await vectorStore.getStats();
    console.log('\n📊 Final vector store stats:');
    console.log(`   Total documents: ${stats.totalDocuments}`);
    console.log(`   Total chunks: ${stats.totalChunks}`);
    console.log(`   Collection size (indexed vectors): ${stats.collectionSize}`);

    console.log('\n🎉 Document processing pipeline test completed successfully!');
    
    if (stats.collectionSize > 0) {
      console.log('✅ Embeddings are now properly indexed in the vector store!');
    } else {
      console.log('❌ Embeddings were not properly indexed.');
    }

  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

testDocumentProcessing().catch(console.error);
