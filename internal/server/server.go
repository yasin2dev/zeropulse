package server

import (
	"context"
	"crypto/subtle"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"strings"
	"sync"
	"time"

	"zeropulse-agent/internal/collector"
	"zeropulse-agent/internal/config"
	"zeropulse-agent/internal/ruleengine"
	"zeropulse-agent/internal/storage"
)

type contextKey string

const sessionContextKey contextKey = "zeropulse_session"

func getSessionFromContext(ctx context.Context) *storage.Session {
	if v, ok := ctx.Value(sessionContextKey).(*storage.Session); ok {
		return v
	}
	return nil
}

// ServerConfig holds runtime configuration for the internal HTTP API and SSE server.
type ServerConfig struct {
	Addr        string
	DryRun      bool
	AuthEnabled bool
	AuthUser    string
	AuthPass    string
	APIToken    string
	Store       *storage.Store
	RuleEngine  *ruleengine.RuleEngine
	ConfigPath  string
	SaveRules   func(rules []config.Rule) error
	UIDir       string
	UIProxyURL  string
}

// SystemOverview summarizes the overall edge host and container status.
type SystemOverview struct {
	Mode                string  `json:"mode"`
	TotalContainers     int     `json:"total_containers"`
	RunningContainers   int     `json:"running_containers"`
	SystemCPUPercent    float64 `json:"system_cpu_percent"`
	SystemMemUsedBytes  uint64  `json:"system_mem_used_bytes"`
	SystemMemTotalBytes uint64  `json:"system_mem_total_bytes"`
	StressIndex1m       float64 `json:"stress_index_1m"`
}

// ContainerCard represents the live telemetry profile for an individual container.
type ContainerCard struct {
	ID                  string  `json:"id"`
	Name                string  `json:"name"`
	Image               string  `json:"image"`
	Status              string  `json:"status"`
	CPUPercent          float64 `json:"cpu_percent"`
	MemPercent          float64 `json:"mem_percent"`
	MemUsageBytes       uint64  `json:"mem_usage_bytes"`
	MemLimitBytes       uint64  `json:"mem_limit_bytes"`
	CPUThrottledPeriods uint64  `json:"cpu_throttled_periods"`
	CPUThrottledTimeNs  uint64  `json:"cpu_throttled_time_ns"`
	NetRxBytes          uint64  `json:"net_rx_bytes"`
	NetTxBytes          uint64  `json:"net_tx_bytes"`
	HealthStatus        string  `json:"health_status"` // "ok", "warning", "critical", "cooldown"
}

// MetricsEventPayload represents the 5s periodic SSE event payload.
type MetricsEventPayload struct {
	Timestamp  time.Time       `json:"timestamp"`
	System     SystemOverview  `json:"system"`
	Containers []ContainerCard `json:"containers"`
	// Sample is this frame's history point, so live charts and /metrics/history agree exactly.
	Sample *MetricsSample `json:"sample,omitempty"`
}

// Server exposes the internal REST API and real-time SSE stream for the Edge UI.
type Server struct {
	mu            sync.RWMutex
	cfg           ServerConfig
	store         *storage.Store
	env           collector.Environment
	startTime     time.Time
	dryRun        bool
	ruleEngine    *ruleengine.RuleEngine
	configPath    string
	saveRules     func(rules []config.Rule) error
	latestPayload *MetricsEventPayload
	auditLog      *AuditLog
	history       *MetricsHistory
	sseHub        *SSEHub
	logger        *slog.Logger
	httpServer    *http.Server
}

