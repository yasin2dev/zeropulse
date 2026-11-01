package server

import (
	"bytes"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"

	"zeropulse-agent/internal/collector"
	"zeropulse-agent/internal/config"
	"zeropulse-agent/internal/ruleengine"
)

func newTestLogger() *slog.Logger {
	return slog.New(slog.NewTextHandler(io.Discard, nil))
}

func TestHealthEndpoint(t *testing.T) {
	cfg := ServerConfig{Addr: "127.0.0.1:0"}
	srv := NewServer(cfg, collector.EnvStandalone, newTestLogger())

	req := httptest.NewRequest(http.MethodGet, "/api/v1/health", nil)
	rec := httptest.NewRecorder()

	srv.httpServer.Handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200 OK, got %d", rec.Code)
	}

	var res map[string]interface{}
	if err := json.NewDecoder(rec.Body).Decode(&res); err != nil {
		t.Fatalf("failed to decode json: %v", err)
	}

	if res["status"] != "healthy" {
		t.Errorf("expected status 'healthy', got %v", res["status"])
	}
}

func TestDryRunToggle(t *testing.T) {
	cfg := ServerConfig{Addr: "127.0.0.1:0", DryRun: true}
	srv := NewServer(cfg, collector.EnvStandalone, newTestLogger())

	// 1. Initial GET
	req1 := httptest.NewRequest(http.MethodGet, "/api/v1/config/dry-run", nil)
	rec1 := httptest.NewRecorder()
	srv.httpServer.Handler.ServeHTTP(rec1, req1)

	if rec1.Code != http.StatusOK {
		t.Fatalf("expected 200 OK, got %d", rec1.Code)
	}

	var res1 map[string]interface{}
	_ = json.NewDecoder(rec1.Body).Decode(&res1)
	if res1["dry_run"] != true {
		t.Errorf("expected dry_run=true, got %v", res1["dry_run"])
	}

	// 2. PUT to false
	body := []byte(`{"dry_run": false}`)
	req2 := httptest.NewRequest(http.MethodPut, "/api/v1/config/dry-run", bytes.NewReader(body))
	rec2 := httptest.NewRecorder()
	srv.httpServer.Handler.ServeHTTP(rec2, req2)

	if rec2.Code != http.StatusOK {
		t.Fatalf("expected 200 OK, got %d", rec2.Code)
	}

	if srv.IsDryRun() != false {
		t.Errorf("expected internal dry_run to be false")
	}

	// Check audit log recorded config change
	logs := srv.auditLog.GetAll(10)
	if len(logs) == 0 || logs[0].Action != "CONFIG_CHANGE" {
		t.Errorf("expected CONFIG_CHANGE audit entry, got %+v", logs)
	}
}

func TestPushMetricsAndContainers(t *testing.T) {
	cfg := ServerConfig{Addr: "127.0.0.1:0"}
	srv := NewServer(cfg, collector.EnvDocker, newTestLogger())

	payload := MetricsEventPayload{
		Timestamp: time.Now().UTC(),
		System: SystemOverview{
			Mode:                "docker",
			TotalContainers:     2,
			RunningContainers:   2,
			SystemCPUPercent:    45.5,
			SystemMemUsedBytes:  2048,
			SystemMemTotalBytes: 8192,
		},
		Containers: []ContainerCard{
			{
				ID:           "test12345678",
				Name:         "frontend",
				Image:        "nginx:alpine",
				Status:       "running",
				CPUPercent:   12.5,
				MemPercent:   30.0,
				HealthStatus: "ok",
			},
		},
	}

	srv.PushMetrics(payload)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/containers", nil)
	rec := httptest.NewRecorder()
	srv.httpServer.Handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200 OK, got %d", rec.Code)
	}

	var res struct {
		Containers []ContainerCard `json:"containers"`
	}
	if err := json.NewDecoder(rec.Body).Decode(&res); err != nil {
		t.Fatalf("failed to decode containers: %v", err)
	}

	if len(res.Containers) != 1 || res.Containers[0].Name != "frontend" {
		t.Errorf("unexpected containers in response: %+v", res.Containers)
	}
}

