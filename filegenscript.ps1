# Set the base directory for your Chrome extension project
$baseDir = "E:\Repositories\Poe-Voice-Sync\"

# Create the directory structure
$folders = @(
    $baseDir,
    "$baseDir\icons",
    "$baseDir\lib"
)

foreach ($folder in $folders) {
    if (-Not (Test-Path -Path $folder)) {
        New-Item -Path $folder -ItemType Directory
    }
}

# Create the necessary files
$files = @(
    "$baseDir\manifest.json",
    "$baseDir\background.js",
    "$baseDir\content.js",
    "$baseDir\popup.html",
    "$baseDir\popup.js",
    "$baseDir\popup.css",
    "$baseDir\options.html",
    "$baseDir\options.js",
    "$baseDir\options.css"
)

foreach ($file in $files) {
    if (-Not (Test-Path -Path $file)) {
        New-Item -Path $file -ItemType File
    }
}

# Confirm creation
Write-Host "Directory structure and files for Poe Voice Sync have been created."
