package ruleengine

import (
	"bytes"
	"fmt"
	"testing"

	"pgregory.net/rapid"
	"zeropulse-agent/internal/collector"
	"zeropulse-agent/internal/config"
)

// Feature: rule-engine-and-anomaly-detection, Property 4: For any container name and any Rule, if the rule's ContainerFilter is empty, the rule SHALL apply to that container. If ContainerFilter is non-empty, the rule SHALL apply only if the container name equals the filter value.
//
// Validates: Requirements 1.5, 1.6
func TestContainerFilterMatching(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		containerName := rapid.StringMatching(`[a-zA-Z0-9_-]{1,16}`).Draw(t, "containerName")
		containerID := rapid.StringMatching(`[a-f0-9]{12}`).Draw(t, "containerID")

		filterMode := rapid.IntRange(0, 2).Draw(t, "filterMode")
		var filter string
		switch filterMode {
		case 0:
			filter = "" // empty filter -> always matches
		case 1:
			filter = containerName // exact match
		case 2:
			filter = containerName + "_diff" // non-matching
		}

		rule := config.Rule{
			Name:               "filter-rule",
			MetricType:         config.MetricCPUPercent,
			Operator:           config.OperatorGTE,
			Threshold:          50.0,
			ConsecutivePeriods: 1,
			Action:             config.ActionNotify,
			CooldownSeconds:    0,
			ContainerFilter:    filter,
		}

		var out bytes.Buffer
		engine := NewRuleEngine([]config.Rule{rule}, true, &out, nil)

		snap := &collector.DockerMetricsSnapshot{
			Containers: []collector.ContainerMetrics{
				{
					ContainerID: containerID,
					Name:        containerName,
					CPUPercent:  80.0, // causes breach
				},
			},
		}

		engine.EvaluateDocker(snap)

		key := stateKey{RuleName: rule.Name, ContainerID: containerID}
		count := engine.state.counts[key]

		if filter == "" || filter == containerName {
			// Rule applies: should have evaluated and recorded breach
			if count != 1 {
				t.Fatalf("expected rule to apply (count=1), got count=%d (filter=%q, name=%q)", count, filter, containerName)
			}
			if out.Len() == 0 {
				t.Fatalf("expected AnomalyEvent to be emitted")
			}
		} else {
			// Rule does not apply
			if count != 0 {
				t.Fatalf("expected rule not to apply (count=0), got count=%d (filter=%q, name=%q)", count, filter, containerName)
			}
			if out.Len() != 0 {
				t.Fatalf("expected no event emitted for non-matching container filter")
			}
		}
	})
}

// Feature: rule-engine-and-anomaly-detection, Property 11: For any DockerMetricsSnapshot with N containers and M rules, EvaluateDocker SHALL evaluate all N × M (rule, container) combinations (subject to ContainerFilter).
//
// Validates: Requirements 5.1
func TestEvaluateAllCombinations(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		numContainers := rapid.IntRange(1, 6).Draw(t, "numContainers")
		numRules := rapid.IntRange(1, 6).Draw(t, "numRules")

		var containers []collector.ContainerMetrics
		for i := 0; i < numContainers; i++ {
			cID := fmt.Sprintf("cid_%04d", i)
			cName := fmt.Sprintf("cname_%04d", i)
			containers = append(containers, collector.ContainerMetrics{
				ContainerID: cID,
				Name:        cName,
				CPUPercent:  75.0,
			})
		}

		var rules []config.Rule
		for j := 0; j < numRules; j++ {
			rules = append(rules, config.Rule{
				Name:               fmt.Sprintf("rule_%04d", j),
				MetricType:         config.MetricCPUPercent,
				Operator:           config.OperatorGTE,
				Threshold:          50.0,
				ConsecutivePeriods: 1,
				Action:             config.ActionNotify,
				CooldownSeconds:    0,
				ContainerFilter:    "", // applies to all containers
			})
		}

		var out bytes.Buffer
		engine := NewRuleEngine(rules, true, &out, nil)

		snap := &collector.DockerMetricsSnapshot{
			Containers: containers,
		}

		engine.EvaluateDocker(snap)

		// Every (rule, container) pair must have an entry in state.counts
		for _, c := range containers {
			for _, r := range rules {
				key := stateKey{RuleName: r.Name, ContainerID: c.ContainerID}
				if val, exists := engine.state.counts[key]; !exists || val != 1 {
					t.Fatalf("combination (rule=%s, container=%s) was not evaluated: val=%d, exists=%v",
						r.Name, c.ContainerID, val, exists)
				}
			}
		}
	})
}

// Feature: rule-engine-and-anomaly-detection, Property 12: For any evaluation cycle where one rule's evaluation causes a panic, all remaining rules SHALL still be evaluated and their results processed normally.
//
// Validates: Requirements 5.4
func TestPanicIsolation(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		numRules := rapid.IntRange(2, 6).Draw(t, "numRules")
		panicIndex := rapid.IntRange(0, numRules-1).Draw(t, "panicIndex")

		var rules []config.Rule
		for i := 0; i < numRules; i++ {
			rules = append(rules, config.Rule{
				Name:               fmt.Sprintf("rule_%d", i),
				MetricType:         config.MetricCPUPercent,
				Operator:           config.OperatorGTE,
				Threshold:          50.0,
				ConsecutivePeriods: 1,
				Action:             config.ActionNotify,
				CooldownSeconds:    0,
			})
		}

		containerID := "test_container_1"
		snap := &collector.DockerMetricsSnapshot{
			Containers: []collector.ContainerMetrics{
				{
					ContainerID: containerID,
					Name:        "c1",
					CPUPercent:  90.0,
				},
			},
		}

		var out bytes.Buffer
		engine := NewRuleEngine(rules, true, &out, nil)

		panickingRuleName := rules[panicIndex].Name
		engine.evalHook = func(r config.Rule, c collector.ContainerMetrics) {
			if r.Name == panickingRuleName {
				panic("simulated rule failure")
			}
		}

		// EvaluateDocker must not panic outwards
		engine.EvaluateDocker(snap)

		// Every rule EXCEPT the panicking rule must have been evaluated
		for i, r := range rules {
			key := stateKey{RuleName: r.Name, ContainerID: containerID}
			if i == panicIndex {
				// Panicked before recording count
				if engine.state.counts[key] != 0 {
					t.Fatalf("panicking rule %s should not have recorded breach count", r.Name)
				}
			} else {
				// Must have been evaluated and recorded count=1
				if engine.state.counts[key] != 1 {
					t.Fatalf("rule %s was not evaluated despite panic in rule %s", r.Name, panickingRuleName)
				}
			}
		}
	})
}
