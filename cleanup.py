"""
Forge Junction — Dev Journal Cleanup
=====================================
Moves all non-project files (spec docs, prompt files, logs, etc.)
from the project root into a /dev-journal folder.

Usage:
  python cleanup.py

Run from the ForgeJunction project root (D:\ForgeJunction).
Safe to run repeatedly — it won't move files that are already in dev-journal.
"""

import os
import shutil
from pathlib import Path

# Files and folders that BELONG in the project root — don't touch these
PROJECT_FILES = {
    # Config files
    'package.json',
    'package-lock.json',
    'tsconfig.json',
    'tsconfig.node.json',
    'tsconfig.web.json',
    'tailwind.config.ts',
    'postcss.config.js',
    'electron.vite.config.ts',
    'index.html',
    '.env',
    '.env.example',
    '.gitignore',
    'CLAUDE.md',

    # Data files used by the app at runtime
    'pirate-diffusion-workflow-knowledge.json',
}

PROJECT_DIRS = {
    'electron',
    'src',
    'node_modules',
    'dist',
    'dist-electron',
    'release',
    'dev-journal',   # don't move the journal into itself
    '.git',
}

# File extensions that are definitely dev journal / spec files
JOURNAL_EXTENSIONS = {
    '.md',    # spec docs, prompts, handoff docs
    '.txt',   # prompt files for claude code
    '.log',   # debug logs
    '.py',    # utility scripts like this one, filter_telegram.py
}

# Specific files to always keep (even if they match journal extensions)
KEEP_FILES = {
    'CLAUDE.md',
    'cleanup.py',  # keep this script in root for easy access
}


def main():
    root = Path('.')
    journal = root / 'dev-journal'

    # Create dev-journal folder
    journal.mkdir(exist_ok=True)

    moved = []
    skipped = []

    for item in sorted(root.iterdir()):
        name = item.name

        # Skip project directories
        if item.is_dir():
            if name in PROJECT_DIRS or name.startswith('.'):
                skipped.append(f"  [dir]  {name}/")
            else:
                # Unknown directory — flag but don't move
                skipped.append(f"  [dir?] {name}/ (unknown dir, leaving in place)")
            continue

        # Skip known project files
        if name in PROJECT_FILES:
            skipped.append(f"  [proj] {name}")
            continue

        # Skip files we explicitly want to keep in root
        if name in KEEP_FILES:
            skipped.append(f"  [keep] {name}")
            continue

        # Check if it's a journal file by extension
        ext = item.suffix.lower()
        if ext in JOURNAL_EXTENSIONS:
            dest = journal / name
            # Handle name collisions
            if dest.exists():
                stem = item.stem
                counter = 1
                while dest.exists():
                    dest = journal / f"{stem}_{counter}{ext}"
                    counter += 1

            shutil.move(str(item), str(dest))
            moved.append(f"  → {name}  →  dev-journal/{dest.name}")
            continue

        # Other files: leave in place but note them
        skipped.append(f"  [????] {name} (unrecognized, leaving in place)")

    # Update .gitignore to include dev-journal
    gitignore = root / '.gitignore'
    if gitignore.exists():
        content = gitignore.read_text()
        if 'dev-journal/' not in content:
            with open(gitignore, 'a') as f:
                f.write('\n# Development journal — specs, prompts, logs\ndev-journal/\n')
            print("Updated .gitignore to exclude dev-journal/")
    else:
        gitignore.write_text('node_modules/\ndist/\ndist-electron/\nrelease/\n.env\n*.local\ndev-journal/\n')
        print("Created .gitignore with dev-journal/ excluded")

    # Report
    print(f"\n{'='*60}")
    print(f"  Forge Junction — Dev Journal Cleanup")
    print(f"{'='*60}")

    if moved:
        print(f"\nMoved {len(moved)} files to dev-journal/:")
        for m in moved:
            print(m)
    else:
        print("\nNo files to move — project root is clean!")

    if skipped:
        print(f"\nKept {len(skipped)} project files in place:")
        for s in skipped:
            print(s)

    print(f"\n{'='*60}")
    print(f"Tip: Drop your .md and .txt prompt files anywhere in the root.")
    print(f"Run 'python cleanup.py' anytime to tidy up.")
    print(f"{'='*60}\n")


if __name__ == '__main__':
    main()
