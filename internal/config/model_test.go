package config

import (
	"testing"

	"pgregory.net/rapid"
)

// baseValidRule returns a Rule that passes Validate() without modification.
func baseValidRule() Rule {
	return Rule{
		Name:               "test-rule",
		MetricType:         MetricCPUPercent,
		Operator:           OperatorGT,
		Threshold:          50.0,
		ConsecutivePeriods: 3,
		Action:             ActionNotify,
		CooldownSeconds:    60,
		ContainerFilter:    "",
	}
}

// Feature: rule-engine-and-anomaly-detection, Property 1: For any Rule where ConsecutivePeriods < 1, Rule.Validate() SHALL return a non-nil error
func TestValidateConsecutivePeriodsInvalid(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		rule := baseValidRule()
		rule.ConsecutivePeriods = rapid.Int().Filter(func(v int) bool { return v < 1 }).Draw(t, "consecutive_periods")
		if err := rule.Validate(); err == nil {
			t.Fatalf("expected error for ConsecutivePeriods=%d, got nil", rule.ConsecutivePeriods)
		}
	})
}

// Feature: rule-engine-and-anomaly-detection, Property 2: For any Rule where CooldownSeconds < 0, Rule.Validate() SHALL return a non-nil error
func TestValidateCooldownSecondsNegative(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		rule := baseValidRule()
		rule.CooldownSeconds = rapid.Int().Filter(func(v int) bool { return v < 0 }).Draw(t, "cooldown_seconds")
		if err := rule.Validate(); err == nil {
			t.Fatalf("expected error for CooldownSeconds=%d, got nil", rule.CooldownSeconds)
		}
	})
}

// Feature: rule-engine-and-anomaly-detection, Property 3: For any Rule where Threshold < 0, Rule.Validate() SHALL return a non-nil error
func TestValidateThresholdNegative(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		rule := baseValidRule()
		rule.Threshold = rapid.Float64().Filter(func(v float64) bool { return v < 0 }).Draw(t, "threshold")
		if err := rule.Validate(); err == nil {
			t.Fatalf("expected error for Threshold=%g, got nil", rule.Threshold)
		}
	})
}

// Feature: rule-engine-and-anomaly-detection, Property 14: For any Rule where MetricType is not one of the five defined values, Rule.Validate() SHALL return a non-nil error
func TestUnknownMetricTypeValidation(t *testing.T) {
	knownTypes := map[string]struct{}{
		string(MetricCPUPercent):          {},
		string(MetricMemPercent):          {},
		string(MetricCPUThrottledPeriods): {},
		string(MetricNetRxBytes):          {},
		string(MetricNetTxBytes):          {},
	}

	rapid.Check(t, func(t *rapid.T) {
		rule := baseValidRule()
		unknown := rapid.String().Filter(func(v string) bool {
			_, known := knownTypes[v]
			return !known
		}).Draw(t, "metric_type")
		rule.MetricType = MetricType(unknown)
		if err := rule.Validate(); err == nil {
			t.Fatalf("expected error for MetricType=%q, got nil", rule.MetricType)
		}
	})
}

func TestRestartRuleRequiresContainerFilter(t *testing.T) {
	rule := Rule{
		Name:               "restart-rule",
		MetricType:         MetricMemPercent,
		Operator:           OperatorGT,
		Threshold:          90,
		ConsecutivePeriods: 3,
		Action:             ActionRestart,
	}

	for _, filter := range []string{"", "   "} {
		rule.ContainerFilter = filter
		if err := rule.Validate(); err == nil {
			t.Errorf("expected error for RESTART rule with filter %q", filter)
		}
	}

	rule.ContainerFilter = "api-server"
	if err := rule.Validate(); err != nil {
		t.Errorf("expected targeted RESTART rule to be valid: %v", err)
	}

	rule.Action = ActionNotify
	rule.ContainerFilter = ""
	if err := rule.Validate(); err != nil {
		t.Errorf("expected NOTIFY rule without filter to be valid: %v", err)
	}
}

func TestScaleActionIsRejectedUntilImplemented(t *testing.T) {
	rule := Rule{
		Name:               "scale-rule",
		MetricType:         MetricCPUPercent,
		Operator:           OperatorGT,
		Threshold:          90,
		ConsecutivePeriods: 3,
		Action:             "SCALE",
	}
	if err := rule.Validate(); err == nil {
		t.Error("expected SCALE to be rejected because no code executes it")
	}
}
