#!/bin/sh
# Stops a build early, with the fix, when it would fail or leave root-owned files behind.
# Usage: check-build-env.sh <required-tool>...
set -eu

project_root="$(cd "$(dirname "$0")/.." && pwd)"

if [ "$(id -u)" -eq 0 ] && [ -n "${SUDO_USER:-}" ]; then
  echo "Hata: 'sudo make' kullanmayın. sudo, go ve nvm'in bulunduğu PATH'i sıfırlar." >&2
  echo "Bunun yerine sudo olmadan çalıştırın: make install veya make update" >&2
  echo "Parola yalnızca kurulum adımında sorulur." >&2
  exit 1
fi

for tool in "$@"; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    echo "Hata: '$tool' PATH içinde bulunamadı." >&2
    [ "$tool" = "npm" ] && echo "nvm kullanıyorsanız önce bu terminalde: nvm use --lts" >&2
    exit 1
  fi
done

foreign="$(find "$project_root/ui/dist" "$project_root/bin" ! -user "$(id -un)" -print -quit 2>/dev/null || true)"
if [ -n "$foreign" ]; then
  echo "Hata: başka bir kullanıcıya ait derleme çıktısı var: $foreign" >&2
  echo "Düzeltmek için: sudo chown -R $(id -un) \"$project_root/ui/dist\" \"$project_root/bin\"" >&2
  exit 1
fi
