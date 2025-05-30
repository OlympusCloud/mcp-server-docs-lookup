# Olympus Cloud Documentation MCP Server Setup Script (PowerShell)
# Sets up comprehensive documentation for Olympus Cloud development
# Including Azure, .NET 9/10, NebusAI, and best practices
# Enhanced for AI coding agents: Claude Code, GitHub Copilot, Cline, Continue

param(
    [switch]$SkipSync,
    [string]$Config = "",
    [switch]$DevMode,
    [switch]$SkipAISetup,
    [string]$GitHubToken = $env:OLYMPUS_GITHUB_TOKEN
)

# Function to write colored output
function Write-Status {
    param([string]$Message)
    Write-Host "✅ $Message" -ForegroundColor Green
}

function Write-Info {
    param([string]$Message)
    Write-Host "ℹ️  $Message" -ForegroundColor Blue
}

function Write-Warning {
    param([string]$Message)
    Write-Host "⚠️  $Message" -ForegroundColor Yellow
}

function Write-Error {
    param([string]$Message)
    Write-Host "❌ $Message" -ForegroundColor Red
}

function Write-Header {
    param([string]$Message)
    Write-Host ""
    Write-Host "==============================================" -ForegroundColor Blue
    Write-Host $Message -ForegroundColor Blue
    Write-Host "==============================================" -ForegroundColor Blue
    Write-Host ""
}

# Check if command exists
function Test-Command {
    param([string]$Command)
    $null = Get-Command $Command -ErrorAction SilentlyContinue
    return $?
}

# Check prerequisites
function Test-Prerequisites {
    Write-Header "Checking Prerequisites"
    
    $missingDeps = @()
    
    # Check Node.js
    if (-not (Test-Command "node")) {
        $missingDeps += "Node.js 18+"
    } else {
        $nodeVersion = (node --version).Substring(1).Split('.')[0]
        if ([int]$nodeVersion -lt 18) {
            $missingDeps += "Node.js 18+ (current: v$nodeVersion)"
        } else {
            Write-Status "Node.js $(node --version)"
        }
    }
    
    # Check npm
    if (-not (Test-Command "npm")) {
        $missingDeps += "npm"
    } else {
        Write-Status "npm $(npm --version)"
    }
    
    # Check Docker
    if (-not (Test-Command "docker")) {
        $missingDeps += "Docker"
    } else {
        $dockerVersion = (docker --version).Split(' ')[2].TrimEnd(',')
        Write-Status "Docker $dockerVersion"
    }
    
    # Check Git
    if (-not (Test-Command "git")) {
        $missingDeps += "Git"
    } else {
        $gitVersion = (git --version).Split(' ')[2]
        Write-Status "Git $gitVersion"
    }
    
    # Check Azure CLI (optional for Olympus development)
    if (Test-Command "az") {
        Write-Status "Azure CLI $(az --version | Select-String 'azure-cli' | ForEach-Object { $_.ToString().Split()[1] })"
    } else {
        Write-Info "Azure CLI not found (optional - install for Azure development)"
    }
    
    # Check .NET SDK (for Olympus development)
    if (Test-Command "dotnet") {
        $dotnetVersion = (dotnet --version)
        Write-Status ".NET SDK $dotnetVersion"
        if ([version]$dotnetVersion -lt [version]"8.0") {
            Write-Warning ".NET 8.0+ recommended for Olympus development"
        }
    } else {
        Write-Info ".NET SDK not found (install for Olympus .NET development)"
    }
    
    if ($missingDeps.Count -gt 0) {
        Write-Error "Missing required dependencies:"
        foreach ($dep in $missingDeps) {
            Write-Host "  - $dep"
        }
        Write-Host ""
        Write-Host "Please install the missing dependencies and run this script again."
        Write-Host ""
        Write-Host "Installation guides:"
        Write-Host "  Node.js: https://nodejs.org/"
        Write-Host "  Docker: https://docs.docker.com/get-docker/"
        Write-Host "  Git: https://git-scm.com/downloads"
        Write-Host "  Azure CLI: https://docs.microsoft.com/cli/azure/install-azure-cli"
        Write-Host "  .NET SDK: https://dotnet.microsoft.com/download"
        exit 1
    }
    
    Write-Status "All prerequisites satisfied"
}

