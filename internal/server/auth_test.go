package server

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"zeropulse-agent/internal/collector"
	"zeropulse-agent/internal/storage"
)

func TestAuthAndUserManagementFlow(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "zeropulse-server-auth-test-*")
	if err != nil {
		t.Fatalf("temp dir error: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	dbPath := filepath.Join(tmpDir, "test_server.db")
	store, err := storage.Open(dbPath)
	if err != nil {
		t.Fatalf("storage.Open failed: %v", err)
	}
	defer store.Close()

	cfg := ServerConfig{
		Addr:  "127.0.0.1:0",
		Store: store,
	}
	srv := NewServer(cfg, collector.EnvDocker, newTestLogger())

	// 1. Check Auth Status (Uninitialized)
	req := httptest.NewRequest(http.MethodGet, "/api/v1/auth/status", nil)
	rec := httptest.NewRecorder()
	srv.httpServer.Handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200 OK, got %d", rec.Code)
	}

	var statusRes map[string]interface{}
	_ = json.NewDecoder(rec.Body).Decode(&statusRes)
	if statusRes["initialized"] != false {
		t.Errorf("expected initialized=false, got %v", statusRes["initialized"])
	}

	// 2. Initial Setup: Create Superuser
	if srv.setupToken == "" {
		t.Fatal("expected a setup token on an uninitialized store")
	}
	for _, body := range []string{
		`{"username":"attacker","password":"password123"}`,
		`{"username":"attacker","password":"password123","setup_token":"wrong"}`,
	} {
		req = httptest.NewRequest(http.MethodPost, "/api/v1/auth/setup", strings.NewReader(body))
		rec = httptest.NewRecorder()
		srv.httpServer.Handler.ServeHTTP(rec, req)
		if rec.Code != http.StatusForbidden {
			t.Fatalf("expected 403 for setup without a valid token, got %d: %s", rec.Code, rec.Body.String())
		}
	}

	setupBody := []byte(fmt.Sprintf(`{"username":"rootadmin","password":"password123","setup_token":%q}`, srv.setupToken))
	req = httptest.NewRequest(http.MethodPost, "/api/v1/auth/setup", bytes.NewReader(setupBody))
	rec = httptest.NewRecorder()
	srv.httpServer.Handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200 OK for setup, got %d: %s", rec.Code, rec.Body.String())
	}

	var setupRes struct {
		Token string `json:"token"`
		User  struct {
			Username string `json:"username"`
			Role     string `json:"role"`
		} `json:"user"`
	}
	_ = json.NewDecoder(rec.Body).Decode(&setupRes)
	if setupRes.Token == "" || setupRes.User.Username != "rootadmin" {
		t.Fatalf("invalid setup response: %+v", setupRes)
	}
	adminToken := setupRes.Token

	// 3. Second Setup must fail with 403
	req = httptest.NewRequest(http.MethodPost, "/api/v1/auth/setup", bytes.NewReader(setupBody))
	rec = httptest.NewRecorder()
	srv.httpServer.Handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusForbidden {
		t.Errorf("expected 403 for duplicate setup, got %d", rec.Code)
	}

	// 4. Login with wrong password
	wrongLogin := []byte(`{"username":"rootadmin","password":"wrongpassword"}`)
	req = httptest.NewRequest(http.MethodPost, "/api/v1/auth/login", bytes.NewReader(wrongLogin))
	rec = httptest.NewRecorder()
	srv.httpServer.Handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusUnauthorized {
		t.Errorf("expected 401 for wrong password, got %d", rec.Code)
	}

	// 5. Login with correct password
	correctLogin := []byte(`{"username":"rootadmin","password":"password123"}`)
	req = httptest.NewRequest(http.MethodPost, "/api/v1/auth/login", bytes.NewReader(correctLogin))
	rec = httptest.NewRecorder()
	srv.httpServer.Handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200 OK for login, got %d", rec.Code)
	}

	// 6. Access protected endpoint with Bearer Token
	req = httptest.NewRequest(http.MethodGet, "/api/v1/status", nil)
	req.Header.Set("Authorization", "Bearer "+adminToken)
	rec = httptest.NewRecorder()
	srv.httpServer.Handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200 OK on protected status with token, got %d", rec.Code)
	}

	// 7. Access protected endpoint WITHOUT Token -> 401
	req = httptest.NewRequest(http.MethodGet, "/api/v1/status", nil)
	rec = httptest.NewRecorder()
	srv.httpServer.Handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 Unauthorized without token, got %d", rec.Code)
	}

	// 8. Create additional viewer user
	newUserBody := []byte(`{"username":"monitor_user","password":"mypassword123","role":"viewer"}`)
	req = httptest.NewRequest(http.MethodPost, "/api/v1/users", bytes.NewReader(newUserBody))
	req.Header.Set("Authorization", "Bearer "+adminToken)
	rec = httptest.NewRecorder()
	srv.httpServer.Handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusCreated {
		t.Fatalf("expected 201 Created for user, got %d: %s", rec.Code, rec.Body.String())
	}

	// 9. List users
	req = httptest.NewRequest(http.MethodGet, "/api/v1/users", nil)
	req.Header.Set("Authorization", "Bearer "+adminToken)
	rec = httptest.NewRecorder()
	srv.httpServer.Handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200 OK for user list, got %d", rec.Code)
	}

	var usersRes struct {
		Users []struct {
			Username string `json:"username"`
			Role     string `json:"role"`
		} `json:"users"`
	}
	_ = json.NewDecoder(rec.Body).Decode(&usersRes)
	if len(usersRes.Users) != 2 {
		t.Errorf("expected 2 users, got %d", len(usersRes.Users))
	}

	// 10. Delete created user
	req = httptest.NewRequest(http.MethodDelete, "/api/v1/users/monitor_user", nil)
	req.Header.Set("Authorization", "Bearer "+adminToken)
	rec = httptest.NewRecorder()
	srv.httpServer.Handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200 OK for delete, got %d: %s", rec.Code, rec.Body.String())
	}

	// 11. Logout
	req = httptest.NewRequest(http.MethodPost, "/api/v1/auth/logout", nil)
	req.Header.Set("Authorization", "Bearer "+adminToken)
	rec = httptest.NewRecorder()
	srv.httpServer.Handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200 OK on logout, got %d", rec.Code)
	}

	// After logout, token must be invalid
	req = httptest.NewRequest(http.MethodGet, "/api/v1/status", nil)
	req.Header.Set("Authorization", "Bearer "+adminToken)
	rec = httptest.NewRecorder()
	srv.httpServer.Handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusUnauthorized {
		t.Errorf("expected 401 after logout, got %d", rec.Code)
	}
}
