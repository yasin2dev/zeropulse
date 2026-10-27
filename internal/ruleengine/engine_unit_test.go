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

func TestRuleEngine_DynamicRuleManagement(t *testing.T) {
	initialRule := config.Rule{
		Name:               "rule-1",
		MetricType:         config.MetricCPUPercent,
		Operator:           config.OperatorGT,
		Threshold:          50.0,
		ConsecutivePeriods: 1,
		Action:             config.ActionNotify,
	}

	engine := NewRuleEngine([]config.Rule{initialRule}, true, nil, nil)

	// 1. Check initial rules
	rules := engine.Rules()
	if len(rules) != 1 || rules[0].Name != "rule-1" {
		t.Fatalf("expected 1 rule with name 'rule-1', got %v", rules)
	}

	// 2. Add new valid rule
	newRule := config.Rule{
		Name:               "rule-2",
		MetricType:         config.MetricMemPercent,
		Operator:           config.OperatorGTE,
		Threshold:          80.0,
		ConsecutivePeriods: 2,
		Action:             config.ActionRestart,
	}
	if err := engine.AddRule(newRule); err != nil {
		t.Fatalf("AddRule failed: %v", err)
	}
	if len(engine.Rules()) != 2 {
		t.Fatalf("expected 2 rules, got %d", len(engine.Rules()))
	}

	// 3. Reject duplicate rule name
	if err := engine.AddRule(newRule); err == nil {
		t.Fatalf("expected error for duplicate rule name, got nil")
	}

	// 4. Reject invalid rule
	badRule := config.Rule{
		Name:       "bad",
		MetricType: "INVALID",
	}
	if err := engine.AddRule(badRule); err == nil {
		t.Fatalf("expected error for invalid rule, got nil")
	}

	// 5. Delete existing rule
	if !engine.DeleteRule("rule-1") {
		t.Fatalf("expected DeleteRule to return true for 'rule-1'")
	}
	if len(engine.Rules()) != 1 || engine.Rules()[0].Name != "rule-2" {
		t.Fatalf("expected 1 rule left ('rule-2'), got %v", engine.Rules())
	}

	// 6. Delete non-existent rule
	if engine.DeleteRule("non-existent") {
		t.Fatalf("expected DeleteRule to return false for non-existent rule")
	}

	// 7. SetRules replaces entire list
	replacementRules := []config.Rule{
		{
			Name:               "new-rule-a",
			MetricType:         config.MetricCPUPercent,
			Operator:           config.OperatorGT,
			Threshold:          90.0,
			ConsecutivePeriods: 1,
			Action:             config.ActionNotify,
		},
	}
	if err := engine.SetRules(replacementRules); err != nil {
		t.Fatalf("SetRules failed: %v", err)
	}
	if len(engine.Rules()) != 1 || engine.Rules()[0].Name != "new-rule-a" {
		t.Fatalf("SetRules did not correctly replace rules: %v", engine.Rules())
	}
}

func TestRuleEngine_SetAnomalyHandler(t *testing.T) {
	rule := config.Rule{
		Name:               "alert-rule",
		MetricType:         config.MetricCPUPercent,
		Operator:           config.OperatorGT,
		Threshold:          50.0,
		ConsecutivePeriods: 1,
		Action:             config.ActionNotify,
	}

	var out bytes.Buffer
	engine := NewRuleEngine([]config.Rule{rule}, true, &out, nil)

	var receivedEvt *AnomalyEvent
	engine.SetAnomalyHandler(func(evt AnomalyEvent) {
		receivedEvt = &evt
	})

	snap := &collector.DockerMetricsSnapshot{
		Containers: []collector.ContainerMetrics{
			{
				ContainerID: "cid-handler",
				Name:        "cname-handler",
				CPUPercent:  75.0, // breach
			},
		},
	}

	engine.EvaluateDocker(snap)

	if receivedEvt == nil {
		t.Fatalf("expected onAnomaly handler to be invoked, but received nil")
	}
	if receivedEvt.ContainerID != "cid-handler" || receivedEvt.RuleName != "alert-rule" {
		t.Fatalf("handler received incorrect event: %+v", receivedEvt)
	}
}

func TestRuleEngine_ConcurrentAccess(t *testing.T) {
	engine := NewRuleEngine([]config.Rule{}, true, nil, nil)

	snap := &collector.DockerMetricsSnapshot{
		Containers: []collector.ContainerMetrics{
			{
				ContainerID: "cid-conc",
				Name:        "cname-conc",
				CPUPercent:  60.0,
			},
		},
	}

	done := make(chan bool)

	// Goroutine 1: Continuous evaluation
	go func() {
		for i := 0; i < 50; i++ {
			engine.EvaluateDocker(snap)
			time.Sleep(1 * time.Millisecond)
		}
		done <- true
	}()

	// Goroutine 2: Dynamic Add / Delete rules
	go func() {
		for i := 0; i < 50; i++ {
			_ = engine.AddRule(config.Rule{
				Name:               "rule-dyn",
				MetricType:         config.MetricCPUPercent,
				Operator:           config.OperatorGT,
				Threshold:          50.0,
				ConsecutivePeriods: 1,
				Action:             config.ActionNotify,
			})
			_ = engine.Rules()
			engine.SetDryRun(i%2 == 0)
			_ = engine.DeleteRule("rule-dyn")
			time.Sleep(1 * time.Millisecond)
		}
		done <- true
	}()

	<-done
	<-done
}

