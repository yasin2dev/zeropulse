package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"log/slog"
	"net"
	"os"
	"os/signal"
	"path/filepath"
	"strconv"
	"syscall"
	"time"

	"zeropulse-agent/internal/collector"
	"zeropulse-agent/internal/config"
	"zeropulse-agent/internal/engine"
	"zeropulse-agent/internal/ruleengine"
	"zeropulse-agent/internal/server"
	"zeropulse-agent/internal/storage"
)

const collectInterval = 5 * time.Second

const (
	// The dashboard can restart containers, so it stays private until exposed on purpose.
	defaultListenAddr = "127.0.0.1:8080"
	// Remediation is opt-in: a fresh install only observes.
	defaultDryRunEnabled = true
)

// shouldExecuteRestart reports whether an anomaly may restart a container.
// Only explicit RESTART rules qualify; RESTART_SUGGESTED is advice from the built-in checks.
func shouldExecuteRestart(action string, dryRun bool) bool {
	return !dryRun && action == string(config.ActionRestart)
}

// isLoopbackAddr reports whether a listen address accepts only local connections.
func isLoopbackAddr(addr string) bool {
	host, _, err := net.SplitHostPort(addr)
	if err != nil {
		return false
	}
	if host == "localhost" {
		return true
	}
	ip := net.ParseIP(host)
	return ip != nil && ip.IsLoopback()
}