func TestPushMetricsIncludesStressIndex(t *testing.T) {
	cfg := ServerConfig{Addr: "127.0.0.1:0"}
	srv := NewServer(cfg, collector.EnvDocker, newTestLogger())

	for i := 0; i < 3; i++ {
		srv.auditLog.Add(AuditEntry{ID: "evt", Timestamp: time.Now().UTC(), Status: "TRIGGERED"})
	}
	srv.PushMetrics(MetricsEventPayload{Timestamp: time.Now().UTC()})

	// 3 anomalies / 5 = 0.6; this payload is what SSE clients receive.
	if got := srv.latestPayload.System.StressIndex1m; got < 0.59 || got > 0.61 {
		t.Errorf("expected pushed stress index ~0.6, got %f", got)
	}
}

func TestAuthMiddleware(t *testing.T) {
	cfg := ServerConfig{
		Addr:        "127.0.0.1:0",
		AuthEnabled: true,
		AuthUser:    "admin",
		AuthPass:    "secret123",
		APIToken:    "token-xyz",
	}
	srv := NewServer(cfg, collector.EnvDocker, newTestLogger())

	// Unauthenticated request should fail with 401
	reqUnauth := httptest.NewRequest(http.MethodGet, "/api/v1/status", nil)
	recUnauth := httptest.NewRecorder()
	srv.httpServer.Handler.ServeHTTP(recUnauth, reqUnauth)

	if recUnauth.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 Unauthorized, got %d", recUnauth.Code)
	}

	// Bearer token authentication should succeed
	reqBearer := httptest.NewRequest(http.MethodGet, "/api/v1/status", nil)
	reqBearer.Header.Set("Authorization", "Bearer token-xyz")
	recBearer := httptest.NewRecorder()
	srv.httpServer.Handler.ServeHTTP(recBearer, reqBearer)

	if recBearer.Code != http.StatusOK {
		t.Fatalf("expected 200 OK with bearer token, got %d", recBearer.Code)
	}

	// Basic auth should succeed
	reqBasic := httptest.NewRequest(http.MethodGet, "/api/v1/status", nil)
	reqBasic.SetBasicAuth("admin", "secret123")
	recBasic := httptest.NewRecorder()
	srv.httpServer.Handler.ServeHTTP(recBasic, reqBasic)

	if recBasic.Code != http.StatusOK {
		t.Fatalf("expected 200 OK with basic auth, got %d", recBasic.Code)
	}
}

func TestAuditLogStressIndex(t *testing.T) {
	log := NewAuditLog(50)

	if log.CalculateStressIndex() != 0.0 {
		t.Errorf("expected 0.0 stress index for empty log")
	}

	now := time.Now().UTC()
	for i := 0; i < 3; i++ {
		log.Add(AuditEntry{
			ID:        "evt",
			Timestamp: now,
			Status:    "TRIGGERED",
		})
	}

	// 3 anomalies / 5 = 0.6
	idx := log.CalculateStressIndex()
	if idx < 0.59 || idx > 0.61 {
		t.Errorf("expected stress index ~0.6, got %f", idx)
	}
}

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

func TestUIDirServing(t *testing.T) {
	tmpDir := t.TempDir()
	customHTML := "<html><body>Disk Mode Live Dev</body></html>"
	if err := os.WriteFile(filepath.Join(tmpDir, "index.html"), []byte(customHTML), 0644); err != nil {
		t.Fatalf("failed to write test file: %v", err)
	}

	cfg := ServerConfig{
		Addr:  "127.0.0.1:0",
		UIDir: tmpDir,
	}
	srv := NewServer(cfg, collector.EnvStandalone, newTestLogger())

	req := httptest.NewRequest(http.MethodGet, "/arbitrary-spa-path", nil)
	rec := httptest.NewRecorder()
	srv.httpServer.Handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200 OK, got %d", rec.Code)
	}
	if !bytes.Contains(rec.Body.Bytes(), []byte("Disk Mode Live Dev")) {
		t.Errorf("expected custom disk HTML, got: %s", rec.Body.String())
	}
}

func TestUIProxyServing(t *testing.T) {
	// Mock Vite dev server
	mockVite := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("<h1>Vite Dev Server Live HMR</h1>"))
	}))
	defer mockVite.Close()

	cfg := ServerConfig{
		Addr:       "127.0.0.1:0",
		UIProxyURL: mockVite.URL,
	}
	srv := NewServer(cfg, collector.EnvStandalone, newTestLogger())

	// 1. UI request should be proxied to mock Vite
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	rec := httptest.NewRecorder()
	srv.httpServer.Handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200 OK from proxy, got %d", rec.Code)
	}
	if !bytes.Contains(rec.Body.Bytes(), []byte("Vite Dev Server Live HMR")) {
		t.Errorf("expected vite dev content, got: %s", rec.Body.String())
	}

	// 2. API request should NOT be proxied to Vite, should be handled by Go
	apiReq := httptest.NewRequest(http.MethodGet, "/api/v1/health", nil)
	apiRec := httptest.NewRecorder()
	srv.httpServer.Handler.ServeHTTP(apiRec, apiReq)

	if apiRec.Code != http.StatusOK {
		t.Fatalf("expected 200 OK for /api/v1/health, got %d", apiRec.Code)
	}
	if !bytes.Contains(apiRec.Body.Bytes(), []byte("healthy")) {
		t.Errorf("expected healthy JSON response, got: %s", apiRec.Body.String())
	}
}

