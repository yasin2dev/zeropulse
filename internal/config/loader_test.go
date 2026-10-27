package config

import (
	"io"
	"log/slog"
	"os"
	"path/filepath"
	"testing"
)

// testLogger returns a silent logger suitable for unit tests.
func testLogger() *slog.Logger {
	return slog.New(slog.NewTextHandler(io.Discard, nil))
}

// validRuleYAML is a YAML snippet for a single valid rule.
const validRuleYAML = `rules:
  - name: "cpu-rule"
    metric_type: "CPU_PERCENT"
    operator: "GT"
    threshold: 50.0
    consecutive_periods: 3
    action: "NOTIFY"
    cooldown_seconds: 60
    container_filter: ""
`

// validRuleJSON is a JSON snippet for a single valid rule.
const validRuleJSON = `{"rules":[{"name":"cpu-rule","metric_type":"CPU_PERCENT","operator":"GT","threshold":50.0,"consecutive_periods":3,"action":"NOTIFY","cooldown_seconds":60,"container_filter":""}]}`

// writeTemp writes content to a temp file with the given extension and returns its path.
func writeTemp(t *testing.T, ext, content string) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), "config"+ext)
	if err := os.WriteFile(path, []byte(content), 0o600); err != nil {
		t.Fatalf("writeTemp: %v", err)
	}
	return path
}

// TestLoad_FileNotFound verifies that Load returns an error when the file does not exist.
// Validates: Requirements 7.3
func TestLoad_FileNotFound(t *testing.T) {
	loader := ConfigLoader{}
	_, err := loader.Load("/nonexistent/path/config.yaml", false, testLogger())
	if err == nil {
		t.Fatal("expected error for missing file, got nil")
	}
}

// TestLoad_InvalidYAML verifies that Load returns an error and no rules for malformed YAML.
// Validates: Requirements 7.4
func TestLoad_InvalidYAML(t *testing.T) {
	path := writeTemp(t, ".yaml", "rules: [invalid: yaml: :")
	loader := ConfigLoader{}
	rules, err := loader.Load(path, false, testLogger())
	if err == nil {
		t.Fatal("expected error for invalid YAML, got nil")
	}
	if len(rules) != 0 {
		t.Fatalf("expected 0 rules on parse error, got %d", len(rules))
	}
}

// TestLoad_ValidYAML verifies that Load correctly parses all valid rules from a YAML file.
// Validates: Requirements 7.5, 10.1
func TestLoad_ValidYAML(t *testing.T) {
	path := writeTemp(t, ".yaml", validRuleYAML)
	loader := ConfigLoader{}
	rules, err := loader.Load(path, false, testLogger())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(rules) != 1 {
		t.Fatalf("expected 1 rule, got %d", len(rules))
	}
	r := rules[0]
	if r.Name != "cpu-rule" {
		t.Errorf("expected name %q, got %q", "cpu-rule", r.Name)
	}
	if r.MetricType != MetricCPUPercent {
		t.Errorf("expected metric_type %q, got %q", MetricCPUPercent, r.MetricType)
	}
	if r.Operator != OperatorGT {
		t.Errorf("expected operator %q, got %q", OperatorGT, r.Operator)
	}
	if r.Threshold != 50.0 {
		t.Errorf("expected threshold 50.0, got %g", r.Threshold)
	}
	if r.ConsecutivePeriods != 3 {
		t.Errorf("expected consecutive_periods 3, got %d", r.ConsecutivePeriods)
	}
	if r.Action != ActionNotify {
		t.Errorf("expected action %q, got %q", ActionNotify, r.Action)
	}
	if r.CooldownSeconds != 60 {
		t.Errorf("expected cooldown_seconds 60, got %d", r.CooldownSeconds)
	}
}

// TestLoad_ValidJSON verifies that Load correctly parses all valid rules from a JSON file.
// Validates: Requirements 7.5, 10.2
func TestLoad_ValidJSON(t *testing.T) {
	path := writeTemp(t, ".json", validRuleJSON)
	loader := ConfigLoader{}
	rules, err := loader.Load(path, false, testLogger())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(rules) != 1 {
		t.Fatalf("expected 1 rule, got %d", len(rules))
	}
	r := rules[0]
	if r.Name != "cpu-rule" {
		t.Errorf("expected name %q, got %q", "cpu-rule", r.Name)
	}
	if r.MetricType != MetricCPUPercent {
		t.Errorf("expected metric_type %q, got %q", MetricCPUPercent, r.MetricType)
	}
}

