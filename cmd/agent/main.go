package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"log/slog"
	"os"
	"os/signal"
	"strconv"
	"syscall"
	"time"

	"zeropulse-agent/internal/collector"
	"zeropulse-agent/internal/config"
	"zeropulse-agent/internal/engine"
	"zeropulse-agent/internal/ruleengine"
)

const collectInterval = 5 * time.Second

func main() {
	var (
		configPath   string
		dryRun       bool
		cpuThreshold float64
		memThreshold float64
		cooldown     time.Duration
	)

	defaultCPU := envFloatOrDefault("ZEROPULSE_CPU_THRESHOLD", engine.DefaultCPUThreshold)
	defaultMem := envFloatOrDefault("ZEROPULSE_MEM_THRESHOLD", engine.DefaultMemThreshold)
	defaultCooldown := envDurationOrDefault("ZEROPULSE_COOLDOWN", engine.DefaultCooldown)

	flag.StringVar(&configPath, "config", "", "Path to YAML or JSON rule configuration file")
	flag.BoolVar(&dryRun, "dry-run", false, "Run in dry-run mode (log actions without executing remediation)")
	flag.Float64Var(&cpuThreshold, "cpu-threshold", defaultCPU, "CPU saturation threshold percentage (e.g. 80.0, or 0.5 for testing)")
	flag.Float64Var(&memThreshold, "mem-threshold", defaultMem, "Memory critical threshold percentage (default 85.0)")
	flag.DurationVar(&cooldown, "cooldown", defaultCooldown, "Per-container anomaly cooldown duration (default 60s)")
	flag.Parse()

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

	customRuleEngine, err := setupRuleEngine(configPath, dryRun, env, os.Stdout, logger)
	if err != nil {
		logger.Error("configuration initialization failed", "error", err)
		os.Exit(1)
	}

	// Graceful shutdown on SIGINT / SIGTERM.
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	encoder := json.NewEncoder(os.Stdout)
	encoder.SetIndent("", "  ")

	switch env {
	case collector.EnvDocker:
		runDockerLoop(ctx, logger, encoder, coreEngine, customRuleEngine)
	case collector.EnvStandalone:
		runStandaloneLoop(ctx, logger, encoder, coreEngine, customRuleEngine)
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

// ────────────────────────────────────────────────────────────────────────────

func runDockerLoop(ctx context.Context, logger *slog.Logger, enc *json.Encoder, coreEngine *engine.Engine, customEngine *ruleengine.RuleEngine) {
	logger.Info("starting docker metrics loop", "interval", collectInterval)

	// Collect once immediately, then on every tick.
	collectAndPrintDocker(ctx, logger, enc, coreEngine, customEngine)

	ticker := time.NewTicker(collectInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			collectAndPrintDocker(ctx, logger, enc, coreEngine, customEngine)
		}
	}
}

func collectAndPrintDocker(ctx context.Context, logger *slog.Logger, enc *json.Encoder, coreEngine *engine.Engine, customEngine *ruleengine.RuleEngine) {
	snap, err := collector.CollectDockerMetrics(ctx)
	if err != nil {
		logger.Error("docker metrics collection failed", "error", err)
		return
	}
	logger.Info("docker snapshot collected", "containers", len(snap.Containers))
	if err := enc.Encode(snap); err != nil {
		logger.Error("json encode failed", "error", err)
	}
	if coreEngine != nil {
		anomalies := coreEngine.Evaluate(*snap)
		logAnomalies(os.Stdout, logger, anomalies)
	}
	if customEngine != nil {
		customEngine.EvaluateDocker(snap)
	}
}

// ────────────────────────────────────────────────────────────────────────────

func runStandaloneLoop(ctx context.Context, logger *slog.Logger, enc *json.Encoder, coreEngine *engine.Engine, customEngine *ruleengine.RuleEngine) {
	logger.Info("starting standalone metrics loop", "interval", collectInterval)

	collectAndPrintStandalone(logger, enc, coreEngine, customEngine)

	ticker := time.NewTicker(collectInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			collectAndPrintStandalone(logger, enc, coreEngine, customEngine)
		}
	}
}

func collectAndPrintStandalone(logger *slog.Logger, enc *json.Encoder, coreEngine *engine.Engine, customEngine *ruleengine.RuleEngine) {
	snap, err := collector.CollectStandalone()
	if err != nil {
		logger.Error("standalone collection failed", "error", err)
		return
	}
	logger.Info("standalone snapshot collected", "processes", len(snap.Processes))
	if err := enc.Encode(snap); err != nil {
		logger.Error("json encode failed", "error", err)
	}
	if coreEngine != nil {
		anomalies := coreEngine.EvaluateStandalone(snap)
		logAnomalies(os.Stdout, logger, anomalies)
	}
	if customEngine != nil {
		customEngine.EvaluateStandalone(snap)
	}
}