// NewServer initializes a new Server.
func NewServer(cfg ServerConfig, env collector.Environment, logger *slog.Logger) *Server {
	if cfg.Addr == "" {
		cfg.Addr = "127.0.0.1:8080"
	}
	hub := NewSSEHub(logger)
	audit := NewAuditLog(100)

	s := &Server{
		cfg:        cfg,
		store:      cfg.Store,
		env:        env,
		startTime:  time.Now().UTC(),
		dryRun:     cfg.DryRun,
		ruleEngine: cfg.RuleEngine,
		configPath: cfg.ConfigPath,
		saveRules:  cfg.SaveRules,
		auditLog:   audit,
		history:    NewMetricsHistory(metricsHistoryCapacity),
		sseHub:     hub,
		logger:     logger,
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/api/v1/health", s.handleHealth)
	mux.HandleFunc("/api/v1/status", s.handleStatus)
	mux.HandleFunc("/api/v1/stream", s.handleStream)
	mux.HandleFunc("/api/v1/containers", s.handleContainers)
	mux.HandleFunc("/api/v1/config/dry-run", s.handleDryRun)
	mux.HandleFunc("/api/v1/audit/logs", s.handleAuditLogs)
	mux.HandleFunc("/api/v1/metrics/history", s.handleMetricsHistory)
	mux.HandleFunc("/api/v1/rules", s.handleRules)
	mux.HandleFunc("/api/v1/rules/", s.handleRuleActions)
	mux.HandleFunc("/api/v1/containers/", s.handleContainerActions) // matches /api/v1/containers/{id}/restart

	// Authentication & User Management Routes
	mux.HandleFunc("/api/v1/auth/status", s.handleAuthStatus)
	mux.HandleFunc("/api/v1/auth/setup", s.handleAuthSetup)
	mux.HandleFunc("/api/v1/auth/login", s.handleAuthLogin)
	mux.HandleFunc("/api/v1/auth/logout", s.handleAuthLogout)
	mux.HandleFunc("/api/v1/auth/me", s.handleAuthMe)
	mux.HandleFunc("/api/v1/users", s.handleUsers)
	mux.HandleFunc("/api/v1/users/", s.handleUserActions)

	uiHandler, err := newUIHandler(cfg)
	if err == nil {
		mux.Handle("/", uiHandler)
	} else if logger != nil {
		logger.Warn("ui assets not available", "error", err)
	}

	handler := s.corsMiddleware(s.authMiddleware(mux))

	s.httpServer = &http.Server{
		Addr:         cfg.Addr,
		Handler:      handler,
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 0, // SSE requires no write timeout
		IdleTimeout:  60 * time.Second,
	}

	return s
}

// Start begins listening on the configured address.
func (s *Server) Start() error {
	s.logger.Info("starting embedded agent api server", "addr", s.cfg.Addr)
	if err := s.httpServer.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		return fmt.Errorf("http server failed: %w", err)
	}
	return nil
}

// Stop gracefully shuts down the HTTP server.
func (s *Server) Stop(ctx context.Context) error {
	return s.httpServer.Shutdown(ctx)
}

// IsDryRun returns whether dry-run mode is currently active.
func (s *Server) IsDryRun() bool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.dryRun
}

// SetDryRun updates the server dry-run setting and propagates to the rule engine.
func (s *Server) SetDryRun(val bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.dryRun = val
	if s.ruleEngine != nil {
		s.ruleEngine.SetDryRun(val)
	}
}

// PushMetrics updates the server cache with the latest collector cycle and broadcasts SSE.
func (s *Server) PushMetrics(payload MetricsEventPayload) {
	// Collectors don't know about the audit log; without this every SSE frame reports zero stress.
	payload.System.StressIndex1m = s.auditLog.CalculateStressIndex()
	sample := s.history.Record(payload)
	payload.Sample = &sample

	s.mu.Lock()
	s.latestPayload = &payload
	s.mu.Unlock()

	data, err := json.Marshal(payload)
	if err == nil {
		s.sseHub.Broadcast("metrics", fmt.Sprintf("%d", payload.Timestamp.UnixMilli()), data)
	}
}

