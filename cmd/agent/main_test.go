package main

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"zeropulse-agent/internal/collector"
	"zeropulse-agent/internal/ruleengine"
)

func TestSetupRuleEngineNoConfig(t *testing.T) {
	engine, err := setupRuleEngine("", false, collector.EnvDocker, nil, nil)
	if err != nil {
		t.Fatalf("unexpected error when config is empty: %v", err)
	}
	if engine != nil {
		t.Fatalf("expected nil engine when config path is empty")
	}
}

func TestSetupRuleEngineFileNotFound(t *testing.T) {
	_, err := setupRuleEngine("non_existent_file.yaml", false, collector.EnvDocker, nil, nil)
	if err == nil {
		t.Fatalf("expected error for non-existent config file, got nil")
	}
}

func TestSetupRuleEngineDryRunAndEventProduction(t *testing.T) {
	// Create temporary rules config
	tmpDir := t.TempDir()
	configPath := filepath.Join(tmpDir, "rules.yaml")
	configContent := `
rules:
  - name: "cpu-high-alert"
    metric_type: "CPU_PERCENT"
    operator: "GT"
    threshold: 50.0
    consecutive_periods: 1
    action: "NOTIFY"
    cooldown_seconds: 0
`
	if err := os.WriteFile(configPath, []byte(configContent), 0644); err != nil {
		t.Fatalf("failed to write temp config: %v", err)
	}

	// Test dry-run = true
	var outDry bytes.Buffer
	engineDry, err := setupRuleEngine(configPath, true, collector.EnvDocker, &outDry, nil)
	if err != nil {
		t.Fatalf("failed to setup rule engine with dry-run: %v", err)
	}
	if engineDry == nil {
		t.Fatalf("expected non-nil engineDry")
	}

	snapDocker := &collector.DockerMetricsSnapshot{
		Containers: []collector.ContainerMetrics{
			{
				ContainerID: "cid_123",
				Name:        "web-app",
				CPUPercent:  75.0, // breach
			},
		},
	}

	engineDry.EvaluateDocker(snapDocker)

	if outDry.Len() == 0 {
		t.Fatalf("expected anomaly event emitted in dry-run mode")
	}

	var evtDry ruleengine.AnomalyEvent
	if err := json.Unmarshal(outDry.Bytes(), &evtDry); err != nil {
		t.Fatalf("failed to decode dry-run anomaly event: %v", err)
	}
	if !evtDry.DryRun {
		t.Fatalf("expected DryRun=true, got false")
	}
	if evtDry.Mode != "dry-run" {
		t.Fatalf("expected Mode='dry-run', got %q", evtDry.Mode)
	}
	if evtDry.ContainerID != "cid_123" {
		t.Fatalf("expected ContainerID='cid_123', got %q", evtDry.ContainerID)
	}
}

func TestSetupRuleEngineStandaloneIntegration(t *testing.T) {
	tmpDir := t.TempDir()
	configPath := filepath.Join(tmpDir, "standalone-rules.yaml")
	configContent := `
rules:
  - name: "mem-high-alert"
    metric_type: "MEM_PERCENT"
    operator: "GTE"
    threshold: 60.0
    consecutive_periods: 1
    action: "NOTIFY"
    cooldown_seconds: 0
`
	if err := os.WriteFile(configPath, []byte(configContent), 0644); err != nil {
		t.Fatalf("failed to write temp config: %v", err)
	}

	var outStandalone bytes.Buffer
	engine, err := setupRuleEngine(configPath, false, collector.EnvStandalone, &outStandalone, nil)
	if err != nil {
		t.Fatalf("failed to setup rule engine for standalone: %v", err)
	}
	if engine == nil {
		t.Fatalf("expected non-nil engine")
	}

	snapStandalone := &collector.StandaloneSnapshot{
		Memory: collector.MemStats{
			UsagePercent: 80.0, // breach
		},
	}

	engine.EvaluateStandalone(snapStandalone)

	if outStandalone.Len() == 0 {
		t.Fatalf("expected anomaly event emitted in standalone mode")
	}

	var evt ruleengine.AnomalyEvent
	line := strings.TrimSpace(outStandalone.String())
	if err := json.Unmarshal([]byte(line), &evt); err != nil {
		t.Fatalf("failed to decode standalone anomaly event: %v", err)
	}

	if evt.ContainerID != "host" {
		t.Fatalf("expected ContainerID='host', got %q", evt.ContainerID)
	}
	if evt.DryRun {
		t.Fatalf("expected DryRun=false in remediation mode, got true")
	}
	if evt.Mode != "remediation" {
		t.Fatalf("expected Mode='remediation', got %q", evt.Mode)
	}
}
