import os
import fnmatch

# Keep your existing hardcoded defaults as a fallback
EXCLUDED_EXTENSIONS = {
    '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.svg', '.ico', '.webp', '.tiff', '.tif', '.heic',
    '.mp4', '.mov', '.avi', '.mkv', '.webm', '.flv', '.wmv', '.m4v',
    '.mp3', '.wav', '.ogg', '.flac', '.aac', '.m4a',
    '.pyc', '.pyo', '.exe', '.dll', '.so', '.class', '.o', '.bin',
    '.zip', '.tar', '.gz', '.rar', '.7z',
    '.ttf', '.otf', '.woff', '.woff2', '.eot',
}

EXCLUDED_DIRS = {'venv', '.git', '__pycache__', 'node_modules', '.venv', 'dist', 'build', '.idea', '.vscode'}
OUTPUT_FILE = "CodeBundle.txt"

def load_gitignore_patterns():
    """Reads .gitignore and returns a list of patterns."""
    patterns = []
    if os.path.exists(".gitignore"):
        with open(".gitignore", "r") as f:
            for line in f:
                line = line.strip()
                # Skip empty lines and comments
                if line and not line.startswith("#"):
                    patterns.append(line)
    return patterns

def is_ignored(path, patterns):
    """Checks if a path matches any gitignore pattern."""
    for pattern in patterns:
        # Simple support for directory markers (e.g., 'node_modules/')
        if pattern.endswith('/'):
            if fnmatch.fnmatch(path, pattern.rstrip('/')) or fnmatch.fnmatch(path, f"{pattern.rstrip('/')}/*"):
                return True
        if fnmatch.fnmatch(path, pattern):
            return True
    return False

def bundle_all_files(output_file=OUTPUT_FILE):
    root_dir = os.getcwd()
    collected_files = []
    
    # Load gitignore patterns
    gitignore_patterns = load_gitignore_patterns()

    for root, dirs, files in os.walk(root_dir):
        rel_root = os.path.relpath(root, root_dir)
        if rel_root == ".":
            rel_root = ""

        # 1. Prune directories based on hardcoded list OR gitignore
        dirs[:] = [d for d in dirs if d not in EXCLUDED_DIRS and not is_ignored(os.path.join(rel_root, d), gitignore_patterns)]

        for file in files:
            if file in (output_file, os.path.basename(__file__)):
                continue

            rel_path = os.path.join(rel_root, file)
            ext = os.path.splitext(file)[1].lower()

            # 2. Skip based on hardcoded extensions OR gitignore
            if ext in EXCLUDED_EXTENSIONS or is_ignored(rel_path, gitignore_patterns):
                continue

            full_path = os.path.join(root, file)
            collected_files.append((full_path, rel_path))

    collected_files.sort(key=lambda x: x[1])

    with open(output_file, "w", encoding="utf-8") as f:
        f.write("CODEBASE BUNDLE REPORT\n")
        f.write("=" * 50 + "\n")
        f.write("PROJECT STRUCTURE:\n")
        for _, rel_path in collected_files:
            f.write(f"  - {rel_path}\n")
        f.write("\n" + "=" * 50 + "\n\n")

        for full_path, rel_path in collected_files:
            f.write(f"FILE: {rel_path}\n")
            f.write("-" * 50 + "\n")
            try:
                with open(full_path, "r", encoding="utf-8") as code_file:
                    f.write(code_file.read())
            except Exception as e:
                f.write(f"[Skipped/Error: {e}]")
            f.write("\n\n" + "# " + "=" * 20 + " END OF FILE " + "=" * 20 + "\n\n")

    print(f"✓ Bundled {len(collected_files)} files into '{output_file}'")

if __name__ == "__main__":
    bundle_all_files()
