#!/bin/bash

# License File
LICENSE_FILE="license-template.txt"
LICENSE_TEXT="<!--
Nautilus Trusted Compute
Copyright (C) 2025 Nautilus

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as published
by the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program.  If not, see <https://www.gnu.org/licenses/>.
-->"

# Directories to exclude
EXCLUDE_DIRS=("ntc-web/node_modules" "sgx-mvp/target" "dist" "build" "out" "vendor")

# Ensure addlicense is installed
if ! command -v addlicense &> /dev/null; then
    echo "❌ addlicense not found! Install it using: go install github.com/google/addlicense@latest"
    exit 1
fi

# Ensure the license template exists
if [ ! -f "$LICENSE_FILE" ]; then
    echo "❌ License template file not found! Ensure $LICENSE_FILE exists."
    exit 1
fi

# Build find command with exclusions
EXCLUDE_ARGS=()
for dir in "${EXCLUDE_DIRS[@]}"; do
    EXCLUDE_ARGS+=(-path "./$dir" -prune -o)
done

# Run addlicense for supported file types
echo "🔹 Adding license to source files..."
find . "${EXCLUDE_ARGS[@]}" -type f \( \
  -name "*.js" -o \
  -name "*.jsx" -o \
  -name "*.ts" -o \
  -name "*.tsx" -o \
  -name "*.py" -o \
  -name "*.cpp" -o \
  -name "*.c" -o \
  -name "*.h" -o \
  -name "*.rs" -o \
  -name "*.sh" -o \
  -name "*.prisma" -o \
  -name "*.toml" -o \
  -name "*.yml" -o \
  -name "*.yaml" -o \
  -name "*.css" -o \
  -name "*.scss" -o \
  -name "*.sass" -o \
  -name "*.less" -o \
  -name "*.html" -o \
  -name "Dockerfile" -o \
  -name "*.cargo" \
\) -exec addlicense -f "$LICENSE_FILE" -y 2025 -c "Nautilus" {} +

# Manually handle .md files (add comment block if missing)
echo "🔹 Adding license to Markdown files..."
find . "${EXCLUDE_ARGS[@]}" -type f -name "*.md" | while read -r file; do
  if [ -f "$file" ]; then  # Ensure it's a file
    if ! grep -q "Copyright (C) 2025 Nautilus" "$file"; then
      # Create a temporary file to store the license and the original content
      printf "%s\n\n" "$LICENSE_TEXT" | cat - "$file" > "$file.tmp" && mv "$file.tmp" "$file"
      echo "✅ Added license to $file"
    else
      echo "✔️ License already present in $file"
    fi
  fi
done

echo "🎉 License update complete!"