// RecordAudit logs an anomaly or remediation event to the in-memory ring buffer and broadcasts via SSE.
func (s *Server) RecordAudit(containerID, containerName, ruleName, action, message, status string, dryRun bool) {
	entry := AuditEntry{
		ID:            fmt.Sprintf("%d", time.Now().UnixNano()),
		Timestamp:     time.Now().UTC(),
		ContainerID:   containerID,
		ContainerName: containerName,
		RuleName:      ruleName,
		Action:        action,
		Message:       message,
		Status:        status,
		DryRun:        dryRun,
	}
	s.PushAnomaly(entry)
}

// PushAnomaly logs an audit entry to the audit log buffer and broadcasts via SSE.
func (s *Server) PushAnomaly(entry AuditEntry) {
	s.auditLog.Add(entry)
	data, err := json.Marshal(entry)
	if err == nil {
		s.sseHub.Broadcast("anomaly", entry.ID, data)
	}
}

// ────────────────────────────────────────────────────────────────────────────
// Handlers: Telemetry & Monitoring
// ────────────────────────────────────────────────────────────────────────────

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"status":    "healthy",
		"version":   "0.2.0",
		"timestamp": time.Now().UTC().Format(time.RFC3339),
	})
}

func (s *Server) handleStatus(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	s.mu.RLock()
	defer s.mu.RUnlock()

	sys := SystemOverview{
		Mode: string(s.env),
	}
	if s.latestPayload != nil {
		sys = s.latestPayload.System
	}

	uptime := time.Since(s.startTime).Round(time.Second).String()
	stressIndex := s.auditLog.CalculateStressIndex()
	sys.StressIndex1m = stressIndex

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"uptime":         uptime,
		"dry_run":        s.dryRun,
		"system":         sys,
		"active_clients": s.sseHub.ClientCount(),
	})
}

func (s *Server) handleStream(w http.ResponseWriter, r *http.Request) {
	s.sseHub.ServeHTTP(w, r)
}

func (s *Server) handleContainers(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	s.mu.RLock()
	defer s.mu.RUnlock()

	var containers []ContainerCard
	var ts time.Time
	if s.latestPayload != nil {
		containers = s.latestPayload.Containers
		ts = s.latestPayload.Timestamp
	} else {
		containers = []ContainerCard{}
		ts = time.Now().UTC()
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"timestamp":  ts,
		"containers": containers,
	})
}