// TestLoad_MixedRules verifies that Load skips invalid rules but returns the valid ones.
// Validates: Requirements 7.6, 10.5
func TestLoad_MixedRules(t *testing.T) {
	content := `rules:
  - name: "valid-rule"
    metric_type: "CPU_PERCENT"
    operator: "GT"
    threshold: 50.0
    consecutive_periods: 2
    action: "NOTIFY"
    cooldown_seconds: 30
    container_filter: ""
  - name: "invalid-rule"
    metric_type: "UNKNOWN_METRIC"
    operator: "GT"
    threshold: 10.0
    consecutive_periods: 1
    action: "NOTIFY"
    cooldown_seconds: 0
    container_filter: ""
  - name: "also-invalid"
    metric_type: "MEM_PERCENT"
    operator: "GTE"
    threshold: 80.0
    consecutive_periods: 0
    action: "RESTART"
    cooldown_seconds: 0
    container_filter: ""
`
	path := writeTemp(t, ".yaml", content)
	loader := ConfigLoader{}
	rules, err := loader.Load(path, false, testLogger())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(rules) != 1 {
		t.Fatalf("expected 1 valid rule, got %d", len(rules))
	}
	if rules[0].Name != "valid-rule" {
		t.Errorf("expected rule name %q, got %q", "valid-rule", rules[0].Name)
	}
}

// TestLoad_ZeroValidRules verifies that Load returns an empty (non-nil) slice and no error
// when all rules fail validation.
// Validates: Requirements 7.6, 10.5
func TestLoad_ZeroValidRules(t *testing.T) {
	content := `rules:
  - name: "bad-rule"
    metric_type: "UNKNOWN"
    operator: "GT"
    threshold: 50.0
    consecutive_periods: 1
    action: "NOTIFY"
    cooldown_seconds: 0
    container_filter: ""
`
	path := writeTemp(t, ".yaml", content)
	loader := ConfigLoader{}
	rules, err := loader.Load(path, false, testLogger())
	if err != nil {
		t.Fatalf("expected no error when all rules are invalid, got: %v", err)
	}
	if rules == nil {
		t.Fatal("expected non-nil slice, got nil")
	}
	if len(rules) != 0 {
		t.Fatalf("expected 0 rules, got %d", len(rules))
	}
}

// TestLoad_StandaloneFiltersUnsupportedMetrics verifies that standalone mode removes
// rules with unsupported metric types (CPU_THROTTLED_PERIODS, NET_RX_BYTES, NET_TX_BYTES).
// Validates: Requirements 7.6, 10.5
func TestLoad_StandaloneFiltersUnsupportedMetrics(t *testing.T) {
	content := `rules:
  - name: "cpu-ok"
    metric_type: "CPU_PERCENT"
    operator: "GT"
    threshold: 70.0
    consecutive_periods: 1
    action: "NOTIFY"
    cooldown_seconds: 0
    container_filter: ""
  - name: "throttle-unsupported"
    metric_type: "CPU_THROTTLED_PERIODS"
    operator: "GT"
    threshold: 10.0
    consecutive_periods: 1
    action: "NOTIFY"
    cooldown_seconds: 0
    container_filter: ""
  - name: "net-rx-unsupported"
    metric_type: "NET_RX_BYTES"
    operator: "GT"
    threshold: 1000.0
    consecutive_periods: 1
    action: "NOTIFY"
    cooldown_seconds: 0
    container_filter: ""
`
	path := writeTemp(t, ".yaml", content)
	loader := ConfigLoader{}
	rules, err := loader.Load(path, true, testLogger())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(rules) != 1 {
		t.Fatalf("expected 1 rule after standalone filtering, got %d", len(rules))
	}
	if rules[0].Name != "cpu-ok" {
		t.Errorf("expected rule %q, got %q", "cpu-ok", rules[0].Name)
	}
}