func main() {
	var (
		configPath   string
		dryRun       bool
		cpuThreshold float64
		memThreshold float64
		cooldown     time.Duration
		listenAddr   string
		authEnabled  bool
		authUser     string
		authPass      string
		apiToken      string
		dataDir       string
		resetPassword string
		resetUsername string
		showVersion   bool
		uiDir         string
		uiProxy       string
	)

	defaultCPU := envFloatOrDefault("ZEROPULSE_CPU_THRESHOLD", engine.DefaultCPUThreshold)
	defaultMem := envFloatOrDefault("ZEROPULSE_MEM_THRESHOLD", engine.DefaultMemThreshold)
	defaultCooldown := envDurationOrDefault("ZEROPULSE_COOLDOWN", engine.DefaultCooldown)
	defaultAddr := envStringOrDefault("ZEROPULSE_LISTEN_ADDR", defaultListenAddr)
	defaultDryRun := envBoolOrDefault("ZEROPULSE_DRY_RUN", defaultDryRunEnabled)
	defaultAuth := envBoolOrDefault("ZEROPULSE_AUTH_ENABLED", false)
	defaultUser := envStringOrDefault("ZEROPULSE_AUTH_USER", "admin")
	defaultPass := os.Getenv("ZEROPULSE_AUTH_PASS")
	defaultToken := os.Getenv("ZEROPULSE_API_TOKEN")
	defaultDataDir := envStringOrDefault("ZEROPULSE_DATA_DIR", "./data")
	defaultUIDir := os.Getenv("ZEROPULSE_UI_DIR")
	defaultUIProxy := os.Getenv("ZEROPULSE_UI_PROXY")

	flag.StringVar(&configPath, "config", "", "Path to YAML or JSON rule configuration file")
	flag.BoolVar(&dryRun, "dry-run", defaultDryRun, "Log actions without executing remediation; use --dry-run=false to allow RESTART rules")
	flag.Float64Var(&cpuThreshold, "cpu-threshold", defaultCPU, "CPU saturation threshold percentage (e.g. 80.0, or 0.5 for testing)")
	flag.Float64Var(&memThreshold, "mem-threshold", defaultMem, "Memory critical threshold percentage (default 85.0)")
	flag.DurationVar(&cooldown, "cooldown", defaultCooldown, "Per-container anomaly cooldown duration (default 60s)")
	flag.StringVar(&listenAddr, "listen-addr", defaultAddr, "Address for the embedded edge dashboard API & SSE server")
	flag.StringVar(&dataDir, "data-dir", defaultDataDir, "Directory to store persistent database and state (default ./data)")
	flag.BoolVar(&authEnabled, "auth", defaultAuth, "Enable HTTP authentication for the API and dashboard")
	flag.StringVar(&authUser, "auth-user", defaultUser, "HTTP Basic Auth username")
	flag.StringVar(&authPass, "auth-pass", defaultPass, "HTTP Basic Auth password")
	flag.StringVar(&apiToken, "api-token", defaultToken, "Bearer API token for automated integration")
	flag.StringVar(&resetPassword, "reset-password", "", "Set or reset the password for an operator/admin account, then exit")
	flag.StringVar(&resetUsername, "reset-user", "admin", "Username whose password should be reset (default: admin)")
	flag.StringVar(&uiDir, "ui-dir", defaultUIDir, "Serve UI static files from disk instead of embedded assets (e.g. ./ui/dist)")
	flag.StringVar(&uiProxy, "ui-proxy", defaultUIProxy, "Reverse proxy UI requests to live Vite dev server (e.g. http://localhost:3000)")
	flag.BoolVar(&showVersion, "version", false, "Print version and exit")
	flag.Parse()

	if showVersion {
		fmt.Println("zeropulse v0.2.0 (embedded edge dashboard)")
		return
	}

	if resetPassword != "" {
		dbPath := filepath.Join(dataDir, "zeropulse.db")
		store, err := storage.Open(dbPath)
		if err != nil {
			fmt.Fprintf(os.Stderr, "Hata: Veritabanı açılamadı (%s): %v\n", dbPath, err)
			os.Exit(1)
		}
		defer store.Close()

		if err := store.ResetPassword(resetUsername, resetPassword); err != nil {
			fmt.Fprintf(os.Stderr, "Hata: Şifre sıfırlanamadı: %v\n", err)
			os.Exit(1)
		}

		fmt.Printf("✓ '%s' kullanıcısının şifresi başarıyla güncellendi. (DB: %s)\n", resetUsername, dbPath)
		return
	}

	// Structured logger → stderr; JSON telemetry → stdout (stays clean).
	logger := slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{
		Level: slog.LevelInfo,
	}))

	env := collector.DetectEnvironment()
	logger.Info("environment detected", "type", string(env))

	coreEngine := engine.New(engine.Config{
		CPUThreshold: cpuThreshold,
		MemThreshold: memThreshold,
		Cooldown:     cooldown,
	})
	logger.Info("state windowing engine initialized",
		"cpu_threshold", cpuThreshold,
		"mem_threshold", memThreshold,
		"window_size", 3,
		"cooldown", cooldown.String(),
	)

	resolvedConfigPath := config.ResolveConfigPath(configPath, os.Getenv("ZEROPULSE_CONFIG"))
	if resolvedConfigPath != "" {
		logger.Info("using rule configuration file", "path", resolvedConfigPath)
	}

	customRuleEngine, err := setupRuleEngine(resolvedConfigPath, dryRun, env, os.Stdout, logger)
	if err != nil {
		logger.Error("configuration initialization failed", "error", err)
		os.Exit(1)
	}
	if customRuleEngine == nil {
		// Initialize empty rule engine so API and UI can dynamically manage rules
		customRuleEngine = ruleengine.NewRuleEngine([]config.Rule{}, dryRun, os.Stdout, logger)
	}

	activeConfigPath := resolvedConfigPath
	if activeConfigPath == "" {
		if fi, err := os.Stat("/etc/zeropulse"); err == nil && fi.IsDir() {
			activeConfigPath = "/etc/zeropulse/rules.yaml"
		} else {
			activeConfigPath = "./rules.yaml"
		}
	}

	dbPath := filepath.Join(dataDir, "zeropulse.db")
	store, err := storage.Open(dbPath)
	if err != nil {
		logger.Error("failed to initialize persistent database", "path", dbPath, "error", err)
		os.Exit(1)
	}
	defer store.Close()
	logger.Info("persistent bbolt database ready", "path", dbPath)

	if !isLoopbackAddr(listenAddr) {
		logger.Warn("dashboard is reachable from the network; the first visitor can create the admin account until setup is complete", "addr", listenAddr)
	}

	loader := config.ConfigLoader{}
	serverCfg := server.ServerConfig{
		Addr:        listenAddr,
		DryRun:      dryRun,
		AuthEnabled: authEnabled,
		AuthUser:    authUser,
		AuthPass:    authPass,
		APIToken:    apiToken,
		Store:       store,
		RuleEngine:  customRuleEngine,
		ConfigPath:  activeConfigPath,
		UIDir:       uiDir,
		UIProxyURL:  uiProxy,
		SaveRules: func(rules []config.Rule) error {
			return loader.Save(activeConfigPath, rules)
		},
	}
	apiServer := server.NewServer(serverCfg, env, logger)

	// Forward custom rule anomalies to embedded dashboard audit log and self-healing executor
	customRuleEngine.SetAnomalyHandler(func(evt ruleengine.AnomalyEvent) {
		dryRunActive := apiServer.IsDryRun()
		status := "TRIGGERED"
		if dryRunActive {
			status = "DRY_RUN_SKIPPED"
		}

		entry := server.AuditEntry{
			ID:               fmt.Sprintf("rule-anom-%d", time.Now().UnixNano()),
			Timestamp:        time.Now().UTC(),
			ContainerID:      evt.ContainerID,
			ContainerName:    evt.ContainerName,
			RuleName:         evt.RuleName,
			MetricType:       evt.MetricType,
			CurrentValue:     evt.CurrentValue,
			Threshold:        evt.Threshold,
			ConsecutiveCount: evt.ConsecutiveCount,
			Action:           evt.Action,
			DryRun:           dryRunActive,
			Status:           status,
			Message:          fmt.Sprintf("[%s] Container %s breached rule %q (%s: %.1f, threshold: %.1f)", evt.RuleName, evt.ContainerName, evt.RuleName, evt.MetricType, evt.CurrentValue, evt.Threshold),
		}

		if shouldExecuteRestart(evt.Action, dryRunActive) && env == collector.EnvDocker {
			logger.Warn("executing self-healing restart remediation from rule engine", "container_id", evt.ContainerID, "container_name", evt.ContainerName, "rule", evt.RuleName)
			restartErr := collector.RestartContainer(context.Background(), evt.ContainerID)
			if restartErr != nil {
				entry.Status = "REMEDIATION_FAILED"
				entry.Message += fmt.Sprintf(" | Remediation restart failed: %v", restartErr)
				logger.Error("self-healing remediation failed", "container_id", evt.ContainerID, "error", restartErr)
			} else {
				entry.Status = "ACTION_EXECUTED"
				entry.Message += " | Container successfully restarted by custom rule engine"
				logger.Info("self-healing remediation succeeded", "container_id", evt.ContainerID, "rule", evt.RuleName)
			}
		}

		apiServer.PushAnomaly(entry)
	})

	// Graceful shutdown on SIGINT / SIGTERM.
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	// A dead API server must stop the agent: otherwise the process keeps running
	// with no dashboard and the service manager still reports it as healthy.
	serverErr := make(chan error, 1)
	go func() {
		if err := apiServer.Start(); err != nil {
			serverErr <- err
			stop()
		}
	}()

	encoder := json.NewEncoder(os.Stdout)
	encoder.SetIndent("", "  ")

	switch env {
	case collector.EnvDocker:
		runDockerLoop(ctx, logger, encoder, coreEngine, customRuleEngine, apiServer)
	case collector.EnvStandalone:
		runStandaloneLoop(ctx, logger, encoder, coreEngine, customRuleEngine, apiServer)
	}

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	if err := apiServer.Stop(shutdownCtx); err != nil {
		logger.Warn("api server graceful shutdown timed out", "error", err)
	}

	select {
	case err := <-serverErr:
		logger.Error("embedded api server error", "error", err)
		os.Exit(1)
	default:
	}

	logger.Info("agent stopped")
}

