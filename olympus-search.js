#!/usr/bin/env node

// Simple Olympus documentation search - bypass vector store
const fs = require('fs');
const path = require('path');

function searchOlympusDocs(query) {
    console.log(`🔍 Searching Olympus Documentation for: "${query}"`);
    
    const olympusPath = '/Users/scotthoughton/olympus-cloud/mcp-server-docs-lookup/data/repositories/olympus-docs';
    const results = [];
    
    function searchInFile(filePath, relativePath) {
        try {
            const content = fs.readFileSync(filePath, 'utf8');
            const lines = content.split('\n');
            
            lines.forEach((line, lineNum) => {
                if (line.toLowerCase().includes(query.toLowerCase())) {
                    results.push({
                        file: relativePath,
                        line: lineNum + 1,
                        content: line.trim(),
                        context: lines.slice(Math.max(0, lineNum - 1), lineNum + 2).join('\n')
                    });
                }
            });
        } catch (error) {
            // Skip files that can't be read
        }
    }
    
    function walkDirectory(dir, baseDir) {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            const relativePath = path.relative(baseDir, fullPath);
            
            if (entry.isDirectory() && !entry.name.startsWith('.')) {
                walkDirectory(fullPath, baseDir);
            } else if (entry.isFile() && (
                entry.name.endsWith('.md') || 
                entry.name.endsWith('.txt') ||
                entry.name.endsWith('.json')
            )) {
                searchInFile(fullPath, relativePath);
            }
        }
    }
    
    walkDirectory(olympusPath, olympusPath);
    
    // Display results
    console.log(`\n📊 Found ${results.length} matches\n`);
    
    results.slice(0, 10).forEach((result, i) => {
        console.log(`${i + 1}. 📄 ${result.file}:${result.line}`);
        console.log(`   💡 ${result.content}`);
        console.log('');
    });
    
    if (results.length > 10) {
        console.log(`... and ${results.length - 10} more matches`);
    }
    
    return results;
}

// Get search term from command line
const query = process.argv[2] || 'Olympus Cloud';
searchOlympusDocs(query);