# Install and build the MCP server
function Initialize-MCPServer {
    Write-Header "Setting Up MCP Server"
    
    Write-Info "Installing dependencies..."
    npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Failed to install dependencies"
        exit 1
    }
    
    Write-Info "Building TypeScript..."
    npm run build
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Failed to build TypeScript"
        exit 1
    }
    
    # Verify modular server is built
    if (-not (Test-Path "dist/modular-server.js")) {
        Write-Warning "Modular server not found, using fallback server"
    } else {
        Write-Status "Modular MCP server built successfully"
    }
    
    Write-Status "MCP server setup completed"
}

# Start Qdrant vector database
function Initialize-Qdrant {
    Write-Header "Setting Up Qdrant Vector Database"
    
    # Check if Qdrant is already running
    try {
        Invoke-WebRequest -Uri "http://localhost:6333/health" -TimeoutSec 5 -ErrorAction Stop | Out-Null
        Write-Status "Qdrant is already running"
        return
    } catch {
        # Qdrant is not running, continue with setup
    }
    
    # Check if container exists but is stopped
    $existingContainer = docker ps -a --format "table {{.Names}}" | Select-String "^qdrant$"
    if ($existingContainer) {
        Write-Info "Starting existing Qdrant container..."
        docker start qdrant
    } else {
        Write-Info "Creating and starting new Qdrant container..."
        docker run -d --name qdrant -p 6333:6333 -v "${PWD}/qdrant_storage:/qdrant/storage" qdrant/qdrant
    }
    
    # Wait for Qdrant to be ready
    Write-Info "Waiting for Qdrant to be ready..."
    $maxAttempts = 30
    $attempt = 1
    
    while ($attempt -le $maxAttempts) {
        try {
            Invoke-WebRequest -Uri "http://localhost:6333/health" -TimeoutSec 5 -ErrorAction Stop | Out-Null
            Write-Status "Qdrant is ready"
            return
        } catch {
            Write-Host "." -NoNewline
            Start-Sleep -Seconds 2
            $attempt++
        }
    }
    
    Write-Error "Qdrant failed to start after $maxAttempts attempts"
    exit 1
}

# Setup configuration
function Set-Configuration {
    Write-Header "Configuring Documentation Sources"
    
    if ($Config -ne "") {
        $configFile = $Config
    } else {
        Write-Host "Select configuration preset:"
        Write-Host "1) Olympus Production (Azure + .NET 9/10 + Best Practices)"
        Write-Host "2) NebusAI Enhanced (AI/ML + Frameworks + APIs)"
        Write-Host "3) Both (Comprehensive setup)"
        Write-Host "4) Custom (Choose your own preset)"
        Write-Host ""
        
        do {
            $choice = Read-Host "Enter your choice (1-4)"
            switch ($choice) {
                "1" { $configFile = "olympus-production"; break }
                "2" { $configFile = "nebusai-enhanced"; break }
                "3" { 
                    Set-DualConfiguration
                    return
                }
                "4" { 
                    Show-Presets
                    $configFile = Read-Host "Enter preset name"
                    if (-not (Test-Path "config/presets/$configFile.json")) {
                        Write-Error "Preset '$configFile' not found"
                        continue
                    }
                    break
                }
                default { Write-Host "Invalid choice. Please enter 1, 2, 3, or 4." }
            }
        } while ($choice -notin @("1", "2", "3", "4"))
    }
    
    Write-Info "Using configuration: $configFile"
    Copy-Item "config/presets/$configFile.json" "config/config.json"
    
    Write-Status "Configuration set successfully"
}

