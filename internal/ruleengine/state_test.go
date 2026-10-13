package ruleengine

import (
	"testing"

	"pgregory.net/rapid"
)

// Feature: rule-engine-and-anomaly-detection, Property 7: For any sequence of Record calls on a StateTracker for the same (RuleName, ContainerID) pair, the returned count after a breach=true call SHALL equal the number of consecutive breach=true calls since the last breach=false call (or since initialization).
func TestStateTrackerConsecutiveCount(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		st := NewStateTracker()

		ruleName := rapid.StringN(1, 32, -1).Draw(t, "ruleName")
		containerID := rapid.StringN(1, 32, -1).Draw(t, "containerID")
		breaches := rapid.SliceOf(rapid.Bool()).Draw(t, "breaches")

		expected := 0
		for i, breach := range breaches {
			if breach {
				expected++
			} else {
				expected = 0
			}
			got := st.Record(ruleName, containerID, breach)
			if got != expected {
				t.Fatalf("step %d: breach=%v: expected count %d, got %d", i, breach, expected, got)
			}
		}
	})
}

// Feature: rule-engine-and-anomaly-detection, Property 8: For any rule with ConsecutivePeriods = N and any sequence of N or more consecutive breaches recorded in StateTracker, the count returned SHALL be >= N.
func TestStateTrackerTriggerThreshold(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		st := NewStateTracker()

		n := rapid.IntRange(1, 20).Draw(t, "n")
		ruleName := rapid.StringN(1, 32, -1).Draw(t, "ruleName")
		containerID := rapid.StringN(1, 32, -1).Draw(t, "containerID")

		var lastCount int
		for i := 0; i < n; i++ {
			lastCount = st.Record(ruleName, containerID, true)
		}

		if lastCount < n {
			t.Fatalf("after %d consecutive breaches, expected count >= %d, got %d", n, n, lastCount)
		}
	})
}
