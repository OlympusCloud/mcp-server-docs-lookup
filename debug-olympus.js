#!/usr/bin/env node

// Quick debug script to test Olympus docs indexing
const fs = require('fs');
const path = require('path');

async function debugOlympusDocs() {
    console.log('🔍 Debug Olympus Documentation Indexing');
    
    // Check if Olympus docs exist
    const olympusPath = '/Users/scotthoughton/olympus-cloud/mcp-server-docs-lookup/data/repositories/olympus-docs';
    
    if (!fs.existsSync(olympusPath)) {
        console.log('❌ Olympus docs not found at:', olympusPath);
        return;
    }
    
    console.log('✅ Olympus docs found');
    
    // List some key files
    const files = fs.readdirSync(olympusPath);
    console.log('📁 Root files:', files.slice(0, 10));
    
    // Check for README
    const readmePath = path.join(olympusPath, 'README.md');
    if (fs.existsSync(readmePath)) {
        const content = fs.readFileSync(readmePath, 'utf8');
        console.log('📖 README.md preview (first 200 chars):');
        console.log(content.substring(0, 200) + '...');
        
        // Simple test: manually create a search index entry
        console.log('\n🔧 Testing simple text search...');
        const searchTerm = 'Olympus';
        const matches = content.toLowerCase().includes(searchTerm.toLowerCase());
        console.log(`Search for "${searchTerm}":`, matches ? '✅ FOUND' : '❌ NOT FOUND');
        
        if (matches) {
            console.log('🎉 Olympus documentation is accessible and contains searchable content!');
            
            // Extract a few lines containing "Olympus"
            const lines = content.split('\n').filter(line => 
                line.toLowerCase().includes('olympus')
            ).slice(0, 3);
            
            console.log('\n📝 Sample matching lines:');
            lines.forEach((line, i) => {
                console.log(`${i + 1}. ${line.trim()}`);
            });
        }
    }
    
    // Check for other key files
    const keyFiles = [
        'DOCUMENTATION-INDEX.md',
        'IMPLEMENTATION-OVERVIEW.md', 
        'architecture',
        'guides',
        'api'
    ];
    
    console.log('\n📋 Key documentation files/folders:');
    keyFiles.forEach(file => {
        const exists = fs.existsSync(path.join(olympusPath, file));
        console.log(`  ${exists ? '✅' : '❌'} ${file}`);
    });
}

debugOlympusDocs().catch(console.error);