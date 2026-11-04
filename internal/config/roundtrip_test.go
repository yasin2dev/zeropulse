// Feature: rule-engine-and-anomaly-detection, Property 15: For any valid []Rule value, serializing to YAML and then parsing back SHALL produce a []Rule that is element-wise equivalent to the original.

package config

import (
	"reflect"
	"testing"

	"gopkg.in/yaml.v3"
	"pgregory.net/rapid"
)

// TestConfigRoundTripYAML verifies that any valid []Rule survives a YAML
// serialization/deserialization cycle without data loss or mutation.
//
// Validates: Requirements 10.3, 10.4
func TestConfigRoundTripYAML(t *testing.T) {
	// Known valid enum values for generators.
	metricTypes := []MetricType{
		MetricCPUPercent,
		MetricMemPercent,
		MetricCPUThrottledPeriods,
		MetricNetRxBytes,
		MetricNetTxBytes,
	}
	operators := []Operator{OperatorGT, OperatorGTE}
	actions := []Action{ActionRestart, ActionNotify}

	rapid.Check(t, func(t *rapid.T) {
		// Generate a slice of 1–10 valid rules.
		numRules := rapid.IntRange(1, 10).Draw(t, "num_rules")
		rules := make([]Rule, numRules)

		for i := range rules {
			name := rapid.StringMatching(`[a-zA-Z][a-zA-Z0-9_-]{0,19}`).Draw(t, "name")
			rules[i] = Rule{
				Name:               name,
				MetricType:         rapid.SampledFrom(metricTypes).Draw(t, "metric_type"),
				Operator:           rapid.SampledFrom(operators).Draw(t, "operator"),
				Threshold:          rapid.Float64Range(0, 1e9).Draw(t, "threshold"),
				ConsecutivePeriods: rapid.IntRange(1, 100).Draw(t, "consecutive_periods"),
				Action:             rapid.SampledFrom(actions).Draw(t, "action"),
				CooldownSeconds:    rapid.IntRange(0, 3600).Draw(t, "cooldown_seconds"),
				ContainerFilter:    rapid.StringMatching(`[a-zA-Z0-9_./-]{0,40}`).Draw(t, "container_filter"),
			}
		}

		// Serialize to YAML.
		data, err := yaml.Marshal(rawConfig{Rules: rules})
		if err != nil {
			t.Fatalf("yaml.Marshal failed: %v", err)
		}

		// Parse back from YAML.
		var parsed rawConfig
		if err := yaml.Unmarshal(data, &parsed); err != nil {
			t.Fatalf("yaml.Unmarshal failed: %v", err)
		}

		// Element-wise equivalence check.
		if len(parsed.Rules) != len(rules) {
			t.Fatalf("rule count mismatch: got %d, want %d", len(parsed.Rules), len(rules))
		}
		for i := range rules {
			if !reflect.DeepEqual(parsed.Rules[i], rules[i]) {
				t.Fatalf("rule[%d] mismatch after round-trip:\n  original: %+v\n  parsed:   %+v",
					i, rules[i], parsed.Rules[i])
			}
		}
	})
}
