//go:build embedui

package server

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"testing"

	"zeropulse-agent/internal/collector"
)

func TestEmbeddedUIServing(t *testing.T) {
	cfg := ServerConfig{Addr: "127.0.0.1:0"}
	srv := NewServer(cfg, collector.EnvStandalone, newTestLogger())

	// 1. Root path should serve index.html
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	rec := httptest.NewRecorder()
	srv.httpServer.Handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200 OK for root UI, got %d", rec.Code)
	}

	body := rec.Body.String()
	if !bytes.Contains([]byte(body), []byte("ZEROPULSE")) {
		t.Errorf("expected index.html to contain 'ZEROPULSE', got: %s", body)
	}

	// 2. SPA client route fallback should also serve index.html
	reqSPA := httptest.NewRequest(http.MethodGet, "/workloads/containers", nil)
	recSPA := httptest.NewRecorder()
	srv.httpServer.Handler.ServeHTTP(recSPA, reqSPA)

	if recSPA.Code != http.StatusOK {
		t.Fatalf("expected 200 OK for SPA fallback route, got %d", recSPA.Code)
	}
}