func (s *Server) handleDryRun(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		s.mu.RLock()
		val := s.dryRun
		s.mu.RUnlock()
		writeJSON(w, http.StatusOK, map[string]bool{"dry_run": val})

	case http.MethodPost, http.MethodPut:
		// Requires admin role
		if sess := getSessionFromContext(r.Context()); sess != nil && sess.Role != "admin" {
			writeError(w, http.StatusForbidden, "bu işlem için yönetici (admin) yetkisi gereklidir")
			return
		}

		var req struct {
			DryRun bool `json:"dry_run"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid request body")
			return
		}

		s.SetDryRun(req.DryRun)
		s.logger.Info("dry-run mode toggled via api", "dry_run", req.DryRun)
		s.RecordAudit("", "", "CONFIG", "CONFIG_CHANGE",
			fmt.Sprintf("Dry-run mode changed to %v via API", req.DryRun), "CONFIG_CHANGED", req.DryRun)

		writeJSON(w, http.StatusOK, map[string]interface{}{
			"dry_run": req.DryRun,
			"message": "dry-run configuration updated",
		})

	default:
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
	}
}

func (s *Server) handleAuditLogs(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	logs := s.auditLog.GetAll(100)
	stressIndex := s.auditLog.CalculateStressIndex()

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"stress_index_1m": stressIndex,
		"total_count":     len(logs),
		"logs":            logs,
		"entries":         logs,
	})
}

func (s *Server) handleMetricsHistory(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"samples": s.history.Snapshot(),
	})
}

func (s *Server) handleRules(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		s.mu.RLock()
		engine := s.ruleEngine
		cfgPath := s.configPath
		dryRun := s.dryRun
		s.mu.RUnlock()

		var rules []config.Rule
		if engine != nil {
			rules = engine.Rules()
		} else {
			rules = []config.Rule{}
		}

		writeJSON(w, http.StatusOK, map[string]interface{}{
			"count":       len(rules),
			"dry_run":     dryRun,
			"config_path": cfgPath,
			"rules":       rules,
		})

	case http.MethodPost:
		// Requires admin role if authentication is active
		if sess := getSessionFromContext(r.Context()); sess != nil && sess.Role != "admin" {
			writeError(w, http.StatusForbidden, "bu işlem için yönetici (admin) yetkisi gereklidir")
			return
		}

		s.mu.RLock()
		engine := s.ruleEngine
		saveFn := s.saveRules
		dryRun := s.dryRun
		s.mu.RUnlock()

		if engine == nil {
			writeError(w, http.StatusServiceUnavailable, "kural motoru aktif değil")
			return
		}

		var newRule config.Rule
		if err := json.NewDecoder(r.Body).Decode(&newRule); err != nil {
			writeError(w, http.StatusBadRequest, "geçersiz istek gövdesi (JSON formatı hatalı)")
			return
		}

		if err := newRule.Validate(); err != nil {
			writeError(w, http.StatusBadRequest, "kural doğrulama hatası: "+err.Error())
			return
		}

		if err := engine.AddRule(newRule); err != nil {
			writeError(w, http.StatusConflict, err.Error())
			return
		}

		if saveFn != nil {
			if err := saveFn(engine.Rules()); err != nil {
				// Rollback
				engine.DeleteRule(newRule.Name)
				s.logger.Error("failed to persist rules to disk", "error", err)
				writeError(w, http.StatusInternalServerError, "kural diske kaydedilemedi: "+err.Error())
				return
			}
		}

		s.RecordAudit("", "", newRule.Name, "CREATE_RULE",
			fmt.Sprintf("Yeni kural '%s' (%s %s %g) oluşturuldu", newRule.Name, newRule.MetricType, newRule.Operator, newRule.Threshold),
			"RULE_CREATED", dryRun)

		writeJSON(w, http.StatusCreated, map[string]interface{}{
			"message": "kural başarıyla oluşturuldu",
			"rule":    newRule,
		})

	default:
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
	}
}

func (s *Server) handleRuleActions(w http.ResponseWriter, r *http.Request) {
	ruleName := strings.TrimPrefix(r.URL.Path, "/api/v1/rules/")
	ruleName = strings.TrimSpace(ruleName)
	if ruleName == "" {
		writeError(w, http.StatusBadRequest, "kural adı belirtilmelidir")
		return
	}

	switch r.Method {
	case http.MethodDelete:
		if sess := getSessionFromContext(r.Context()); sess != nil && sess.Role != "admin" {
			writeError(w, http.StatusForbidden, "bu işlem için yönetici (admin) yetkisi gereklidir")
			return
		}

		s.mu.RLock()
		engine := s.ruleEngine
		saveFn := s.saveRules
		dryRun := s.dryRun
		s.mu.RUnlock()

		if engine == nil {
			writeError(w, http.StatusServiceUnavailable, "kural motoru aktif değil")
			return
		}

		deleted := engine.DeleteRule(ruleName)
		if !deleted {
			writeError(w, http.StatusNotFound, fmt.Sprintf("'%s' isimli kural bulunamadı", ruleName))
			return
		}

		if saveFn != nil {
			if err := saveFn(engine.Rules()); err != nil {
				s.logger.Error("failed to persist rules after deletion", "error", err)
				writeError(w, http.StatusInternalServerError, "güncel kurallar diske kaydedilemedi: "+err.Error())
				return
			}
		}

		s.RecordAudit("", "", ruleName, "DELETE_RULE",
			fmt.Sprintf("'%s' isimli kural silindi", ruleName),
			"RULE_DELETED", dryRun)

		writeJSON(w, http.StatusOK, map[string]interface{}{
			"message": "kural başarıyla silindi",
			"name":    ruleName,
		})

	default:
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
	}
}

func (s *Server) handleContainerActions(w http.ResponseWriter, r *http.Request) {
	trimmed := strings.Trim(r.URL.Path, "/")
	if !strings.HasPrefix(trimmed, "api/v1/containers/") || !strings.HasSuffix(trimmed, "/restart") {
		writeError(w, http.StatusNotFound, "endpoint not found")
		return
	}

	parts := strings.Split(trimmed, "/")
	if len(parts) != 5 {
		writeError(w, http.StatusNotFound, "endpoint not found")
		return
	}
	containerID := parts[3]

	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	// Requires admin role
	if sess := getSessionFromContext(r.Context()); sess != nil && sess.Role != "admin" {
		writeError(w, http.StatusForbidden, "bu işlem için yönetici (admin) yetkisi gereklidir")
		return
	}

	if s.env != collector.EnvDocker {
		writeError(w, http.StatusBadRequest, "manual container restart is only supported in docker environment")
		return
	}

	s.logger.Info("manual restart triggered via api", "container_id", containerID)

	if err := collector.RestartContainer(r.Context(), containerID); err != nil {
		s.logger.Error("failed to restart container", "container_id", containerID, "error", err)
		s.RecordAudit(containerID, "", "MANUAL", "RESTART", "Docker restart failed: "+err.Error(), "FAILED", false)
		writeError(w, http.StatusInternalServerError, "failed to restart container: "+err.Error())
		return
	}

	s.logger.Info("container restarted successfully via api", "container_id", containerID)
	s.RecordAudit(containerID, "", "MANUAL", "RESTART", "Container manually restarted by user", "ACTION_EXECUTED", false)

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"success":      true,
		"container_id": containerID,
		"message":      "container restarted successfully",
	})
}

// ────────────────────────────────────────────────────────────────────────────
// Handlers: Authentication & User Management
// ────────────────────────────────────────────────────────────────────────────

func (s *Server) handleAuthStatus(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	if s.store == nil {
		writeJSON(w, http.StatusOK, map[string]interface{}{
			"auth_enabled":  false,
			"initialized":   true,
			"authenticated": true,
		})
		return
	}

	init, err := s.store.IsInitialized()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "veritabanı durumu okunamadı: "+err.Error())
		return
	}

	sess := s.extractSession(r)
	if sess != nil {
		writeJSON(w, http.StatusOK, map[string]interface{}{
			"auth_enabled":  true,
			"initialized":   init,
			"authenticated": true,
			"user": map[string]string{
				"username": sess.Username,
				"role":     sess.Role,
			},
		})
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"auth_enabled":  true,
		"initialized":   init,
		"authenticated": false,
	})
}

func (s *Server) handleAuthSetup(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	if s.store == nil {
		writeError(w, http.StatusBadRequest, "veritabanı aktif değil")
		return
	}

	init, err := s.store.IsInitialized()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if init {
		writeError(w, http.StatusForbidden, "sistem zaten yapılandırılmış")
		return
	}

	var req struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "geçersiz istek gövdesi")
		return
	}

	user, err := s.store.CreateSuperuser(req.Username, req.Password)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	sess, err := s.store.CreateSession(user.Username, user.Role, 7*24*time.Hour)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "oturum oluşturulamadı: "+err.Error())
		return
	}

	http.SetCookie(w, &http.Cookie{
		Name:     "zeropulse_session",
		Value:    sess.Token,
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		MaxAge:   int(7 * 24 * time.Hour.Seconds()),
	})

	s.logger.Info("superuser setup completed successfully", "username", user.Username)

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"token": sess.Token,
		"user":  user,
	})
}

func (s *Server) handleAuthLogin(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	if s.store == nil {
		writeError(w, http.StatusBadRequest, "veritabanı aktif değil")
		return
	}

	var req struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "geçersiz istek gövdesi")
		return
	}

	user, err := s.store.Authenticate(req.Username, req.Password)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "kullanıcı adı veya şifre hatalı")
		return
	}

	sess, err := s.store.CreateSession(user.Username, user.Role, 7*24*time.Hour)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "oturum oluşturulamadı: "+err.Error())
		return
	}

	http.SetCookie(w, &http.Cookie{
		Name:     "zeropulse_session",
		Value:    sess.Token,
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		MaxAge:   int(7 * 24 * time.Hour.Seconds()),
	})

	s.logger.Info("user logged in", "username", user.Username, "role", user.Role)

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"token": sess.Token,
		"user":  user,
	})
}

func (s *Server) handleAuthLogout(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	token := s.extractToken(r)
	if s.store != nil && token != "" {
		_ = s.store.DeleteSession(token)
	}

	http.SetCookie(w, &http.Cookie{
		Name:     "zeropulse_session",
		Value:    "",
		Path:     "/",
		HttpOnly: true,
		MaxAge:   -1,
	})

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"message": "başarıyla çıkış yapıldı",
	})
}

func (s *Server) handleAuthMe(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	sess := getSessionFromContext(r.Context())
	if sess == nil {
		writeError(w, http.StatusUnauthorized, "yetkisiz erişim")
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"username": sess.Username,
		"role":     sess.Role,
	})
}

func (s *Server) handleUsers(w http.ResponseWriter, r *http.Request) {
	sess := getSessionFromContext(r.Context())
	if sess == nil || sess.Role != "admin" {
		writeError(w, http.StatusForbidden, "bu işlem için yönetici yetkisi gereklidir")
		return
	}

	switch r.Method {
	case http.MethodGet:
		users, err := s.store.ListUsers()
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		writeJSON(w, http.StatusOK, map[string]interface{}{
			"users": users,
		})

	case http.MethodPost:
		var req struct {
			Username string `json:"username"`
			Password string `json:"password"`
			Role     string `json:"role"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "geçersiz istek gövdesi")
			return
		}

		user, err := s.store.CreateUser(req.Username, req.Password, req.Role)
		if err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}

		s.logger.Info("user created", "username", user.Username, "role", user.Role, "by", sess.Username)
		writeJSON(w, http.StatusCreated, map[string]interface{}{
			"user": user,
		})

	default:
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
	}
}

