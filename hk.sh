#!/bin/bash

# 1. Ambil tag terakhir
LAST_TAG=$(git tag --sort=-v:refname | head -n 1)

# 2. Logika Mulai dari Nol
if [ -z "$LAST_TAG" ]; then
    NEW_TAG="v0.1.0"
else
    # Pecah v0.1.7 jadi PREFIX(v0.1) dan PATCH(7)
    PREFIX=$(echo $LAST_TAG | cut -d. -f1-2)
    PATCH=$(echo $LAST_TAG | cut -d. -f3)
    # Naikkan angka paling belakang
    NEW_TAG="${PREFIX}.$((PATCH + 1))"
fi

echo "🚀 Target Tag Baru: $NEW_TAG"

# 3. Git Process
git add .
echo "Pesan commit (Enter untuk 'Hokireceh...! ft Sepi Bukan Sapi'):"
read msg
if [ -z "$msg" ]; then msg="Hokireceh...! ft Sepi Bukan Sapi"; fi

git commit -m "$msg"
git push origin main

# 4. Bikin Tag & Push ke GitHub
git tag -a "$NEW_TAG" -m "$msg"
git push origin --tags

echo "✅ Beres, cok! Sekarang mulai lagi dari $NEW_TAG"