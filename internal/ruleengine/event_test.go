package ruleengine

import (
	"testing"

	"pgregory.net/rapid"
)

// TestAnomalyEventFieldCompleteness
// Feature: rule-engine-and-anomaly-detection, Property 5: For any rule violation that produces an AnomalyEvent,
// the event SHALL contain non-zero values for all required fields: Timestamp, ContainerID, ContainerName,
// RuleName, MetricType, CurrentValue, Threshold, ConsecutiveCount, Action, DryRun.
//
// Validates: Requirements 2.1
func TestAnomalyEventFieldCompleteness(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		// Generate non-empty string values for required string fields
		containerID := rapid.StringMatching(`[a-zA-Z0-9]{1,32}`).Draw(t, "containerID")
		containerName := rapid.StringMatching(`[a-zA-Z0-9]{1,32}`).Draw(t, "containerName")
		ruleName := rapid.StringMatching(`[a-zA-Z0-9]{1,32}`).Draw(t, "ruleName")
		metricType := rapid.StringMatching(`[a-zA-Z0-9_]{1,32}`).Draw(t, "metricType")
		action := rapid.StringMatching(`[a-zA-Z]{1,16}`).Draw(t, "action")

		// Generate non-zero float values
		currentValue := rapid.Float64Range(0.001, 1e9).Draw(t, "currentValue")
		threshold := rapid.Float64Range(0.001, 1e9).Draw(t, "threshold")

		// Generate positive consecutive count
		consecutiveCount := rapid.IntRange(1, 1000).Draw(t, "consecutiveCount")

		// dryRun can be either value; we just need the event to be properly formed
		dryRun := rapid.Bool().Draw(t, "dryRun")

		event := NewAnomalyEvent(
			containerID,
			containerName,
			ruleName,
			metricType,
			currentValue,
			threshold,
			consecutiveCount,
			action,
			dryRun,
		)

		// All required fields must be non-zero / non-empty
		if event.Timestamp.IsZero() {
			t.Fatalf("Timestamp is zero")
		}
		if event.ContainerID == "" {
			t.Fatalf("ContainerID is empty")
		}
		if event.ContainerName == "" {
			t.Fatalf("ContainerName is empty")
		}
		if event.RuleName == "" {
			t.Fatalf("RuleName is empty")
		}
		if event.MetricType == "" {
			t.Fatalf("MetricType is empty")
		}
		if event.CurrentValue == 0 {
			t.Fatalf("CurrentValue is zero")
		}
		if event.Threshold == 0 {
			t.Fatalf("Threshold is zero")
		}
		if event.ConsecutiveCount == 0 {
			t.Fatalf("ConsecutiveCount is zero")
		}
		if event.Action == "" {
			t.Fatalf("Action is empty")
		}
		// DryRun is a bool; its zero value (false) is a valid non-zero state.
		// The requirement is that it is set to the value passed in.
		if event.DryRun != dryRun {
			t.Fatalf("DryRun mismatch: expected %v, got %v", dryRun, event.DryRun)
		}
	})
}
// Feature: rule-engine-and-anomaly-detection, Property 6: For any AnomalyEvent, if DryRun is true then Mode
// SHALL equal "dry-run"; if DryRun is false then Mode SHALL equal "remediation".
//
// Validates: Requirements 2.4, 2.5
func TestDryRunModeLabel(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		dryRun := rapid.Bool().Draw(t, "dryRun")

		event := NewAnomalyEvent(
			"cid", "cname", "rule", "CPU_PERCENT",
			50.0, 80.0, 1, "NOTIFY",
			dryRun,
		)

		if dryRun {
			if event.Mode != "dry-run" {
				t.Fatalf("expected Mode=%q when DryRun=true, got %q", "dry-run", event.Mode)
			}
		} else {
			if event.Mode != "remediation" {
				t.Fatalf("expected Mode=%q when DryRun=false, got %q", "remediation", event.Mode)
			}
		}
	})
}
