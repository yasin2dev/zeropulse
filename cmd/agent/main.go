package main

import (
	"context"
	"encoding/json"
	"flag"
	"io"
	"log/slog"
	"os"
	"os/signal"
	"syscall"
	"time"

	"zeropulse-agent/internal/collector"
	"zeropulse-agent/internal/config"
	"zeropulse-agent/internal/ruleengine"
)

const collectInterval = 5 * time.Second

func main() {
	var (
		configPath string
		dryRun     bool
	)

	flag.StringVar(&configPath, "config", "", "Path to YAML or JSON rule configuration file")
	flag.BoolVar(&dryRun, "dry-run", false, "Run in dry-run mode (log actions without executing remediation)")
	flag.Parse()

	// Structured logger → stderr; JSON telemetry → stdout (stays clean).
	logger := slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{
		Level: slog.LevelInfo,
	}))

	env := collector.DetectEnvironment()
	logger.Info("environment detected", "type", string(env))

	engine, err := setupRuleEngine(configPath, dryRun, env, os.Stdout, logger)
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
		runDockerLoop(ctx, logger, encoder, engine)
	case collector.EnvStandalone:
		runStandaloneLoop(ctx, logger, encoder, engine)
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

// ────────────────────────────────────────────────────────────────────────────

func runDockerLoop(ctx context.Context, logger *slog.Logger, enc *json.Encoder, engine *ruleengine.RuleEngine) {
	logger.Info("starting docker metrics loop", "interval", collectInterval)

	// Collect once immediately, then on every tick.
	collectAndPrintDocker(ctx, logger, enc, engine)

	ticker := time.NewTicker(collectInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			collectAndPrintDocker(ctx, logger, enc, engine)
		}
	}
}

func collectAndPrintDocker(ctx context.Context, logger *slog.Logger, enc *json.Encoder, engine *ruleengine.RuleEngine) {
	snap, err := collector.CollectDockerMetrics(ctx)
	if err != nil {
		logger.Error("docker metrics collection failed", "error", err)
		return
	}
	logger.Info("docker snapshot collected", "containers", len(snap.Containers))
	if err := enc.Encode(snap); err != nil {
		logger.Error("json encode failed", "error", err)
	}
	if engine != nil {
		engine.EvaluateDocker(snap)
	}
}

// ────────────────────────────────────────────────────────────────────────────

func runStandaloneLoop(ctx context.Context, logger *slog.Logger, enc *json.Encoder, engine *ruleengine.RuleEngine) {
	logger.Info("starting standalone metrics loop", "interval", collectInterval)

	collectAndPrintStandalone(logger, enc, engine)

	ticker := time.NewTicker(collectInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			collectAndPrintStandalone(logger, enc, engine)
		}
	}
}

func collectAndPrintStandalone(logger *slog.Logger, enc *json.Encoder, engine *ruleengine.RuleEngine) {
	snap, err := collector.CollectStandalone()
	if err != nil {
		logger.Error("standalone collection failed", "error", err)
		return
	}
	logger.Info("standalone snapshot collected", "processes", len(snap.Processes))
	if err := enc.Encode(snap); err != nil {
		logger.Error("json encode failed", "error", err)
	}
	if engine != nil {
		engine.EvaluateStandalone(snap)
	}
}
