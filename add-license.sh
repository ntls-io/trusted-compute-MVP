# Nautilus Trusted Compute
# Copyright (C) 2025 Nautilus

# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU Affero General Public License as published
# by the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.

# This program is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU Affero General Public License for more details.

# You should have received a copy of the GNU Affero General Public License
# along with this program.  If not, see <https://www.gnu.org/licenses/>.

#!/bin/bash

# License File
LICENSE_FILE="license-template.txt"
LICENSE_TEXT="""# Nautilus Trusted Compute
# Copyright (C) 2025 Nautilus
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU Affero General Public License as published
# by the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.
#
# This program is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU Affero General Public License for more details.
#
# You should have received a copy of the GNU Affero General Public License
# along with this program.  If not, see <https://www.gnu.org/licenses/>.
"""
LICENSE_TEXT_MD="<!-- Nautilus Trusted Compute
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
along with this program.  If not, see <https://www.gnu.org/licenses/>. -->"


# Files and patterns to exclude
EXCLUDE_PATTERNS=("*.env*" ".DS_Store" "package-lock.json" "yarn.lock" "Cargo.lock")

# Directories to exclude
EXCLUDE_DIRS=(
    "ntc-web/node_modules"
    "sgx-mvp/target"
    "drt-manager/node_modules"
    "drt-manager/target"
    "dist"
    "build"
    "out"
    "vendor"
    ".git"
    ".idea"
    "test-ledger"
    "ntc-web/.next"
    "drt-manager/.anchor"
)

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

echo "🔹 Adding license to source files..."

# Build find command with proper exclusions
FIND_CMD="find . -type f"
for dir in "${EXCLUDE_DIRS[@]}"; do
    FIND_CMD+=" -not -path '*/$dir/*'"
done
for pattern in "${EXCLUDE_PATTERNS[@]}"; do
    FIND_CMD+=" -not -name '$pattern'"
done

# Process files and add licenses
eval "$FIND_CMD \( \
    -name '*.js' -o \
    -name '*.jsx' -o \
    -name '*.ts' -o \
    -name '*.tsx' -o \
    -name '*.py' -o \
    -name '*.cpp' -o \
    -name '*.c' -o \
    -name '*.h' -o \
    -name '*.rs' -o \
    -name '*.sh' -o \
    -name '*.prisma' -o \
    -name '*.toml' -o \
    -name '*.yml' -o \
    -name '*.yaml' -o \
    -name '*.css' -o \
    -name '*.scss' -o \
    -name '*.sass' -o \
    -name '*.less' -o \
    -name '*.html' -o \
    -name 'Dockerfile' -o \
    -name '*.lock' -o \
    -name '*.cargo' \
\) -print0" | while IFS= read -r -d '' file; do
    if head -n 10 "$file" | grep -q "Nautilus"; then
        echo "✔️ License already present in $file"
    else
        echo "✅ Adding license to $file"
        if [[ "$file" == *.toml || "$file" == *.gitignore || "$file" == *.prettierignore ]]; then
            printf "# %s\n\n" "$(cat $LICENSE_FILE)" | cat - "$file" > "$file.tmp" && mv "$file.tmp" "$file"
        else
            addlicense -f "$LICENSE_FILE" -y 2025 -c "Nautilus" "$file"
        fi
    fi
done

echo "🔹 Adding license to .gitignore files..."
eval "$FIND_CMD -name '.gitignore' -print0" | while IFS= read -r -d '' file; do
    if head -n 10 "$file" | grep -q "Nautilus"; then
        echo "✔️ License already present in $file"
    else
        echo "✅ Adding license to $file"
        printf "%s\n\n" "$LICENSE_TEXT" | cat - "$file" > "$file.tmp" && mv "$file.tmp" "$file"
    fi
done

echo "🔹 Adding license to .prettierignore files..."
eval "$FIND_CMD -name '.prettierignore' -print0" | while IFS= read -r -d '' file; do
    if head -n 10 "$file" | grep -q "Nautilus"; then
        echo "✔️ License already present in $file"
    else
        echo "✅ Adding license to $file"
        printf "%s\n\n" "$LICENSE_TEXT" | cat - "$file" > "$file.tmp" && mv "$file.tmp" "$file"
    fi
done

echo "🔹 Adding license to Markdown files..."
eval "$FIND_CMD -name '*.md' -print0" | while IFS= read -r -d '' file; do
    if head -n 10 "$file" | grep -q "Nautilus"; then
        echo "✔️ License already present in $file"
    else
        echo "✅ Adding license to $file"
        printf "%s\n\n" "$LICENSE_TEXT_MD" | cat - "$file" > "$file.tmp" && mv "$file.tmp" "$file"
    fi
done

echo "🎉 License update complete!"