func TestContainerRestartEndpointRouting(t *testing.T) {
	cfg := ServerConfig{Addr: "127.0.0.1:0"}
	srv := NewServer(cfg, collector.EnvStandalone, newTestLogger())

	// 1. Valid endpoint route (Standalone should return 400 Bad Request, NOT 404 endpoint not found!)
	req := httptest.NewRequest(http.MethodPost, "/api/v1/containers/03dbf3e7024a/restart", bytes.NewBufferString(`{}`))
	rec := httptest.NewRecorder()
	srv.httpServer.Handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 Bad Request in standalone, got %d (body: %s)", rec.Code, rec.Body.String())
	}

	var res map[string]interface{}
	_ = json.NewDecoder(rec.Body).Decode(&res)
	if res["error"] == "endpoint not found" {
		t.Fatalf("endpoint routing failed with 'endpoint not found'")
	}

	// 2. Trailing slash should also route correctly
	reqSlash := httptest.NewRequest(http.MethodPost, "/api/v1/containers/03dbf3e7024a/restart/", bytes.NewBufferString(`{}`))
	recSlash := httptest.NewRecorder()
	srv.httpServer.Handler.ServeHTTP(recSlash, reqSlash)

	if recSlash.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 Bad Request for trailing slash, got %d", recSlash.Code)
	}

	// 3. Complex container name like Docker Swarm/Compose: portainer_portainer.1.5ey5mf24bw9s2b65287whpedt
	reqComplex := httptest.NewRequest(http.MethodPost, "/api/v1/containers/portainer_portainer.1.5ey5mf24bw9s2b65287whpedt/restart", bytes.NewBufferString(`{}`))
	recComplex := httptest.NewRecorder()
	srv.httpServer.Handler.ServeHTTP(recComplex, reqComplex)

	if recComplex.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 Bad Request for complex container name, got %d", recComplex.Code)
	}

	// 4. Invalid action should return 404 endpoint not found
	reqInvalid := httptest.NewRequest(http.MethodPost, "/api/v1/containers/03dbf3e7024a/unknown_action", nil)
	recInvalid := httptest.NewRecorder()
	srv.httpServer.Handler.ServeHTTP(recInvalid, reqInvalid)

	if recInvalid.Code != http.StatusNotFound {
		t.Fatalf("expected 404 Not Found for invalid action, got %d", recInvalid.Code)
	}

	// 5. Wrong HTTP method should return 405 Method Not Allowed
	reqMethod := httptest.NewRequest(http.MethodGet, "/api/v1/containers/03dbf3e7024a/restart", nil)
	recMethod := httptest.NewRecorder()
	srv.httpServer.Handler.ServeHTTP(recMethod, reqMethod)

	if recMethod.Code != http.StatusMethodNotAllowed {
		t.Fatalf("expected 405 Method Not Allowed, got %d", recMethod.Code)
	}
}

