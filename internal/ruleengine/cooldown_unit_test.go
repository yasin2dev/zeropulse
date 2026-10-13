package ruleengine

import (
	"testing"
	"time"
)

// TestCooldownAllowsAfterExpiry verifies that after recording a firing at time T,
// IsAllowed at T+cooldownSecs returns true (cooldown has expired).
// Validates: Requirements 4.5
func TestCooldownAllowsAfterExpiry(t *testing.T) {
	const cooldownSecs = 30

	base := time.Date(2024, 1, 1, 0, 0, 0, 0, time.UTC)

	ct := &CooldownTracker{
		lastFired: make(map[stateKey]time.Time),
		now:       func() time.Time { return base },
	}

	// Record a firing at time T.
	ct.Record("high-cpu", "container-1")

	// Advance clock to exactly T + cooldownSecs.
	ct.now = func() time.Time { return base.Add(time.Duration(cooldownSecs) * time.Second) }

	allowed := ct.IsAllowed("high-cpu", "container-1", cooldownSecs)
	if !allowed {
		t.Errorf("expected IsAllowed to return true after cooldown expired (%ds elapsed), got false", cooldownSecs)
	}
}

// TestCooldownPurgeRemovesStaleRecords verifies that after recording for a container,
// calling Purge with an empty active set removes the record so IsAllowed returns true.
// Validates: Requirements 4.5
func TestCooldownPurgeRemovesStaleRecords(t *testing.T) {
	const cooldownSecs = 60

	base := time.Date(2024, 1, 1, 0, 0, 0, 0, time.UTC)

	ct := &CooldownTracker{
		lastFired: make(map[stateKey]time.Time),
		now:       func() time.Time { return base },
	}

	// Record a firing for container "c1".
	ct.Record("high-cpu", "c1")

	// Sanity check: still within cooldown window — should be blocked.
	if ct.IsAllowed("high-cpu", "c1", cooldownSecs) {
		t.Fatal("expected IsAllowed to return false while cooldown is active, got true")
	}

	// Purge with an empty active container set — "c1" should be removed.
	ct.Purge(map[string]struct{}{})

	// After purge the record is gone, so IsAllowed should return true regardless of elapsed time.
	if !ct.IsAllowed("high-cpu", "c1", cooldownSecs) {
		t.Error("expected IsAllowed to return true after Purge removed the record, got false")
	}
}
