package ruleengine

import (
	"bytes"
	"encoding/json"
	"strings"
	"testing"
	"time"

	"zeropulse-agent/internal/collector"
	"zeropulse-agent/internal/config"
)

func TestEngineGTVsGTEBoundary(t *testing.T) {
	threshold := 80.0

	ruleGT := config.Rule{
		Name:               "rule-gt",
		MetricType:         config.MetricCPUPercent,
		Operator:           config.OperatorGT,
		Threshold:          threshold,
		ConsecutivePeriods: 1,
		Action:             config.ActionNotify,
	}

	ruleGTE := config.Rule{
		Name:               "rule-gte",
		MetricType:         config.MetricCPUPercent,
		Operator:           config.OperatorGTE,
		Threshold:          threshold,
		ConsecutivePeriods: 1,
		Action:             config.ActionNotify,
	}

	var out bytes.Buffer
	engine := NewRuleEngine([]config.Rule{ruleGT, ruleGTE}, true, &out, nil)

	snap := &collector.DockerMetricsSnapshot{
		Containers: []collector.ContainerMetrics{
			{
				ContainerID: "cid1",
				Name:        "cname1",
				CPUPercent:  threshold, // exact boundary
			},
		},
	}

	engine.EvaluateDocker(snap)

	gtCount := engine.state.counts[stateKey{RuleName: "rule-gt", ContainerID: "cid1"}]
	gteCount := engine.state.counts[stateKey{RuleName: "rule-gte", ContainerID: "cid1"}]

	if gtCount != 0 {
		t.Fatalf("expected GT not to breach on boundary value, got count=%d", gtCount)
	}
	if gteCount != 1 {
		t.Fatalf("expected GTE to breach on boundary value, got count=%d", gteCount)
	}
}

func TestEngineConsecutivePeriodsImmediateTrigger(t *testing.T) {
	rule := config.Rule{
		Name:               "immediate-rule",
		MetricType:         config.MetricCPUPercent,
		Operator:           config.OperatorGT,
		Threshold:          50.0,
		ConsecutivePeriods: 1,
		Action:             config.ActionNotify,
	}

	var out bytes.Buffer
	engine := NewRuleEngine([]config.Rule{rule}, true, &out, nil)

	snap := &collector.DockerMetricsSnapshot{
		Containers: []collector.ContainerMetrics{
			{
				ContainerID: "cid1",
				Name:        "cname1",
				CPUPercent:  60.0,
			},
		},
	}

	engine.EvaluateDocker(snap)

	if out.Len() == 0 {
		t.Fatalf("expected event emitted on first breach with ConsecutivePeriods=1")
	}

	var evt AnomalyEvent
	if err := json.Unmarshal(out.Bytes(), &evt); err != nil {
		t.Fatalf("failed to decode emitted event: %v", err)
	}
	if evt.ConsecutiveCount != 1 {
		t.Fatalf("expected ConsecutiveCount=1, got %d", evt.ConsecutiveCount)
	}
}

func TestEngineCooldownRetrigger(t *testing.T) {
	rule := config.Rule{
		Name:               "cooldown-rule",
		MetricType:         config.MetricCPUPercent,
		Operator:           config.OperatorGT,
		Threshold:          50.0,
		ConsecutivePeriods: 1,
		Action:             config.ActionNotify,
		CooldownSeconds:    60,
	}

	var out bytes.Buffer
	engine := NewRuleEngine([]config.Rule{rule}, true, &out, nil)

	fixedTime := time.Date(2025, 1, 1, 12, 0, 0, 0, time.UTC)
	engine.cooldown.now = func() time.Time { return fixedTime }

	snap := &collector.DockerMetricsSnapshot{
		Containers: []collector.ContainerMetrics{
			{
				ContainerID: "cid1",
				Name:        "cname1",
				CPUPercent:  70.0,
			},
		},
	}

	// 1st evaluation: should fire
	engine.EvaluateDocker(snap)
	if out.Len() == 0 {
		t.Fatalf("expected event emitted on first evaluation")
	}
	out.Reset()

	// 2nd evaluation within cooldown window (T + 30s): should not fire
	engine.cooldown.now = func() time.Time { return fixedTime.Add(30 * time.Second) }
	engine.EvaluateDocker(snap)
	if out.Len() != 0 {
		t.Fatalf("expected NO event emitted within cooldown window, got: %s", out.String())
	}
	out.Reset()

	// 3rd evaluation after cooldown expired (T + 61s): should fire
	engine.cooldown.now = func() time.Time { return fixedTime.Add(61 * time.Second) }
	engine.EvaluateDocker(snap)
	if out.Len() == 0 {
		t.Fatalf("expected event emitted after cooldown expiration")
	}
}

