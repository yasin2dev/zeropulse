package ruleengine

import "testing"

// TestStateTrackerPurge verifies that Purge removes entries for containers
// no longer in the active set, and that a subsequent Record for the purged
// container starts fresh at 1 (Requirement 3.4).
func TestStateTrackerPurge(t *testing.T) {
	st := NewStateTracker()

	// Build up some state for ("rule", "c1").
	st.Record("rule", "c1", true)
	st.Record("rule", "c1", true)

	// Purge with an active set that does NOT contain "c1".
	active := map[string]struct{}{
		"c2": {},
	}
	st.Purge(active)

	// After purge, the entry for ("rule", "c1") must be gone.
	// A fresh Record(true) should return 1, not 3.
	count := st.Record("rule", "c1", true)
	if count != 1 {
		t.Errorf("expected count 1 after purge and one breach, got %d", count)
	}
}

// TestStateTrackerResetOnFalse verifies that a breach=false call resets the
// consecutive counter to 0 (Requirement 3.2).
func TestStateTrackerResetOnFalse(t *testing.T) {
	st := NewStateTracker()

	// Accumulate several breaches.
	st.Record("rule", "c1", true)
	st.Record("rule", "c1", true)
	st.Record("rule", "c1", true)

	// A non-breach period must reset the counter.
	count := st.Record("rule", "c1", false)
	if count != 0 {
		t.Errorf("expected count 0 after breach=false reset, got %d", count)
	}

	// The next breach should start from 1, not continue from the previous value.
	count = st.Record("rule", "c1", true)
	if count != 1 {
		t.Errorf("expected count 1 after fresh breach post-reset, got %d", count)
	}
}