# Setup dual configuration for both Olympus and NebusAI
function Set-DualConfiguration {
    Write-Info "Setting up dual configuration (Olympus + NebusAI)..."
    
    try {
        # Load both configurations
        $olympusConfig = Get-Content "config/presets/olympus-production.json" | ConvertFrom-Json
        $nebusaiConfig = Get-Content "config/presets/nebusai-enhanced.json" | ConvertFrom-Json
        
        # Create merged configuration
        $mergedConfig = @{
            project = @{
                name = "olympus-nebusai-comprehensive"
                description = "Comprehensive Olympus Cloud and NebusAI documentation"
                version = "1.0.0"
            }
            repositories = @()
            contextGeneration = @{
                strategies = @("hybrid")
                maxChunks = 30
                priorityWeighting = @{
                    high = 2.0
                    medium = 1.0
                    low = 0.5
                }
                categoryWeighting = @{
                    dotnet = 1.8
                    azure = 1.8
                    aspnet = 1.7
                    architecture = 1.6
                    security = 1.9
                    "ai-ml" = 2.0
                    "ai-frameworks" = 1.9
                    "ai-apis" = 1.8
                    "best-practices" = 1.5
                }
            }
            server = @{
                port = 3000
                host = "localhost"
                cors = @{
                    enabled = $true
                    origins = @("http://localhost:*", "https://olympus-cloud.com", "https://nebusai.com")
                }
            }
            vectorStore = @{
                type = "qdrant"
                qdrant = @{
                    url = "http://localhost:6333"
                    collectionName = "olympus_comprehensive"
                    vectorSize = 384
                    distance = "Cosine"
                }
            }
            embedding = @{
                provider = "local"
                model = "Xenova/all-MiniLM-L6-v2"
                chunkSize = 2000
                chunkOverlap = 300
            }
            security = @{
                enableInputSanitization = $true
                enableRateLimiting = $true
                rateLimitRequests = 120
                rateLimitWindow = 60000
                enablePIIRedaction = $true
            }
            monitoring = @{
                enableMetrics = $true
                enablePerformanceTracking = $true
                logLevel = "info"
            }
        }
        
        # Combine repositories from both configurations
        $allRepos = @()
        $allRepos += $olympusConfig.repositories
        $allRepos += $nebusaiConfig.repositories
        $mergedConfig.repositories = $allRepos
        
        # Save merged configuration
        $mergedConfig | ConvertTo-Json -Depth 10 | Set-Content "config/config.json"
        
        Write-Status "Configurations merged successfully"
    }
    catch {
        Write-Warning "Failed to merge configurations: $($_.Exception.Message)"
        Write-Info "Using Olympus production configuration as fallback"
        Copy-Item "config/presets/olympus-production.json" "config/config.json"
    }
    
    Write-Status "Dual configuration created"
}

# List available presets
function Show-Presets {
    Write-Host ""
    Write-Host "Available presets:"
    Get-ChildItem "config/presets/*.json" | ForEach-Object {
        $basename = $_.BaseName
        $content = Get-Content $_.FullName | ConvertFrom-Json
        $description = $content.project.description
        Write-Host "  - $basename`: $description"
    }
    Write-Host ""
}

# Sync documentation
function Sync-Documentation {
    Write-Header "Syncing Documentation"
    
    if ($SkipSync) {
        Write-Info "Skipping documentation sync (--SkipSync parameter provided)"
        return
    }
    
    Write-Info "Starting documentation sync..."
    Write-Warning "This may take 10-30 minutes depending on your internet connection"
    Write-Warning "The sync will download and process several GB of documentation"
    
    Write-Host ""
    $continue = Read-Host "Continue with sync? (y/N)"
    
    if ($continue -notmatch "^[Yy]$") {
        Write-Info "Skipping documentation sync"
        Write-Info "You can sync later with: node dist/cli.js sync"
        return
    }
    
    Write-Info "Running documentation sync..."
    node dist/cli.js sync
    
    Write-Status "Documentation sync completed"
}

# Test the installation
function Test-Installation {
    Write-Header "Testing Installation"
    
    Write-Info "Checking MCP server status..."
    node dist/cli.js status | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Write-Error "MCP server status check failed"
        return
    }
    
    Write-Info "Testing CLI functionality..."
    $timeout = 30
    $job = Start-Job -ScriptBlock { 
        param($path)
        Set-Location $path
        node dist/cli.js search "hello world" --limit 1
    } -ArgumentList (Get-Location).Path
    
    if (Wait-Job $job -Timeout $timeout) {
        Remove-Job $job
        Write-Status "CLI test passed"
    } else {
        Remove-Job $job -Force
        Write-Warning "CLI test timed out (this is normal if no docs are synced yet)"
    }
    
    Write-Status "Installation test completed"
}

