package ruleengine

import (
	"testing"
	"time"

	"pgregory.net/rapid"
)

// Feature: rule-engine-and-anomaly-detection, Property 9: For any (RuleName, ContainerID) pair where an action was just recorded and CooldownSeconds > 0, calling IsAllowed within CooldownSeconds seconds SHALL return false.
func TestCooldownBlocksWithinWindow(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		ruleName := rapid.StringN(1, 32, -1).Draw(t, "ruleName")
		containerID := rapid.StringN(1, 32, -1).Draw(t, "containerID")
		cooldownSecs := rapid.IntRange(1, 3600).Draw(t, "cooldownSecs")

		ct := NewCooldownTracker()

		// Fix time at T and record the action.
		fixedTime := time.Now()
		ct.now = func() time.Time { return fixedTime }
		ct.Record(ruleName, containerID)

		// Advance to T + (cooldownSecs - 1) seconds — still within the cooldown window.
		ct.now = func() time.Time {
			return fixedTime.Add(time.Duration(cooldownSecs-1) * time.Second)
		}
		allowed := ct.IsAllowed(ruleName, containerID, cooldownSecs)
		if allowed {
			t.Fatalf(
				"cooldownSecs=%d: IsAllowed returned true at T+(cooldownSecs-1)s, expected false",
				cooldownSecs,
			)
		}
	})
}

// Feature: rule-engine-and-anomaly-detection, Property 10: For any (RuleName, ContainerID) pair with CooldownSeconds = 0, IsAllowed SHALL always return true regardless of previous invocations.
func TestZeroCooldownAlwaysAllows(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		ruleName := rapid.StringN(1, 32, -1).Draw(t, "ruleName")
		containerID := rapid.StringN(1, 32, -1).Draw(t, "containerID")
		recordCount := rapid.IntRange(0, 10).Draw(t, "recordCount")

		ct := NewCooldownTracker()

		// Record the action multiple times at various fixed times.
		for i := 0; i < recordCount; i++ {
			offset := time.Duration(i) * time.Second
			ct.now = func() time.Time { return time.Now().Add(offset) }
			ct.Record(ruleName, containerID)
		}

		// With cooldownSecs=0, IsAllowed must always return true.
		allowed := ct.IsAllowed(ruleName, containerID, 0)
		if !allowed {
			t.Fatalf(
				"cooldownSecs=0: IsAllowed returned false after %d Record calls, expected true",
				recordCount,
			)
		}
	})
}