// setupRuleEngine loads rules if a configPath is given and initializes the RuleEngine.
// Returns an error if the config file cannot be read or parsed.
func setupRuleEngine(configPath string, dryRun bool, env collector.Environment, out io.Writer, logger *slog.Logger) (*ruleengine.RuleEngine, error) {
	if configPath == "" {
		return nil, nil
	}

	loader := config.ConfigLoader{}
	isStandalone := (env == collector.EnvStandalone)
	rules, err := loader.Load(configPath, isStandalone, logger)
	if err != nil {
		return nil, err
	}

	if len(rules) == 0 {
		return nil, nil
	}

	return ruleengine.NewRuleEngine(rules, dryRun, out, logger), nil
}

// logAnomalies writes triggered AnomalyEvents prominently as structured WARN / ALERT JSON.
func logAnomalies(out io.Writer, logger *slog.Logger, anomalies []engine.AnomalyEvent) {
	if len(anomalies) == 0 {
		return
	}

	for _, evt := range anomalies {
		if logger != nil {
			logger.Warn("ANOMALY DETECTED",
				"level", evt.Level,
				"status", evt.Status,
				"action", evt.Action,
				"container_id", evt.ContainerID,
				"container_name", evt.ContainerName,
				"cpu_percent", evt.CPUPercent,
				"cpu_throttled_periods", evt.CPUThrottledPeriods,
				"mem_percent", evt.MemPercent,
				"threshold", evt.Threshold,
				"cooldown_seconds", evt.CooldownSeconds,
			)
		}

		if out != nil {
			payload, err := json.MarshalIndent(evt, "", "  ")
			if err != nil {
				continue
			}
			_, _ = fmt.Fprintf(out, "\n=== [%s] ZEROPULSE ANOMALY EVENT (%s) ===\n%s\n==================================================\n",
				evt.Level, evt.Status, string(payload))
		}
	}
}

