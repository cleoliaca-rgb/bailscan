#!/usr/bin/env python3
"""
Script à exécuter LOCALEMENT sur le repo BailScan pour :
1. Remplacer canonical .html → sans .html dans les 100 articles
2. Mettre à jour og:url pareil
3. Vérifier les liens internes
 
Usage:
  cd /chemin/vers/bailscan
  python3 fix_canonical_urls.py
"""
 
import os, re, sys
 
BLOG_DIR = "blog"  # ajuster si nécessaire
OLD_BASE = "https://bailscan.app/blog/"
 
def fix_file(filepath):
    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read()
 
    original = content
 
    # canonical : retirer .html
    content = re.sub(
        r'<link rel="canonical" href="(https://bailscan\.app/blog/[^"]+)\.html"',
        r'<link rel="canonical" href="\1"',
        content
    )
 
    # og:url : retirer .html
    content = re.sub(
        r'<meta property="og:url" content="(https://bailscan\.app/blog/[^"]+)\.html"',
        r'<meta property="og:url" content="\1"',
        content
    )
 
    # Liens internes /blog/foo.html → /blog/foo
    content = re.sub(
        r'href="(/blog/[a-z0-9-]+)\.html"',
        r'href="\1"',
        content
    )
    content = re.sub(
        r'href="(blog/[a-z0-9-]+)\.html"',
        r'href="\1"',
        content
    )
 
    if content != original:
        with open(filepath, "w", encoding="utf-8") as f:
            f.write(content)
        return True
    return False
 
# Patch les 100 articles
count = 0
if os.path.isdir(BLOG_DIR):
    for fname in os.listdir(BLOG_DIR):
        if fname.endswith(".html"):
            if fix_file(os.path.join(BLOG_DIR, fname)):
                count += 1
 
# Patch aussi blog.html, index.html, pro.html, proprietaire.html
for root_file in ["blog.html", "index.html", "pro.html", "proprietaire.html"]:
    if os.path.exists(root_file):
        if fix_file(root_file):
            count += 1
 
print(f"Fichiers modifiés : {count}")
print("Pousser sur GitHub pour déclencher le déploiement Vercel.")
 