func TestResolveConfigPath(t *testing.T) {
	// 1. Explicit CLI flag takes priority
	got := ResolveConfigPath("/path/to/cli.yaml", "/path/to/env.yaml")
	if got != "/path/to/cli.yaml" {
		t.Errorf("expected cli path, got %q", got)
	}

	// 2. Env path takes priority if CLI path is empty
	got = ResolveConfigPath("", "/path/to/env.yaml")
	if got != "/path/to/env.yaml" {
		t.Errorf("expected env path, got %q", got)
	}

	// 3. Defaults checked in order when CLI and Env are empty
	tmpDir := t.TempDir()
	candidate1 := filepath.Join(tmpDir, "does-not-exist.yaml")
	candidate2 := filepath.Join(tmpDir, "second.yaml")
	candidate3 := filepath.Join(tmpDir, "third.yaml")

	if err := os.WriteFile(candidate2, []byte("rules: []"), 0644); err != nil {
		t.Fatalf("failed to create test file: %v", err)
	}

	got = ResolveConfigPath("", "", candidate1, candidate2, candidate3)
	if got != candidate2 {
		t.Errorf("expected second candidate, got %q", got)
	}

	// 4. Returns empty string if no candidate exists
	got = ResolveConfigPath("", "", candidate1, candidate3)
	if got != "" {
		t.Errorf("expected empty string when no files exist, got %q", got)
	}
}

func TestSave_YAMLAndJSON(t *testing.T) {
	tmpDir := t.TempDir()
	loader := ConfigLoader{}

	sampleRules := []Rule{
		{
			Name:               "cpu-high",
			MetricType:         MetricCPUPercent,
			Operator:           OperatorGT,
			Threshold:          80.0,
			ConsecutivePeriods: 3,
			Action:             ActionRestart,
			CooldownSeconds:    60,
			ContainerFilter:    "web",
		},
		{
			Name:               "mem-high",
			MetricType:         MetricMemPercent,
			Operator:           OperatorGTE,
			Threshold:          90.0,
			ConsecutivePeriods: 1,
			Action:             ActionNotify,
			CooldownSeconds:    30,
			ContainerFilter:    "",
		},
	}

	// 1. Save as YAML and reload
	yamlPath := filepath.Join(tmpDir, "rules.yaml")
	if err := loader.Save(yamlPath, sampleRules); err != nil {
		t.Fatalf("Save YAML failed: %v", err)
	}
	loadedYAML, err := loader.Load(yamlPath, false, testLogger())
	if err != nil {
		t.Fatalf("Load saved YAML failed: %v", err)
	}
	if len(loadedYAML) != 2 {
		t.Fatalf("expected 2 rules in YAML, got %d", len(loadedYAML))
	}
	if loadedYAML[0].Name != "cpu-high" || loadedYAML[1].Action != ActionNotify {
		t.Errorf("loaded YAML rule data mismatch: %+v", loadedYAML)
	}

	// 2. Save as JSON and reload
	jsonPath := filepath.Join(tmpDir, "rules.json")
	if err := loader.Save(jsonPath, sampleRules); err != nil {
		t.Fatalf("Save JSON failed: %v", err)
	}
	loadedJSON, err := loader.Load(jsonPath, false, testLogger())
	if err != nil {
		t.Fatalf("Load saved JSON failed: %v", err)
	}
	if len(loadedJSON) != 2 {
		t.Fatalf("expected 2 rules in JSON, got %d", len(loadedJSON))
	}
	if loadedJSON[0].Threshold != 80.0 || loadedJSON[1].Name != "mem-high" {
		t.Errorf("loaded JSON rule data mismatch: %+v", loadedJSON)
	}

	// 3. Validation failure prevents saving
	invalidRules := []Rule{
		{
			Name:       "bad-rule",
			MetricType: "INVALID_METRIC",
		},
	}
	if err := loader.Save(filepath.Join(tmpDir, "invalid.yaml"), invalidRules); err == nil {
		t.Fatal("expected error saving invalid rule, got nil")
	}
}