func envFloatOrDefault(key string, fallback float64) float64 {
	raw := os.Getenv(key)
	if raw == "" {
		return fallback
	}
	v, err := strconv.ParseFloat(raw, 64)
	if err != nil {
		return fallback
	}
	return v
}

func envDurationOrDefault(key string, fallback time.Duration) time.Duration {
	raw := os.Getenv(key)
	if raw == "" {
		return fallback
	}
	if d, err := time.ParseDuration(raw); err == nil {
		return d
	}
	if secs, err := strconv.Atoi(raw); err == nil {
		return time.Duration(secs) * time.Second
	}
	return fallback
}

func envStringOrDefault(key string, fallback string) string {
	raw := os.Getenv(key)
	if raw == "" {
		return fallback
	}
	return raw
}

func envBoolOrDefault(key string, fallback bool) bool {
	raw := os.Getenv(key)
	if raw == "" {
		return fallback
	}
	b, err := strconv.ParseBool(raw)
	if err != nil {
		return fallback
	}
	return b
}

// ────────────────────────────────────────────────────────────────────────────

func runDockerLoop(ctx context.Context, logger *slog.Logger, enc *json.Encoder, coreEngine *engine.Engine, customEngine *ruleengine.RuleEngine, srv *server.Server) {
	logger.Info("starting docker metrics loop", "interval", collectInterval)

	// Collect once immediately, then on every tick.
	collectAndPrintDocker(ctx, logger, enc, coreEngine, customEngine, srv)

	ticker := time.NewTicker(collectInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			collectAndPrintDocker(ctx, logger, enc, coreEngine, customEngine, srv)
		}
	}
}

func collectAndPrintDocker(ctx context.Context, logger *slog.Logger, enc *json.Encoder, coreEngine *engine.Engine, customEngine *ruleengine.RuleEngine, srv *server.Server) {
	snap, err := collector.CollectDockerMetrics(ctx)
	if err != nil {
		logger.Error("docker metrics collection failed", "error", err)
		return
	}
	logger.Info("docker snapshot collected", "containers", len(snap.Containers))
	if err := enc.Encode(snap); err != nil {
		logger.Error("json encode failed", "error", err)
	}

	var anomalies []engine.AnomalyEvent
	if coreEngine != nil {
		anomalies = coreEngine.Evaluate(*snap)
		logAnomalies(os.Stdout, logger, anomalies)
	}
	if customEngine != nil {
		customEngine.EvaluateDocker(snap)
	}

	if srv != nil {
		cards := make([]server.ContainerCard, 0, len(snap.Containers))
		var totalCPU float64
		var totalMemUsed uint64
		var totalMemLimit uint64

		anomMap := make(map[string]engine.AnomalyEvent)
		for _, a := range anomalies {
			anomMap[a.ContainerID] = a
		}

		var customBreaches map[string]string
		if customEngine != nil {
			customBreaches = customEngine.GetBreachedContainers()
		}

		for _, c := range snap.Containers {
			totalCPU += c.CPUPercent
			totalMemUsed += c.MemUsageBytes
			if c.MemLimitBytes > totalMemLimit {
				totalMemLimit = c.MemLimitBytes
			}

			health := "ok"
			if _, ok := anomMap[c.ContainerID]; ok {
				health = "critical"
			} else if customHealth, ok := customBreaches[c.ContainerID]; ok {
				health = customHealth
			} else if c.CPUPercent > 70.0 || c.MemPercent > 75.0 {
				health = "warning"
			}

			cards = append(cards, server.ContainerCard{
				ID:                  c.ContainerID,
				Name:                c.Name,
				Image:               c.Image,
				Status:              "running",
				CPUPercent:          c.CPUPercent,
				MemPercent:          c.MemPercent,
				MemUsageBytes:       c.MemUsageBytes,
				MemLimitBytes:       c.MemLimitBytes,
				CPUThrottledPeriods: c.CPUThrottledPeriods,
				CPUThrottledTimeNs:  c.CPUThrottledTimeNs,
				NetRxBytes:          c.NetRxBytes,
				NetTxBytes:          c.NetTxBytes,
				HealthStatus:        health,
			})
		}

		srv.PushMetrics(server.MetricsEventPayload{
			Timestamp: snap.CollectedAt,
			System: server.SystemOverview{
				Mode:                "docker",
				TotalContainers:     len(snap.Containers),
				RunningContainers:   len(snap.Containers),
				SystemCPUPercent:    totalCPU,
				SystemMemUsedBytes:  totalMemUsed,
				SystemMemTotalBytes: totalMemLimit,
			},
			Containers: cards,
		})

		for _, evt := range anomalies {
			dryRun := srv.IsDryRun()
			status := "TRIGGERED"
			if dryRun {
				status = "DRY_RUN_SKIPPED"
			}

			entry := server.AuditEntry{
				ID:               fmt.Sprintf("anom-%d", time.Now().UnixNano()),
				Timestamp:        evt.Timestamp,
				ContainerID:      evt.ContainerID,
				ContainerName:    evt.ContainerName,
				RuleName:         evt.Status,
				MetricType:       "RESOURCE",
				CurrentValue:     evt.CPUPercent,
				Threshold:        evt.Threshold,
				ConsecutiveCount: evt.WindowSize,
				Action:           evt.Action,
				DryRun:           dryRun,
				Status:           status,
				Message:          fmt.Sprintf("[%s] Container %s breached threshold (CPU: %.1f%%, Mem: %.1f%%)", evt.Status, evt.ContainerName, evt.CPUPercent, evt.MemPercent),
			}

			srv.PushAnomaly(entry)
		}
	}
}