func TestRulesEndpoint_CRUD(t *testing.T) {
	rule1 := config.Rule{
		Name:               "initial-cpu",
		MetricType:         config.MetricCPUPercent,
		Operator:           config.OperatorGT,
		Threshold:          75.0,
		ConsecutivePeriods: 2,
		Action:             config.ActionRestart,
		CooldownSeconds:    60,
	}

	engine := ruleengine.NewRuleEngine([]config.Rule{rule1}, false, nil, nil)
	var savedRules []config.Rule
	saveFn := func(rules []config.Rule) error {
		savedRules = make([]config.Rule, len(rules))
		copy(savedRules, rules)
		return nil
	}

	cfg := ServerConfig{
		Addr:       "127.0.0.1:0",
		RuleEngine: engine,
		ConfigPath: "/etc/zeropulse/rules.yaml",
		SaveRules:  saveFn,
	}
	srv := NewServer(cfg, collector.EnvStandalone, newTestLogger())

	// 1. GET /api/v1/rules
	reqGet := httptest.NewRequest(http.MethodGet, "/api/v1/rules", nil)
	recGet := httptest.NewRecorder()
	srv.httpServer.Handler.ServeHTTP(recGet, reqGet)

	if recGet.Code != http.StatusOK {
		t.Fatalf("expected 200 OK, got %d", recGet.Code)
	}

	var resGet struct {
		Count      int           `json:"count"`
		DryRun     bool          `json:"dry_run"`
		ConfigPath string        `json:"config_path"`
		Rules      []config.Rule `json:"rules"`
	}
	if err := json.NewDecoder(recGet.Body).Decode(&resGet); err != nil {
		t.Fatalf("failed to parse GET rules: %v", err)
	}
	if resGet.Count != 1 || len(resGet.Rules) != 1 || resGet.Rules[0].Name != "initial-cpu" {
		t.Fatalf("GET /api/v1/rules returned unexpected data: %+v", resGet)
	}
	if resGet.ConfigPath != "/etc/zeropulse/rules.yaml" {
		t.Errorf("expected config path '/etc/zeropulse/rules.yaml', got %q", resGet.ConfigPath)
	}

	// 2. POST /api/v1/rules (Valid Rule)
	newRule := config.Rule{
		Name:               "new-mem",
		MetricType:         config.MetricMemPercent,
		Operator:           config.OperatorGTE,
		Threshold:          85.0,
		ConsecutivePeriods: 1,
		Action:             config.ActionNotify,
		CooldownSeconds:    30,
	}
	payload, _ := json.Marshal(newRule)
	reqPost := httptest.NewRequest(http.MethodPost, "/api/v1/rules", bytes.NewReader(payload))
	recPost := httptest.NewRecorder()
	srv.httpServer.Handler.ServeHTTP(recPost, reqPost)

	if recPost.Code != http.StatusCreated {
		t.Fatalf("expected 201 Created, got %d (body: %s)", recPost.Code, recPost.Body.String())
	}
	if len(savedRules) != 2 {
		t.Fatalf("expected saveFn to receive 2 rules, got %d", len(savedRules))
	}
	if len(engine.Rules()) != 2 {
		t.Fatalf("expected engine to have 2 rules, got %d", len(engine.Rules()))
	}

	// 3. POST /api/v1/rules (Duplicate Name -> 409 Conflict)
	reqDup := httptest.NewRequest(http.MethodPost, "/api/v1/rules", bytes.NewReader(payload))
	recDup := httptest.NewRecorder()
	srv.httpServer.Handler.ServeHTTP(recDup, reqDup)

	if recDup.Code != http.StatusConflict {
		t.Fatalf("expected 409 Conflict for duplicate rule, got %d", recDup.Code)
	}

	// 4. POST /api/v1/rules (Invalid Rule -> 400 Bad Request)
	badRule := config.Rule{
		Name:       "bad",
		MetricType: "INVALID_METRIC",
	}
	badPayload, _ := json.Marshal(badRule)
	reqBad := httptest.NewRequest(http.MethodPost, "/api/v1/rules", bytes.NewReader(badPayload))
	recBad := httptest.NewRecorder()
	srv.httpServer.Handler.ServeHTTP(recBad, reqBad)

	if recBad.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 Bad Request for invalid rule, got %d", recBad.Code)
	}

	// 5. DELETE /api/v1/rules/new-mem
	reqDel := httptest.NewRequest(http.MethodDelete, "/api/v1/rules/new-mem", nil)
	recDel := httptest.NewRecorder()
	srv.httpServer.Handler.ServeHTTP(recDel, reqDel)

	if recDel.Code != http.StatusOK {
		t.Fatalf("expected 200 OK for delete, got %d (body: %s)", recDel.Code, recDel.Body.String())
	}
	if len(savedRules) != 1 || savedRules[0].Name != "initial-cpu" {
		t.Fatalf("expected saveFn to receive 1 remaining rule, got %v", savedRules)
	}

	// 6. DELETE /api/v1/rules/non-existent (404 Not Found)
	reqDel404 := httptest.NewRequest(http.MethodDelete, "/api/v1/rules/non-existent", nil)
	recDel404 := httptest.NewRecorder()
	srv.httpServer.Handler.ServeHTTP(recDel404, reqDel404)

	if recDel404.Code != http.StatusNotFound {
		t.Fatalf("expected 404 Not Found for non-existent rule, got %d", recDel404.Code)
	}
}