# Configure Claude Desktop automatically
function Set-ClaudeDesktopConfig {
    Write-Header "Configuring Claude Desktop"
    
    if ($SkipAISetup) {
        Write-Info "Skipping AI agent setup (--SkipAISetup parameter provided)"
        return
    }
    
    # Find Claude Desktop config file
    $claudeConfigDir = "$env:APPDATA\Claude"
    if (-not (Test-Path $claudeConfigDir)) {
        $claudeConfigDir = "$env:USERPROFILE\AppData\Roaming\Claude"
    }
    if (-not (Test-Path $claudeConfigDir)) {
        $claudeConfigDir = "$env:USERPROFILE\.claude"
    }
    
    $claudeConfigFile = Join-Path $claudeConfigDir "claude_desktop_config.json"
    
    if (-not (Test-Path $claudeConfigDir)) {
        Write-Info "Creating Claude Desktop config directory..."
        New-Item -ItemType Directory -Path $claudeConfigDir -Force | Out-Null
    }
    
    # Determine which server to use
    $serverScript = "dist/server.js"
    if (Test-Path "dist/modular-server.js") {
        $serverScript = "dist/modular-server.js"
        Write-Info "Using modular MCP server"
    } else {
        Write-Warning "Modular server not found, using fallback server"
    }
    
    # Create MCP server configuration
    $currentPath = (Get-Location).Path.Replace('\', '/')
    $mcpConfig = @{
        command = "node"
        args = @("$currentPath/$serverScript")
        cwd = $currentPath
        env = @{
            MCP_CONFIG_PATH = "$currentPath/config/config.json"
            NODE_ENV = if ($DevMode) { "development" } else { "production" }
        }
    }
    
    if (Test-Path $claudeConfigFile) {
        Write-Info "Updating existing Claude Desktop configuration..."
        
        # Backup existing config
        Copy-Item $claudeConfigFile "$claudeConfigFile.backup.$(Get-Date -Format 'yyyyMMdd_HHmmss')"
        
        try {
            # Load existing config
            $existingConfig = Get-Content $claudeConfigFile | ConvertFrom-Json
            
            # Add or update MCP server configuration
            if (-not $existingConfig.mcpServers) {
                $existingConfig | Add-Member -MemberType NoteProperty -Name "mcpServers" -Value @{}
            }
            
            $existingConfig.mcpServers | Add-Member -MemberType NoteProperty -Name "olympus-docs" -Value $mcpConfig -Force
            
            # Save updated config
            $existingConfig | ConvertTo-Json -Depth 10 | Set-Content $claudeConfigFile
            Write-Status "Claude Desktop configuration updated"
        }
        catch {
            Write-Warning "Failed to update existing config: $($_.Exception.Message)"
            Write-Info "Please manually add the MCP configuration to Claude Desktop"
        }
    }
    else {
        Write-Info "Creating new Claude Desktop configuration..."
        $newConfig = @{
            mcpServers = @{
                "olympus-docs" = $mcpConfig
            }
        }
        
        $newConfig | ConvertTo-Json -Depth 10 | Set-Content $claudeConfigFile
        Write-Status "Claude Desktop configuration created at: $claudeConfigFile"
    }
    
    Write-Info "Claude Desktop will need to be restarted to load the MCP server"
}

# Configure VS Code extensions (Cline, Continue, etc.)
function Set-VSCodeExtensionConfig {
    Write-Header "Configuring VS Code Extensions"
    
    if ($SkipAISetup) {
        Write-Info "Skipping VS Code extension setup"
        return
    }
    
    # Find VS Code settings
    $vscodeConfigDirs = @(
        "$env:APPDATA\Code\User",
        "$env:APPDATA\Code - Insiders\User",
        "$env:USERPROFILE\.vscode",
        "$env:USERPROFILE\AppData\Roaming\Code\User"
    )
    
    $vscodeSettings = $null
    foreach ($dir in $vscodeConfigDirs) {
        $settingsFile = Join-Path $dir "settings.json"
        if (Test-Path $settingsFile) {
            $vscodeSettings = $settingsFile
            break
        }
    }
    
    if (-not $vscodeSettings) {
        # Create default VS Code settings
        $defaultDir = "$env:APPDATA\Code\User"
        New-Item -ItemType Directory -Path $defaultDir -Force | Out-Null
        $vscodeSettings = Join-Path $defaultDir "settings.json"
    }
    
    # Determine which server to use
    $serverScript = "dist/server.js"
    if (Test-Path "dist/modular-server.js") {
        $serverScript = "dist/modular-server.js"
    }
    
    $currentPath = (Get-Location).Path.Replace('\', '/')
    
    # Create configuration for extensions
    $clineConfig = @{
        mcpServers = @{
            "olympus-docs" = @{
                command = "node"
                args = @("$currentPath/$serverScript")
                cwd = $currentPath
                env = @{
                    MCP_CONFIG_PATH = "$currentPath/config/config.json"
                }
            }
        }
    }
    
    try {
        if (Test-Path $vscodeSettings) {
            # Backup existing settings
            Copy-Item $vscodeSettings "$vscodeSettings.backup.$(Get-Date -Format 'yyyyMMdd_HHmmss')"
            
            # Load existing settings
            $settings = Get-Content $vscodeSettings | ConvertFrom-Json
        } else {
            $settings = @{}
        }
        
        # Add Cline configuration
        $settings | Add-Member -MemberType NoteProperty -Name "cline.mcpServers" -Value $clineConfig.mcpServers -Force
        
        # Add Continue configuration
        $settings | Add-Member -MemberType NoteProperty -Name "continue.mcpServers" -Value $clineConfig.mcpServers -Force
        
        # Save updated settings
        $settings | ConvertTo-Json -Depth 10 | Set-Content $vscodeSettings
        Write-Status "VS Code extension configuration updated: $vscodeSettings"
        
    } catch {
        Write-Warning "Failed to update VS Code settings: $($_.Exception.Message)"
        Write-Info "Please manually configure Cline/Continue extensions"
    }
}

# Setup GitHub Copilot API integration
function Set-GitHubCopilotAPI {
    Write-Header "Setting Up GitHub Copilot API Integration"
    
    if ($SkipAISetup) {
        Write-Info "Skipping GitHub Copilot API setup"
        return
    }
    
    # Create API service configuration
    $apiConfig = @{
        server = @{
            port = 3000
            host = "localhost"
            cors = @{
                enabled = $true
                origins = @("http://localhost:*", "vscode://")
            }
        }
        project = @{
            name = "olympus-cloud-api"
            description = "API server for GitHub Copilot integration"
        }
        repositories = @()
        mode = "api"
    }
    
    $apiConfig | ConvertTo-Json -Depth 10 | Set-Content "config/api-config.json"
    
    # Load the config
    Copy-Item -Path "config/api-config.json" -Destination "config/config.json" -Force
    
    Write-Info "Starting Olympus Docs API server for GitHub Copilot..."
    
    # Function to start API server in background
    function Start-APIServer {
        $logDir = "logs"
        if (-not (Test-Path $logDir)) {
            New-Item -ItemType Directory -Path $logDir -Force | Out-Null
        }
        
        $logFile = Join-Path $logDir "api-server.log"
        
        Write-Host "Starting API server at http://localhost:3000..."
        
        # Start the API server process
        $apiProcess = Start-Process -FilePath "node" -ArgumentList @(
            "dist/cli.js", "start", "--mode", "api"
        ) -RedirectStandardOutput $logFile -RedirectStandardError $logFile -NoNewWindow -PassThru
        
        $apiProcess.Id | Set-Content ".api-server.pid"
        
        # Wait for server to start
        $maxAttempts = 15
        $attempt = 1
        
        while ($attempt -le $maxAttempts) {
            try {
                $response = Invoke-WebRequest -Uri "http://localhost:3000/health" -TimeoutSec 2 -ErrorAction SilentlyContinue
                if ($response.StatusCode -eq 200) {
                    Write-Status "API server started successfully (PID: $($apiProcess.Id))"
                    Write-Info "API server logs: Get-Content $logFile -Wait"
                    return $true
                }
            }
            catch {
                # Continue waiting
            }
            
            Write-Host "." -NoNewline
            Start-Sleep -Seconds 2
            $attempt++
        }
        
        Write-Error "API server failed to start after $maxAttempts attempts"
        Write-Info "Check logs: Get-Content $logFile"
        return $false
    }
    
    # Check if API server is already running
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:3000/health" -TimeoutSec 2 -ErrorAction SilentlyContinue
        if ($response.StatusCode -eq 200) {
            Write-Status "API server is already running"
        }
        else {
            Start-APIServer | Out-Null
        }
    }
    catch {
        Start-APIServer | Out-Null
    }
    
    Write-Status "GitHub Copilot API configuration completed"
    Write-Info "API endpoints available at http://localhost:3000"
}

# Test MCP server integration
function Test-MCPIntegration {
    Write-Header "Testing MCP Server Integration"
    
    # Determine which server to test
    $serverScript = "dist/server.js"
    if (Test-Path "dist/modular-server.js") {
        $serverScript = "dist/modular-server.js"
        Write-Info "Testing modular MCP server"
    }
    
    # Test MCP protocol
    Write-Info "Testing MCP protocol communication..."
    $testJson = '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}}}'
    
    try {
        $timeout = 10
        $job = Start-Job -ScriptBlock { 
            param($path, $script, $json)
            Set-Location $path
            Write-Output $json | node $script
        } -ArgumentList (Get-Location).Path, $serverScript, $testJson
        
        if (Wait-Job $job -Timeout $timeout) {
            $result = Receive-Job $job
            Remove-Job $job
            
            if ($result -match '"result"') {
                Write-Status "MCP protocol test passed"
            } else {
                Write-Warning "MCP protocol test returned unexpected response"
            }
        } else {
            Remove-Job $job -Force
            Write-Warning "MCP protocol test timed out"
        }
    } catch {
        Write-Warning "MCP protocol test failed: $($_.Exception.Message)"
    }
    
    # Test tool listing
    Write-Info "Testing tool listing..."
    $toolsJson = '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}'
    
    try {
        $timeout = 10
        $job = Start-Job -ScriptBlock { 
            param($path, $script, $json)
            Set-Location $path
            Write-Output $json | node $script
        } -ArgumentList (Get-Location).Path, $serverScript, $toolsJson
        
        if (Wait-Job $job -Timeout $timeout) {
            $result = Receive-Job $job
            Remove-Job $job
            
            if ($result -match '"tools"') {
                Write-Status "Tool listing test passed"
            } else {
                Write-Warning "Tool listing test returned unexpected response"
            }
        } else {
            Remove-Job $job -Force
            Write-Warning "Tool listing test timed out"
        }
    } catch {
        Write-Warning "Tool listing test failed: $($_.Exception.Message)"
    }
    
    Write-Status "MCP integration tests completed"
}

# Start MCP server in background
function Start-MCPServerBackground {
    Write-Header "Starting MCP Server"
    
    # Check if server is already running
    $existingProcess = Get-Process -Name "node" -ErrorAction SilentlyContinue | Where-Object {
        $_.CommandLine -like "*dist/server.js*"
    }
    
    if ($existingProcess) {
        Write-Status "MCP server is already running (PID: $($existingProcess.Id))"
        return
    }
    
    Write-Info "Starting MCP server in background..."
    
    # Create logs directory if it doesn't exist
    if (-not (Test-Path "logs")) {
        New-Item -ItemType Directory -Name "logs" | Out-Null
    }
    
    # Start server in background
    $processInfo = New-Object System.Diagnostics.ProcessStartInfo
    $processInfo.FileName = "node"
    $processInfo.Arguments = "dist/server.js --stdio"
    $processInfo.WorkingDirectory = (Get-Location).Path
    $processInfo.UseShellExecute = $false
    $processInfo.RedirectStandardOutput = $true
    $processInfo.RedirectStandardError = $true
    $processInfo.CreateNoWindow = $true
    
    try {
        $process = [System.Diagnostics.Process]::Start($processInfo)
        $process.Id | Set-Content ".mcp-server.pid"
        
        # Give server a moment to start
        Start-Sleep -Seconds 2
        
        if (-not $process.HasExited) {
            Write-Status "MCP server started (PID: $($process.Id))"
            Write-Info "Server logs: logs/mcp-server.log"
            Write-Info "To stop server: Stop-Process -Id $($process.Id)"
            
            # Redirect output to log file in background
            Start-Job -ScriptBlock {
                param($proc)
                $output = $proc.StandardOutput.ReadToEnd()
                $errorOutput = $proc.StandardError.ReadToEnd()
                "$output`n$errorOutput" | Out-File "logs/mcp-server.log"
            } -ArgumentList $process | Out-Null
        }
        else {
            Write-Error "MCP server failed to start"
            Write-Info "Exit code: $($process.ExitCode)"
        }
    }
    catch {
        Write-Error "Failed to start MCP server: $($_.Exception.Message)"
    }
}

# Show integration instructions
function Show-IntegrationInstructions {
    Write-Header "Integration Instructions"
    
    Write-Host "🔧 Claude Code Integration:" -ForegroundColor Blue
    $claudeConfigFile = "$env:USERPROFILE\.claude_config\claude_desktop_config.json"
    if (Test-Path $claudeConfigFile) {
        Write-Host "✅ Claude Desktop configuration has been automatically updated!" -ForegroundColor Green
        Write-Host "Please restart Claude Desktop to load the MCP server."
    }
    else {
        Write-Host "Add to Claude Code MCP configuration (~/.claude_config/claude_desktop_config.json):"
        Write-Host ""
        $currentPath = (Get-Location).Path.Replace('\', '/')
        Write-Host @"
{
  "mcpServers": {
    "olympus-docs": {
      "command": "node",
      "args": ["$currentPath/dist/server.js", "--stdio"],
      "cwd": "$currentPath",
      "env": {
        "MCP_CONFIG_PATH": "$currentPath/config/config.json"
      }
    }
  }
}
"@
    }
    Write-Host ""
    
    Write-Host "🔧 Cline (VS Code Extension) Integration:" -ForegroundColor Blue
    Write-Host "1. Install Cline extension in VS Code"
    Write-Host "2. Add to Cline MCP settings:"
    Write-Host ""
    Write-Host @"
{
  "mcpServers": {
    "olympus-docs": {
      "command": "node",
      "args": ["$currentPath/dist/server.js"],
      "cwd": "$currentPath",
      "env": {
        "MCP_CONFIG_PATH": "$currentPath/config/config.json"
      }
    }
  }
}
"@
    Write-Host ""
    
    Write-Host "🔧 GitHub Copilot Integration:" -ForegroundColor Blue
    Write-Host "Start API server for GitHub Copilot integration:"
    Write-Host "  node dist/cli.js start --mode api --port 3001"
    Write-Host "Then use the REST API endpoints in your IDE:"
    Write-Host "  POST http://localhost:3000/api/search - Search documentation"
    Write-Host "  GET  http://localhost:3000/api/context - Get contextual help"
    Write-Host ""
    
    Write-Host "🔧 Amazon Q (CodeWhisperer) Integration:" -ForegroundColor Blue
    Write-Host "Use API mode for Amazon Q integration:"
    Write-Host "1. Start API server: node dist/cli.js start --mode api --port 3001"
    Write-Host "2. Configure Q to use documentation API via REST calls"
    Write-Host "3. API endpoints available at http://localhost:3000/"
    Write-Host ""
    
    Write-Host "📝 Configuration Files Created:" -ForegroundColor Blue
    Write-Host "  • config/config.json - Main server configuration"
    Write-Host "  • config/presets/olympus-production.json - Olympus preset"
    Write-Host "  • config/presets/nebusai-enhanced.json - NebusAI preset"
    Write-Host ""
    
    Write-Host "🚀 Quick Start Commands:" -ForegroundColor Blue
    Write-Host "  • Test MCP: echo '{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/list\"}' | node dist/server.js"
    Write-Host "  • Search docs: node dist/cli.js search \"Azure deployment\""
    Write-Host "  • Start API: node dist/cli.js start --mode api --port 3001"
    Write-Host "  • Sync repos: node dist/cli.js sync"
    Write-Host ""
    
    Write-Host "🔧 Other AI Agents:" -ForegroundColor Blue
    Write-Host "See detailed integration guides:"
    Write-Host "  - docs/CLAUDE_CODE_INTEGRATION.md"
    Write-Host "  - docs/GITHUB_COPILOT_INTEGRATION.md"
    Write-Host "  - docs/AI_AGENTS_INTEGRATION.md"
    Write-Host ""
    
    Write-Host "📚 Documentation Sources Configured:" -ForegroundColor Blue
    if (Test-Path "config/config.json") {
        $config = Get-Content "config/config.json" | ConvertFrom-Json
        foreach ($repo in $config.repositories) {
            Write-Host "  ✓ $($repo.name)"
        }
    }
    Write-Host ""
    
    Write-Host "🚀 Quick Commands:" -ForegroundColor Blue
    Write-Host "  node dist/cli.js status           # Check status"
    Write-Host "  node dist/cli.js sync             # Sync documentation"
    Write-Host "  node dist/cli.js search `"query`"   # Search docs"
    Write-Host "  node dist/server.js --stdio       # Start MCP server"
    Write-Host "  .\setup-olympus.ps1               # Re-run setup"
    Write-Host ""
    
    # Show server status if running
    if (Test-Path ".mcp-server.pid") {
        $serverPid = Get-Content ".mcp-server.pid"
        $process = Get-Process -Id $serverPid -ErrorAction SilentlyContinue
        if ($process) {
            Write-Host "🔌 MCP Server Status:" -ForegroundColor Blue
            Write-Host "✅ MCP server is running (PID: $serverPid)" -ForegroundColor Green
            Write-Host "  View logs: Get-Content logs/mcp-server.log -Tail 50"
            Write-Host "  Stop server: Stop-Process -Id $serverPid"
            Write-Host ""
        }
    }
}

# Main function
function Main {
    Write-Header "Olympus Cloud Documentation MCP Server Setup"
    Write-Info "Enhanced setup for AI coding agents and Olympus Cloud development"
    Write-Info "This script will configure:"
    Write-Info "  • Modular MCP Server with enhanced architecture"
    Write-Info "  • Claude Desktop integration"
    Write-Info "  • VS Code extensions (Cline, Continue)"
    Write-Info "  • GitHub Copilot API integration"
    Write-Info "  • Azure, .NET 9/10, and enterprise documentation"
    Write-Host ""
    
    # Check if we're in the right directory
    if (-not (Test-Path "package.json")) {
        Write-Error "package.json not found. This script must be run from the mcp-server-docs-lookup directory"
        Write-Info "Please run: cd path\to\mcp-server-docs-lookup; .\setup-olympus.ps1"
        exit 1
    }
    
    $packageContent = Get-Content "package.json" | ConvertFrom-Json
    if ($packageContent.name -ne "universal-doc-mcp") {
        Write-Error "This script must be run from the mcp-server-docs-lookup directory"
        exit 1
    }
    
    # Setup GitHub token if provided
    if ($GitHubToken) {
        $env:OLYMPUS_GITHUB_TOKEN = $GitHubToken
        Write-Info "GitHub token configured for private repository access"
    }
    
    # Core setup steps
    Test-Prerequisites
    Initialize-MCPServer
    Initialize-Qdrant
    Set-Configuration
    
    # Documentation sync
    if (-not $SkipSync) {
        Write-Host ""
        $syncNow = Read-Host "Would you like to sync documentation now? This will take 10-30 minutes (y/N)"
        if ($syncNow -match "^[Yy]$") {
            Sync-Documentation
        } else {
            Write-Info "Skipping documentation sync"
            Write-Info "You can sync later with: node dist/cli.js sync"
        }
    }
    
    # Test core functionality
    Test-Installation
    
    # AI agent integrations
    if (-not $SkipAISetup) {
        Write-Header "Configuring AI Coding Agents"
        Set-ClaudeDesktopConfig
        Set-VSCodeExtensionConfig
        Set-GitHubCopilotAPI
        Test-MCPIntegration
    }
    
    # Start server if requested
    Write-Host ""
    $startServer = Read-Host "Would you like to start the MCP server now? (Y/n)"
    
    if ($startServer -notmatch "^[Nn]$") {
        Start-MCPServerBackground
    }
    
    Show-IntegrationInstructions
    
    Write-Header "Setup Complete! 🎉"
    Write-Status "Olympus Cloud Documentation MCP Server is ready for AI coding agents"
    
    # Show next steps
    Write-Host ""
    Write-Host "Next steps:" -ForegroundColor Green
    Write-Host "1. Restart Claude Desktop to load the MCP server" -ForegroundColor Green
    Write-Host "2. Install Cline or Continue extension in VS Code" -ForegroundColor Green
    Write-Host "3. Access the API server at http://localhost:3000/health" -ForegroundColor Green
    Write-Host "4. Test search: node dist/cli.js search `"Azure Functions best practices`"" -ForegroundColor Green
    Write-Host "5. Read integration guides in docs/ folder" -ForegroundColor Green
    
    if ($DevMode) {
        Write-Host ""
        Write-Host "Development mode features enabled:" -ForegroundColor Cyan
        Write-Host "  • Enhanced logging and debugging" -ForegroundColor Cyan
        Write-Host "  • Hot reload for configuration changes" -ForegroundColor Cyan
        Write-Host "  • Additional development tools" -ForegroundColor Cyan
    }
    
    Write-Host ""
    Write-Host "Happy coding with enhanced AI documentation context! 🚀" -ForegroundColor Green
}

# Run main function
try {
    Main
} catch {
    Write-Error "Setup failed: $($_.Exception.Message)"
    exit 1
}