func (s *Server) handleUserActions(w http.ResponseWriter, r *http.Request) {
	sess := getSessionFromContext(r.Context())
	if sess == nil || sess.Role != "admin" {
		writeError(w, http.StatusForbidden, "bu işlem için yönetici yetkisi gereklidir")
		return
	}

	// Path: /api/v1/users/{username} or /api/v1/users/{username}/password
	trimmed := strings.Trim(r.URL.Path, "/")
	parts := strings.Split(trimmed, "/")

	if len(parts) == 4 && r.Method == http.MethodDelete {
		username := parts[3]
		if err := s.store.DeleteUser(username, sess.Username); err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}
		s.logger.Info("user deleted", "username", username, "by", sess.Username)
		writeJSON(w, http.StatusOK, map[string]interface{}{
			"message": "kullanıcı başarıyla silindi",
		})
		return
	}

	if len(parts) == 5 && parts[4] == "password" && r.Method == http.MethodPut {
		username := parts[3]
		var req struct {
			Password string `json:"password"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "geçersiz istek gövdesi")
			return
		}

		if err := s.store.UpdatePassword(username, req.Password); err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}
		s.logger.Info("user password changed", "username", username, "by", sess.Username)
		writeJSON(w, http.StatusOK, map[string]interface{}{
			"message": "şifre başarıyla güncellendi",
		})
		return
	}

	writeError(w, http.StatusNotFound, "endpoint bulunamadı")
}

// ────────────────────────────────────────────────────────────────────────────
// Middleware
// ────────────────────────────────────────────────────────────────────────────

func (s *Server) corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With")

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusOK)
			return
		}

		next.ServeHTTP(w, r)
	})
}

func (s *Server) authMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// 1. Allow public health check and auth entrypoints
		if r.URL.Path == "/api/v1/health" ||
			r.URL.Path == "/api/v1/auth/status" ||
			r.URL.Path == "/api/v1/auth/setup" ||
			r.URL.Path == "/api/v1/auth/login" {
			next.ServeHTTP(w, r)
			return
		}

		// 2. Allow all static UI assets without blocking
		if !strings.HasPrefix(r.URL.Path, "/api/") {
			next.ServeHTTP(w, r)
			return
		}

		// 3. If storage is enabled, check session token
		if s.store != nil {
			// If not initialized yet, block other API endpoints
			if init, err := s.store.IsInitialized(); err == nil && !init {
				writeError(w, http.StatusUnauthorized, "sistem kurulumu yapılmamış; ilk süper yöneticiyi oluşturun")
				return
			}

			sess := s.extractSession(r)
			if sess != nil {
				ctx := context.WithValue(r.Context(), sessionContextKey, sess)
				next.ServeHTTP(w, r.WithContext(ctx))
				return
			}
		}

		// 4. Fallback checks: Bearer APIToken & Basic Auth (if configured)
		if s.cfg.APIToken != "" {
			authHeader := r.Header.Get("Authorization")
			if strings.HasPrefix(authHeader, "Bearer ") {
				token := strings.TrimPrefix(authHeader, "Bearer ")
				if subtle.ConstantTimeCompare([]byte(token), []byte(s.cfg.APIToken)) == 1 {
					synthetic := &storage.Session{Username: "api_token", Role: "admin"}
					ctx := context.WithValue(r.Context(), sessionContextKey, synthetic)
					next.ServeHTTP(w, r.WithContext(ctx))
					return
				}
			}
		}

		if s.cfg.AuthUser != "" && s.cfg.AuthPass != "" {
			user, pass, ok := r.BasicAuth()
			if ok {
				userMatch := subtle.ConstantTimeCompare([]byte(user), []byte(s.cfg.AuthUser)) == 1
				passMatch := subtle.ConstantTimeCompare([]byte(pass), []byte(s.cfg.AuthPass)) == 1
				if userMatch && passMatch {
					synthetic := &storage.Session{Username: user, Role: "admin"}
					ctx := context.WithValue(r.Context(), sessionContextKey, synthetic)
					next.ServeHTTP(w, r.WithContext(ctx))
					return
				}
			}
		}

		// 5. If storage is not enabled and AuthEnabled flag is false, allow through
		if s.store == nil && !s.cfg.AuthEnabled {
			next.ServeHTTP(w, r)
			return
		}

		// Return clean JSON 401 without WWW-Authenticate header so browsers (Chrome/Firefox)
		// don't show the intrusive native browser login modal popup.
		writeError(w, http.StatusUnauthorized, "yetkisiz erişim")
	})
}

func (s *Server) extractToken(r *http.Request) string {
	authHeader := r.Header.Get("Authorization")
	if strings.HasPrefix(authHeader, "Bearer ") {
		return strings.TrimSpace(strings.TrimPrefix(authHeader, "Bearer "))
	}
	if cookie, err := r.Cookie("zeropulse_session"); err == nil && cookie.Value != "" {
		return cookie.Value
	}
	return ""
}

func (s *Server) extractSession(r *http.Request) *storage.Session {
	if s.store == nil {
		return nil
	}
	token := s.extractToken(r)
	if token == "" {
		return nil
	}
	sess, err := s.store.GetSession(token)
	if err != nil {
		return nil
	}
	return sess
}

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

func writeJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(data)
}

func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]interface{}{
		"error":     message,
		"status":    status,
		"timestamp": time.Now().UTC().Format(time.RFC3339),
	})
}
