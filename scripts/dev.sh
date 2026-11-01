#!/usr/bin/env bash
set -e

# Renkler
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
RED='\033[0;31m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

BACKEND_PORT="${ZEROPULSE_PORT:-8080}"
BACKEND_HEALTH_URL="http://127.0.0.1:${BACKEND_PORT}/api/v1/health"
UI_PORT="${PORT:-3000}"

echo -e "${CYAN}======================================================${NC}"
echo -e "${CYAN}   ZEROPULSE — Canlı Geliştirme Ortamı (Real-Time Dev)   ${NC}"
echo -e "${CYAN}======================================================${NC}"

BACKEND_STARTED_BY_US=false
AGENT_PID=""

cleanup() {
  if [ "$BACKEND_STARTED_BY_US" = true ] && [ -n "$AGENT_PID" ]; then
    echo -e "\n${YELLOW}▶ Yerel Zeropulse ajanı kapatılıyor (PID: $AGENT_PID)...${NC}"
    kill "$AGENT_PID" 2>/dev/null || true
    wait "$AGENT_PID" 2>/dev/null || true
  fi
  echo -e "${GREEN}✓ Geliştirme ortamı durduruldu.${NC}"
}
trap cleanup EXIT INT TERM

if curl -s --max-time 1 "$BACKEND_HEALTH_URL" > /dev/null 2>&1; then
  echo -e "${GREEN}✓ Arka planda çalışan Zeropulse ajanı tespit edildi (${BACKEND_HEALTH_URL}).${NC}"
  echo -e "${BLUE}  (Mevcut sistem servisi veya çalışan ajan doğrudan kullanılacak.)${NC}"
else
  echo -e "${YELLOW}▶ Aktif bir Zeropulse ajanı bulunamadı. Yerel ajan başlatılıyor (:8080 --dry-run)...${NC}"
  (cd "$PROJECT_ROOT" && go run ./cmd/agent --dry-run) &
  AGENT_PID=$!
  BACKEND_STARTED_BY_US=true

  echo -n -e "${BLUE}▶ Ajanın hazır olması bekleniyor${NC}"
  READY=false
  for _ in $(seq 1 30); do
    if curl -s --max-time 1 "$BACKEND_HEALTH_URL" > /dev/null 2>&1; then
      READY=true
      break
    fi
    echo -n "."
    sleep 0.5
  done
  echo ""

  if [ "$READY" = false ]; then
    echo -e "${RED}Hata: Zeropulse ajanı başlatılamadı.${NC}"
    exit 1
  fi
  echo -e "${GREEN}✓ Zeropulse ajanı hazır!${NC}"
fi

echo -e "\n${GREEN}🚀 Vite Canlı UI Dev Sunucusu başlatılıyor...${NC}"
echo -e "${BLUE}   Tarayıcı adresi:  ${CYAN}http://localhost:${UI_PORT}${NC}"
echo -e "${BLUE}   Backend Proxy:    ${CYAN}http://127.0.0.1:${BACKEND_PORT}${NC}"
echo -e "${BLUE}   Hot Reload (HMR): ${GREEN}AKTİF (ui/src altındaki değişiklikler anında yansır)${NC}\n"

cd "$PROJECT_ROOT/ui"
exec npm run dev