func TestEngineDryRunVsRemediationMode(t *testing.T) {
	rule := config.Rule{
		Name:               "mode-test-rule",
		MetricType:         config.MetricCPUPercent,
		Operator:           config.OperatorGT,
		Threshold:          50.0,
		ConsecutivePeriods: 1,
		Action:             config.ActionRestart,
	}

	snap := &collector.DockerMetricsSnapshot{
		Containers: []collector.ContainerMetrics{
			{
				ContainerID: "cid1",
				Name:        "cname1",
				CPUPercent:  75.0,
			},
		},
	}

	// DryRun = true
	var outDry bytes.Buffer
	engineDry := NewRuleEngine([]config.Rule{rule}, true, &outDry, nil)
	engineDry.EvaluateDocker(snap)

	var evtDry AnomalyEvent
	if err := json.Unmarshal(outDry.Bytes(), &evtDry); err != nil {
		t.Fatalf("failed to decode dry-run event: %v", err)
	}
	if !evtDry.DryRun {
		t.Fatalf("expected DryRun=true, got false")
	}
	if evtDry.Mode != "dry-run" {
		t.Fatalf("expected mode='dry-run', got %q", evtDry.Mode)
	}

	// DryRun = false (Remediation)
	var outRemediation bytes.Buffer
	engineRemediation := NewRuleEngine([]config.Rule{rule}, false, &outRemediation, nil)
	engineRemediation.EvaluateDocker(snap)

	var evtRem AnomalyEvent
	if err := json.Unmarshal(outRemediation.Bytes(), &evtRem); err != nil {
		t.Fatalf("failed to decode remediation event: %v", err)
	}
	if evtRem.DryRun {
		t.Fatalf("expected DryRun=false, got true")
	}
	if evtRem.Mode != "remediation" {
		t.Fatalf("expected mode='remediation', got %q", evtRem.Mode)
	}
}

func TestEngineStandaloneMode(t *testing.T) {
	rule := config.Rule{
		Name:               "standalone-rule",
		MetricType:         config.MetricMemPercent,
		Operator:           config.OperatorGTE,
		Threshold:          80.0,
		ConsecutivePeriods: 1,
		Action:             config.ActionNotify,
	}

	var out bytes.Buffer
	engine := NewRuleEngine([]config.Rule{rule}, true, &out, nil)
	expectedHostname := "srv-production-01"
	engine.hostname = func() (string, error) {
		return expectedHostname, nil
	}

	snap := &collector.StandaloneSnapshot{
		Memory: collector.MemStats{
			UsagePercent: 85.0, // breach
		},
	}

	engine.EvaluateStandalone(snap)

	if out.Len() == 0 {
		t.Fatalf("expected event emitted in standalone mode")
	}

	var evt AnomalyEvent
	line := strings.TrimSpace(out.String())
	if err := json.Unmarshal([]byte(line), &evt); err != nil {
		t.Fatalf("failed to unmarshal standalone event: %v", err)
	}

	if evt.ContainerID != "host" {
		t.Fatalf("expected ContainerID='host', got %q", evt.ContainerID)
	}
	if evt.ContainerName != expectedHostname {
		t.Fatalf("expected ContainerName=%q, got %q", expectedHostname, evt.ContainerName)
	}
	if evt.RuleName != "standalone-rule" {
		t.Fatalf("expected RuleName='standalone-rule', got %q", evt.RuleName)
	}
}