// ────────────────────────────────────────────────────────────────────────────

func runStandaloneLoop(ctx context.Context, logger *slog.Logger, enc *json.Encoder, coreEngine *engine.Engine, customEngine *ruleengine.RuleEngine, srv *server.Server) {
	logger.Info("starting standalone metrics loop", "interval", collectInterval)

	collectAndPrintStandalone(logger, enc, coreEngine, customEngine, srv)

	ticker := time.NewTicker(collectInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			collectAndPrintStandalone(logger, enc, coreEngine, customEngine, srv)
		}
	}
}

func collectAndPrintStandalone(logger *slog.Logger, enc *json.Encoder, coreEngine *engine.Engine, customEngine *ruleengine.RuleEngine, srv *server.Server) {
	snap, err := collector.CollectStandalone()
	if err != nil {
		logger.Error("standalone collection failed", "error", err)
		return
	}
	logger.Info("standalone snapshot collected", "processes", len(snap.Processes))
	if err := enc.Encode(snap); err != nil {
		logger.Error("json encode failed", "error", err)
	}

	var anomalies []engine.AnomalyEvent
	if coreEngine != nil {
		anomalies = coreEngine.EvaluateStandalone(snap)
		logAnomalies(os.Stdout, logger, anomalies)
	}
	if customEngine != nil {
		customEngine.EvaluateStandalone(snap)
	}

	if srv != nil {
		var avgCPU float64
		if len(snap.CPU.UsagePercent) > 0 {
			for _, p := range snap.CPU.UsagePercent {
				avgCPU += p
			}
			avgCPU /= float64(len(snap.CPU.UsagePercent))
		}

		cards := make([]server.ContainerCard, 0, len(snap.Processes))
		for _, p := range snap.Processes {
			cards = append(cards, server.ContainerCard{
				ID:           fmt.Sprintf("%d", p.PID),
				Name:         p.Name,
				Image:        "host-process",
				Status:       p.Status,
				CPUPercent:   p.CPUPercent,
				MemPercent:   float64(p.MemPercent),
				HealthStatus: "ok",
			})
		}

		srv.PushMetrics(server.MetricsEventPayload{
			Timestamp: snap.CollectedAt,
			System: server.SystemOverview{
				Mode:                "standalone",
				TotalContainers:     len(snap.Processes),
				RunningContainers:   len(snap.Processes),
				SystemCPUPercent:    avgCPU,
				SystemMemUsedBytes:  snap.Memory.UsedBytes,
				SystemMemTotalBytes: snap.Memory.TotalBytes,
			},
			Containers: cards,
		})

		for _, evt := range anomalies {
			dryRun := srv.IsDryRun()
			status := "TRIGGERED"
			if dryRun {
				status = "DRY_RUN_SKIPPED"
			}
			entry := server.AuditEntry{
				ID:               fmt.Sprintf("anom-%d", time.Now().UnixNano()),
				Timestamp:        evt.Timestamp,
				ContainerID:      evt.ContainerID,
				ContainerName:    evt.ContainerName,
				RuleName:         evt.Status,
				MetricType:       "RESOURCE",
				CurrentValue:     evt.CPUPercent,
				Threshold:        evt.Threshold,
				ConsecutiveCount: evt.WindowSize,
				Action:           evt.Action,
				DryRun:           dryRun,
				Status:           status,
				Message:          fmt.Sprintf("[%s] Process %s breached threshold (CPU: %.1f%%)", evt.Status, evt.ContainerName, evt.CPUPercent),
			}
			srv.PushAnomaly(entry)
		}
	}
}
